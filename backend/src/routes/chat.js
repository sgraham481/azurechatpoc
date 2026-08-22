import { Router } from 'express';
import { Readable } from 'node:stream';
import {
  azureHeaders,
  azureUrl,
  buildPayload,
  contentFilterFinish,
  mapAzureError,
  missingConfig,
  safeReadError,
  truncatedBeforeText,
  validateMessages,
} from '../../../api/src/chat-core.mjs';

// Local development entry point. The Azure contract itself lives in
// api/src/chat-core.mjs, shared with the deployed Function so the two cannot
// drift. This file is only the Express adapter around it — plus the SSE
// streaming path, which the deployed Function deliberately does not use.

const router = Router();

router.post('/', async (req, res) => {
  const missing = missingConfig();
  if (missing.length) {
    return res.status(500).json({
      error: 'not_configured',
      message: `Backend is missing ${missing.join(', ')}. Copy backend/.env.example to backend/.env and fill in your Azure values.`,
    });
  }

  const { messages } = req.body ?? {};
  const invalid = validateMessages(messages);
  if (invalid) {
    return res.status(invalid.status).json({ error: invalid.error, message: invalid.message });
  }

  // Streaming is the default; ?stream=false gives the simpler path if the demo misbehaves.
  const stream = req.query.stream !== 'false';

  // Abort the upstream call if the browser hangs up mid-stream.
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  let azureRes;
  try {
    azureRes = await fetch(azureUrl(), {
      method: 'POST',
      headers: azureHeaders(),
      body: JSON.stringify(buildPayload(messages, stream)),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) return; // client left, nothing to report
    console.error('[chat] network error reaching Azure:', err);
    return res.status(502).json({
      error: 'upstream_unreachable',
      message: 'Could not reach Azure OpenAI. Check AZURE_OPENAI_ENDPOINT and your network.',
    });
  }

  if (!azureRes.ok) {
    const detail = await safeReadError(azureRes);
    const mapped = mapAzureError(azureRes.status, detail, azureRes.headers);
    if (mapped.retryAfter) res.set('Retry-After', mapped.retryAfter);
    console.error(`[chat] Azure returned ${azureRes.status}:`, detail.raw?.slice(0, 500));
    return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }

  if (!stream) {
    const data = await azureRes.json();
    if (truncatedBeforeText(data)) {
      return res.status(200).json({
        error: 'budget_exhausted',
        message:
          'The model used its whole token budget on reasoning and returned no text. Raise AZURE_OPENAI_MAX_TOKENS.',
      });
    }
    if (contentFilterFinish(data)) {
      return res.status(200).json({
        error: 'content_filter',
        message: "That response was blocked by Azure's content filter. Try rephrasing the question.",
      });
    }
    return res.json(data);
  }

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  try {
    // Pipe Azure's SSE straight through so the browser renders tokens as they land.
    // Manual loop rather than pipeline(), so a mid-stream failure leaves the
    // response open long enough to emit an error frame the client can render.
    for await (const chunk of Readable.fromWeb(azureRes.body)) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error('[chat] stream failed mid-flight:', err);
    // Headers are already sent, so surface the failure inside the stream itself.
    res.write(`data: ${JSON.stringify({ error: 'stream_failed', message: 'The response stream was interrupted.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

export default router;

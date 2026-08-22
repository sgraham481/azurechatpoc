import { Router } from 'express';
import { Readable } from 'node:stream';

const router = Router();

const SYSTEM_PROMPT = `You are the AI Executive Assistant inside Astrion's Executive Command Center.
You help leadership understand the business — revenue, margin, risks, and broader market conditions.
Be concise and direct. Lead with the answer, then the supporting detail.
Prefer short paragraphs and tight bullet lists over long prose.
If you are asked about a specific number you have not been given, say plainly that the figure
isn't in your current context rather than inventing it.`;

const REQUIRED_ENV = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION',
];

const VALID_ROLES = new Set(['system', 'user', 'assistant']);

router.post('/', async (req, res) => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(500).json({
      error: 'not_configured',
      message: `Backend is missing ${missing.join(', ')}. Copy backend/.env.example to backend/.env and fill in your Azure values.`,
    });
  }

  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Body must be { messages: [{ role, content }] } with at least one message.',
    });
  }

  const badMessage = messages.find(
    (m) => !m || !VALID_ROLES.has(m.role) || typeof m.content !== 'string'
  );
  if (badMessage) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Each message needs a role of system/user/assistant and a string content.',
    });
  }

  // Spec §5: prepend the fixed system prompt unless the caller already sent one.
  const payloadMessages =
    messages[0].role === 'system' ? messages : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  // Streaming is the default; ?stream=false gives the simpler path if the demo misbehaves.
  const stream = req.query.stream !== 'false';

  const url =
    `${process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')}` +
    `/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}` +
    `/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`;

  // Abort the upstream call if the browser hangs up mid-stream.
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  let azureRes;
  try {
    azureRes = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: payloadMessages,
        stream,
        temperature: 0.7,
        max_tokens: 800,
      }),
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
    const blocked = contentFilterFinish(data);
    if (blocked) {
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

async function safeReadError(response) {
  const raw = await response.text().catch(() => '');
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

function contentFilterFinish(data) {
  return data?.choices?.some((c) => c.finish_reason === 'content_filter');
}

function mapAzureError(status, detail, headers) {
  const azureCode = detail.json?.error?.code;
  const azureMessage = detail.json?.error?.message;

  if (status === 401 || status === 403) {
    return {
      status: 500,
      error: 'auth_failed',
      message: 'Auth failed — check AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.',
    };
  }

  if (status === 429) {
    return {
      status: 429,
      error: 'rate_limited',
      message: 'Azure OpenAI is rate limiting this deployment. Wait a moment and try again.',
      retryAfter: headers?.get('retry-after') ?? undefined,
    };
  }

  if (status === 404) {
    return {
      status: 500,
      error: 'deployment_not_found',
      message: `Azure could not find that deployment. Check AZURE_OPENAI_DEPLOYMENT (${process.env.AZURE_OPENAI_DEPLOYMENT}) and AZURE_OPENAI_API_VERSION.`,
    };
  }

  if (azureCode === 'content_filter' || status === 400) {
    return {
      status: 400,
      error: 'content_filter',
      message: azureMessage
        ? `Azure rejected the request: ${azureMessage}`
        : "That request was blocked by Azure's content filter. Try rephrasing.",
    };
  }

  return {
    status: 502,
    error: 'upstream_error',
    message: azureMessage || `Azure OpenAI returned an unexpected ${status}.`,
  };
}

export default router;

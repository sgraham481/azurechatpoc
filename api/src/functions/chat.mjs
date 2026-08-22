import { app } from '@azure/functions';
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
} from '../chat-core.mjs';

/**
 * POST /api/chat — the deployed counterpart to backend/src/routes/chat.js.
 *
 * Streaming note: HTTP streaming through Static Web Apps' managed functions is
 * not dependable, so this returns a single JSON completion. The frontend reads
 * the Content-Type and takes its non-streaming path automatically, which is why
 * no client configuration is needed to deploy.
 */
async function chat(request, context) {
  const missing = missingConfig();
  if (missing.length) {
    return json(500, {
      error: 'not_configured',
      message: `Backend is missing ${missing.join(', ')}. Set these in the Static Web App's application settings.`,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Body must be valid JSON.' });
  }

  const { messages } = body ?? {};
  const invalid = validateMessages(messages);
  if (invalid) {
    return json(invalid.status, { error: invalid.error, message: invalid.message });
  }

  let azureRes;
  try {
    azureRes = await fetch(azureUrl(), {
      method: 'POST',
      headers: azureHeaders(),
      body: JSON.stringify(buildPayload(messages, false)),
    });
  } catch (err) {
    context.error('network error reaching Azure:', err);
    return json(502, {
      error: 'upstream_unreachable',
      message: 'Could not reach Azure AI Foundry. Check AZURE_OPENAI_ENDPOINT.',
    });
  }

  if (!azureRes.ok) {
    const detail = await safeReadError(azureRes);
    const mapped = mapAzureError(azureRes.status, detail, azureRes.headers);
    context.error(`Azure returned ${azureRes.status}:`, detail.raw?.slice(0, 500));
    const headers = mapped.retryAfter ? { 'Retry-After': mapped.retryAfter } : undefined;
    return json(mapped.status, { error: mapped.error, message: mapped.message }, headers);
  }

  const data = await azureRes.json();

  if (truncatedBeforeText(data)) {
    return json(200, {
      error: 'budget_exhausted',
      message:
        'The model used its whole token budget on reasoning and returned no text. Raise AZURE_OPENAI_MAX_TOKENS.',
    });
  }
  if (contentFilterFinish(data)) {
    return json(200, {
      error: 'content_filter',
      message: "That response was blocked by Azure's content filter. Try rephrasing the question.",
    });
  }

  return json(200, data);
}

function json(status, body, extraHeaders) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
    jsonBody: body,
  };
}

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous', // Access is gated by staticwebapp.config.json roles, not a function key.
  route: 'chat',
  handler: chat,
});

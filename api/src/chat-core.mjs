// Framework-agnostic core for the Azure AI Foundry chat call.
//
// Both entry points use this: the local Express route (backend/src/routes/chat.js)
// and the deployed Azure Function (api/src/functions/chat.mjs). Keeping the Azure
// contract in one file is deliberate — the gpt-5 parameter rules below were found
// by probing the live deployment, and two copies would drift.

export const SYSTEM_PROMPT = `You are the AI Executive Assistant inside Astrion's Executive Command Center.
You help leadership understand the business — revenue, margin, risks, and broader market conditions.
Be concise and direct. Lead with the answer, then the supporting detail.
Prefer short paragraphs and tight bullet lists over long prose.
If you are asked about a specific number you have not been given, say plainly that the figure
isn't in your current context rather than inventing it.`;

export const REQUIRED_ENV = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
];

const VALID_ROLES = new Set(['system', 'user', 'assistant']);

/** gpt-5 reasoning models spend part of this budget on hidden reasoning tokens
 *  before emitting any visible text. Measured: budgets of 50/200 returned
 *  finish_reason "length" with empty content. Keep generous headroom. */
export function maxCompletionTokens() {
  return Number(process.env.AZURE_OPENAI_MAX_TOKENS) || 2000;
}

export function missingConfig() {
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

/** Returns null when valid, or { status, error, message } describing the problem. */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      status: 400,
      error: 'bad_request',
      message: 'Body must be { messages: [{ role, content }] } with at least one message.',
    };
  }
  const bad = messages.find((m) => !m || !VALID_ROLES.has(m.role) || typeof m.content !== 'string');
  if (bad) {
    return {
      status: 400,
      error: 'bad_request',
      message: 'Each message needs a role of system/user/assistant and a string content.',
    };
  }
  return null;
}

/** Azure AI Foundry's v1 surface: version-less, deployment goes in the body as
 *  `model`. The portal shows the endpoint with /openai/v1 already appended, so
 *  tolerate that (and a bare host) rather than doubling the path. */
export function azureUrl() {
  const base = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '').replace(/\/openai(\/v1)?$/, '');
  return `${base}/openai/v1/chat/completions`;
}

export function buildPayload(messages, stream) {
  // Prepend the fixed system prompt unless the caller already sent one.
  const payloadMessages =
    messages[0].role === 'system' ? messages : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  return {
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: payloadMessages,
    stream,
    // No `temperature`: gpt-5 models accept only the default (1).
    // `max_tokens` is rejected outright in favour of this field.
    max_completion_tokens: maxCompletionTokens(),
  };
}

export function azureHeaders() {
  return {
    'api-key': process.env.AZURE_OPENAI_API_KEY,
    'Content-Type': 'application/json',
  };
}

export async function safeReadError(response) {
  const raw = await response.text().catch(() => '');
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

export function contentFilterFinish(data) {
  return data?.choices?.some((c) => c.finish_reason === 'content_filter');
}

/** gpt-5 can burn the entire completion budget on hidden reasoning, returning a
 *  200 with finish_reason "length" and empty content. Without this it surfaces as
 *  a blank assistant bubble, which reads like a bug rather than a config issue. */
export function truncatedBeforeText(data) {
  return data?.choices?.some(
    (c) => c.finish_reason === 'length' && !(c.message?.content || '').trim()
  );
}

export function mapAzureError(status, detail, headers) {
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
      message: `Azure could not find that deployment. Check AZURE_OPENAI_DEPLOYMENT (${process.env.AZURE_OPENAI_DEPLOYMENT}) and AZURE_OPENAI_ENDPOINT.`,
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

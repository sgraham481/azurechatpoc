import { app } from '@azure/functions';
import { missingConfig } from '../chat-core.mjs';

// Mirrors GET /api/health from the local Express server, so the same smoke test
// works against localhost and the deployed site.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ({
    status: 200,
    jsonBody: { ok: true, configured: missingConfig().length === 0 },
  }),
});

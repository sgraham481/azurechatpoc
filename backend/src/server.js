import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.js';
import { missingConfig } from '../../api/src/chat-core.mjs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: missingConfig().length === 0 });
});

app.use('/api/chat', chatRouter);

// Anything unmatched under /api is a 404 as JSON, not Express' HTML page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
  const missing = missingConfig();
  console.log(`\n  Backend listening on http://localhost:${PORT}`);
  if (missing.length) {
    console.log(`  ⚠️  Missing env vars: ${missing.join(', ')}`);
    console.log(`     Copy backend/.env.example to backend/.env and fill these in.`);
    console.log(`     The server runs fine without them — /api/chat will return a clear 500 until they're set.\n`);
  } else {
    console.log(`  ✅ Azure OpenAI config loaded (deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT})\n`);
  }
});

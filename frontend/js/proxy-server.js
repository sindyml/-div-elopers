// proxy-server.js
// Run with: npm run proxy
// Requires: npm install express cors dotenv

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app  = express();
const PORT = 3001;

app.use(cors({ origin: ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8082', 'http://127.0.0.1:8082'] }));
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            apiKey,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[Proxy] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Anthropic proxy running at http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/api/chat`);
});

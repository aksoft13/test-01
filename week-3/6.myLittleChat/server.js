// ============================================================
// My Little Chat - Express server
// Serves index.html and proxies chat requests to OpenAI.
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// OpenAI client
// ------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// System prompt: friendly, casual Korean chat (친구처럼 텍스트하는 톤)
const SYSTEM_PROMPT = [
  '너는 사용자의 아주 친한 한국인 친구야.',
  '항상 반말로, 가볍고 편안한 카카오톡 채팅 말투로 대답해.',
  '문장은 짧고 자연스럽게, 가끔 "ㅋㅋ", "ㅎㅎ", "~", "!" 같은 표현을 써도 좋아.',
  '이모지는 과하지 않게 한두 개 정도만 섞어도 좋아.',
  '너무 formal하거나 설명조로 길게 말하지 말고, 진짜 친구가 톡 보내는 느낌으로 답해.',
  '한국어로만 답해.'
].join(' ');

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));

// Simple CORS so the frontend can call /api/chat from anywhere
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve static files (index.html, etc.) from this directory
app.use(express.static(path.join(__dirname)));

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// Chat completion endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'message는 비어있지 않은 문자열이어야 합니다.'
      });
    }

    // Normalize and cap history to recent messages (safety net)
    const safeHistory = Array.isArray(history) ? history : [];
    const normalizedHistory = safeHistory
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-10);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...normalizedHistory,
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.9,
      max_tokens: 300
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      '음... 뭐라고 말해야 할지 모르겠네 ㅎㅎ';

    return res.json({ reply });
  } catch (err) {
    console.error('[POST /api/chat] error:', err);
    return res.status(500).json({
      success: false,
      message: 'AI 응답을 가져오는 중 오류가 발생했습니다.',
      error: err?.message || 'unknown_error'
    });
  }
});

// ------------------------------------------------------------
// Error handler (last)
// ------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ------------------------------------------------------------
// Startup
// ------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`My Little Chat server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

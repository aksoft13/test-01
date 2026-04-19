// ============================================================
// server.js - Balance Game API Server
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Database Connection (with .trim() for trailing newline safety)
// ------------------------------------------------------------
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ------------------------------------------------------------
// DB Initialization (Lazy Init for serverless cold start)
// ------------------------------------------------------------
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      thumbnail_url TEXT,
      vote_a INTEGER DEFAULT 0,
      vote_b INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0`);

  // Seed 5 example games if table is empty
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM games');
  if (rows[0].count === 0) {
    const seeds = [
      ['월급 500만원 + 주7일 출근', '월급 300만원 + 주4일 출근'],
      ['평생 라면만 먹기', '평생 치킨 못 먹기'],
      ['평생 여름만 사는 세상', '평생 겨울만 사는 세상'],
      ['투명인간이 되는 능력', '하늘을 나는 능력'],
      ['10년 전으로 돌아가기', '10년 뒤 미래 보기'],
    ];

    const insertQuery = `
      INSERT INTO games (option_a, option_b) VALUES ($1, $2)
    `;

    for (const [a, b] of seeds) {
      await pool.query(insertQuery, [a, b]);
    }
  }

  dbInitialized = true;
}

// Apply lazy init middleware to all /api routes
app.use('/api', async (_req, _res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    next(err);
  }
});

// ------------------------------------------------------------
// Helper: Format a game row with percentages
// ------------------------------------------------------------
function formatGame(row) {
  const total = row.vote_a + row.vote_b;
  return {
    id: row.id,
    option_a: row.option_a,
    option_b: row.option_b,
    thumbnail_url: row.thumbnail_url,
    vote_a: row.vote_a,
    vote_b: row.vote_b,
    total,
    percent_a: total === 0 ? 0 : Math.round((row.vote_a / total) * 100),
    percent_b: total === 0 ? 0 : Math.round((row.vote_b / total) * 100),
    like_count: row.like_count || 0,
    is_best: (row.like_count || 0) >= 5,
    created_at: row.created_at,
  };
}

// ------------------------------------------------------------
// Helper: Generate thumbnail via fal.ai
// ------------------------------------------------------------
async function generateThumbnail(optionA, optionB) {
  try {
    const falKey = (process.env.FAL_KEY || '').trim();
    if (!falKey) return null;

    const response = await fetch('https://fal.run/fal-ai/fast-lightning-sdxl', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `balance game thumbnail, two choices: '${optionA}' versus '${optionB}', colorful split screen design, modern graphic style, bold text, vibrant colors`,
        image_size: 'landscape_4_3',
        num_inference_steps: 4,
        num_images: 1,
      }),
    });

    if (!response.ok) {
      console.error('fal.ai error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.images?.[0]?.url || null;
  } catch (err) {
    console.error('fal.ai thumbnail generation failed:', err.message);
    return null;
  }
}

// ============================================================
// API Routes
// ============================================================

// GET /api/games - List all games with sorting
app.get('/api/games', async (req, res) => {
  try {
    const sort = req.query.sort || 'latest';

    let orderClause;
    switch (sort) {
      case 'popular':
        orderClause = 'ORDER BY (vote_a + vote_b + like_count) DESC';
        break;
      case 'oldest':
        orderClause = 'ORDER BY created_at ASC';
        break;
      case 'latest':
      default:
        orderClause = 'ORDER BY created_at DESC';
        break;
    }

    const { rows } = await pool.query(`SELECT * FROM games ${orderClause}`);
    res.json({ success: true, data: rows.map(formatGame) });
  } catch (err) {
    console.error('GET /api/games error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch games' });
  }
});

// GET /api/games/:id - Get single game
app.get('/api/games/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    res.json({ success: true, data: formatGame(rows[0]) });
  } catch (err) {
    console.error('GET /api/games/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch game' });
  }
});

// POST /api/games - Create a new game
app.post('/api/games', async (req, res) => {
  try {
    const { option_a, option_b } = req.body;

    // Validation
    if (!option_a || !option_b) {
      return res.status(400).json({ success: false, message: 'option_a and option_b are required' });
    }
    if (option_a.length > 100 || option_b.length > 100) {
      return res.status(400).json({ success: false, message: 'Each option must be 100 characters or less' });
    }

    // Generate thumbnail (gracefully handle failure)
    const thumbnailUrl = await generateThumbnail(option_a, option_b);

    // Insert into DB
    const { rows } = await pool.query(
      'INSERT INTO games (option_a, option_b, thumbnail_url) VALUES ($1, $2, $3) RETURNING *',
      [option_a, option_b, thumbnailUrl]
    );

    res.status(201).json({ success: true, data: formatGame(rows[0]) });
  } catch (err) {
    console.error('POST /api/games error:', err);
    res.status(500).json({ success: false, message: 'Failed to create game' });
  }
});

// POST /api/games/:id/vote - Vote on a game
app.post('/api/games/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { choice } = req.body;

    // Validate choice
    if (choice !== 'a' && choice !== 'b') {
      return res.status(400).json({ success: false, message: 'choice must be "a" or "b"' });
    }

    const column = choice === 'a' ? 'vote_a' : 'vote_b';
    const { rows } = await pool.query(
      `UPDATE games SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    res.json({ success: true, data: formatGame(rows[0]) });
  } catch (err) {
    console.error('POST /api/games/:id/vote error:', err);
    res.status(500).json({ success: false, message: 'Failed to register vote' });
  }
});

// POST /api/games/:id/like - Like a game
app.post('/api/games/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE games SET like_count = like_count + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }
    res.json({ success: true, data: formatGame(rows[0]) });
  } catch (err) {
    console.error('POST /api/games/:id/like error:', err);
    res.status(500).json({ success: false, message: 'Failed to like game' });
  }
});

// ------------------------------------------------------------
// Error Handling Middleware
// ------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ------------------------------------------------------------
// Start Server (Local) / Export (Vercel)
// ------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

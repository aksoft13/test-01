// ============================================
// Anonymous / Praise Board - Server
// ============================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// --- App Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// --- Lazy DB Initialization ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      empathy_count INTEGER DEFAULT 0,
      cheer_count INTEGER DEFAULT 0,
      praise_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  dbInitialized = true;
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB init middleware for /api routes
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('Database initialization failed:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ============================================
// API Routes
// ============================================

// GET /api/posts - Retrieve posts with sorting
app.get('/api/posts', async (req, res) => {
  try {
    const { sort } = req.query;
    let query = '';
    const totalReaction = '(empathy_count + cheer_count + praise_count)';

    switch (sort) {
      case 'oldest':
        query = `SELECT * FROM posts ORDER BY created_at ASC`;
        break;
      case 'empathy':
        query = `SELECT * FROM posts ORDER BY ${totalReaction} DESC`;
        break;
      case 'best':
        query = `SELECT * FROM posts WHERE ${totalReaction} >= 10 ORDER BY ${totalReaction} DESC`;
        break;
      case 'latest':
      default:
        query = `SELECT * FROM posts ORDER BY created_at DESC`;
        break;
    }

    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

// POST /api/posts - Create a new post
app.post('/api/posts', async (req, res) => {
  try {
    const { category, content } = req.body;

    // Validation
    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'Category and content are required' });
    }

    if (content.length > 500) {
      return res.status(400).json({ success: false, message: 'Content must be 500 characters or less' });
    }

    const result = await pool.query(
      `INSERT INTO posts (category, content) VALUES ($1, $2) RETURNING *`,
      [category, content]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ success: false, message: 'Failed to create post' });
  }
});

// PATCH /api/posts/:id/react - Add a reaction to a post
app.patch('/api/posts/:id/react', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;

    const validTypes = ['empathy', 'cheer', 'praise'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction type. Must be one of: empathy, cheer, praise',
      });
    }

    const column = `${type}_count`;
    const result = await pool.query(
      `UPDATE posts SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error reacting to post:', err);
    res.status(500).json({ success: false, message: 'Failed to react to post' });
  }
});

// ============================================
// Error Handling
// ============================================

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ============================================
// Server Startup (Local + Vercel dual-mode)
// ============================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

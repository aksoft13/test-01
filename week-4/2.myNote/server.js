require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// ========================================
// App & DB Setup
// ========================================

const app = express();
const PORT = process.env.PORT || 3000;

const DB_URL = process.env.DB_URL;

const pool = new Pool({
  connectionString: DB_URL.trim(),
  ssl: { rejectUnauthorized: false },
});

// ========================================
// Lazy DB Init (cold-start safe)
// ========================================

let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// ========================================
// Middleware
// ========================================

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Ensure DB is ready before any /api call
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ========================================
// Helper: map DB row → client shape
// ========================================

function toClient(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

// ========================================
// API Routes
// ========================================

// GET /api/notes — list all notes, newest first
app.get('/api/notes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, content, updated_at FROM notes ORDER BY updated_at DESC'
    );
    res.json({ data: rows.map(toClient) });
  } catch (err) {
    console.error('GET /api/notes error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notes' });
  }
});

// POST /api/notes — create a new note
app.post('/api/notes', async (req, res) => {
  try {
    const { title = '', content = '' } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING id, title, content, updated_at',
      [title, content]
    );
    res.status(201).json({ data: toClient(rows[0]) });
  } catch (err) {
    console.error('POST /api/notes error:', err);
    res.status(500).json({ success: false, message: 'Failed to create note' });
  }
});

// PUT /api/notes/:id — update a note
app.put('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const { rows, rowCount } = await pool.query(
      'UPDATE notes SET title = $1, content = $2, updated_at = NOW() WHERE id = $3 RETURNING id, title, content, updated_at',
      [title, content, id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }
    res.json({ data: toClient(rows[0]) });
  } catch (err) {
    console.error('PUT /api/notes/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update note' });
  }
});

// DELETE /api/notes/:id — delete a note
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM notes WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/notes/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete note' });
  }
});

// ========================================
// Local / Vercel Dual-Mode
// ========================================

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;

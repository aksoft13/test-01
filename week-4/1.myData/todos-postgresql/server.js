require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB Connection ---
const DB_URL = process.env.DB_URL;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- DB Lazy Init ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      done BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// DB init middleware for /api routes
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// --- Helper: map DB row to client shape ---
function mapTodo(row) {
  return {
    id: row.id,
    filename: row.id,
    title: row.title,
    content: row.content,
    completed: row.done,
    created_at: row.created_at,
  };
}

// --- API Routes ---

// GET /api/todos - list all todos (newest first)
app.get('/api/todos', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM todos ORDER BY created_at DESC');
    res.json({ data: result.rows.map(mapTodo) });
  } catch (err) {
    console.error('GET /api/todos error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch todos' });
  }
});

// POST /api/todos - create a new todo
app.post('/api/todos', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    const result = await pool.query(
      'INSERT INTO todos (title) VALUES ($1) RETURNING *',
      [title.trim()]
    );
    res.status(201).json({ data: mapTodo(result.rows[0]) });
  } catch (err) {
    console.error('POST /api/todos error:', err);
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// PATCH /api/todos/:filename - toggle done
app.patch('/api/todos/:filename', async (req, res) => {
  try {
    const id = parseInt(req.params.filename, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid todo id' });
    }
    const result = await pool.query(
      'UPDATE todos SET done = NOT done WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }
    res.json({ data: mapTodo(result.rows[0]) });
  } catch (err) {
    console.error('PATCH /api/todos/:filename error:', err);
    res.status(500).json({ success: false, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:filename - delete a todo
app.delete('/api/todos/:filename', async (req, res) => {
  try {
    const id = parseInt(req.params.filename, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid todo id' });
    }
    const result = await pool.query('DELETE FROM todos WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }
    res.json({ success: true, message: 'Todo deleted' });
  } catch (err) {
    console.error('DELETE /api/todos/:filename error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete todo' });
  }
});

// --- Local / Vercel dual-mode ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;

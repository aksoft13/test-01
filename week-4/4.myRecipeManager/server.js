const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Database ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      name_en VARCHAR(100),
      quantity DECIMAL(10,2) DEFAULT 0,
      unit VARCHAR(20),
      category VARCHAR(50),
      expiry DATE,
      storage VARCHAR(20),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      ingredients JSONB DEFAULT '[]',
      instructions TEXT,
      category VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  dbInitialized = true;
  console.log('Database tables initialized');
}

// DB init middleware for /api routes
app.use('/api', async (_req, _res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    _res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// =====================
// Ingredients API
// =====================

// GET /api/ingredients — list all, with optional ?search= and ?category=
app.get('/api/ingredients', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM ingredients';
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR name_en ILIKE $${params.length} OR notes ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ingredients' });
  }
});

// POST /api/ingredients — create
app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, name_en, quantity, unit, category, expiry, storage, notes } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const result = await pool.query(
      `INSERT INTO ingredients (name, name_en, quantity, unit, category, expiry, storage, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, name_en || null, quantity || 0, unit || null, category || null, expiry || null, storage || null, notes || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create ingredient' });
  }
});

// PUT /api/ingredients/:id — update
app.put('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_en, quantity, unit, category, expiry, storage, notes } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const result = await pool.query(
      `UPDATE ingredients
       SET name = $1, name_en = $2, quantity = $3, unit = $4, category = $5, expiry = $6, storage = $7, notes = $8
       WHERE id = $9
       RETURNING *`,
      [name, name_en || null, quantity || 0, unit || null, category || null, expiry || null, storage || null, notes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update ingredient' });
  }
});

// DELETE /api/ingredients/:id — delete
app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ingredients WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    res.json({ success: true, data: result.rows[0], message: 'Ingredient deleted' });
  } catch (err) {
    console.error('DELETE /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete ingredient' });
  }
});

// =====================
// Recipes API
// =====================

// GET /api/recipes — list all, with optional ?search= and ?category=
app.get('/api/recipes', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM recipes';
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title ILIKE $${params.length} OR instructions ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recipes' });
  }
});

// POST /api/recipes — create
app.post('/api/recipes', async (req, res) => {
  try {
    const { title, ingredients, instructions, category } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const ingredientsJson = JSON.stringify(ingredients || []);

    const result = await pool.query(
      `INSERT INTO recipes (title, ingredients, instructions, category)
       VALUES ($1, $2::jsonb, $3, $4)
       RETURNING *`,
      [title, ingredientsJson, instructions || null, category || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create recipe' });
  }
});

// PUT /api/recipes/:id — update
app.put('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, ingredients, instructions, category } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const ingredientsJson = JSON.stringify(ingredients || []);

    const result = await pool.query(
      `UPDATE recipes
       SET title = $1, ingredients = $2::jsonb, instructions = $3, category = $4
       WHERE id = $5
       RETURNING *`,
      [title, ingredientsJson, instructions || null, category || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update recipe' });
  }
});

// DELETE /api/recipes/:id — delete
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM recipes WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    res.json({ success: true, data: result.rows[0], message: 'Recipe deleted' });
  } catch (err) {
    console.error('DELETE /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete recipe' });
  }
});

// =====================
// Categories API
// =====================

// GET /api/categories/ingredients — distinct ingredient categories
app.get('/api/categories/ingredients', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category'
    );
    const categories = result.rows.map(r => r.category);
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('GET /api/categories/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ingredient categories' });
  }
});

// GET /api/categories/recipes — distinct recipe categories
app.get('/api/categories/recipes', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM recipes WHERE category IS NOT NULL ORDER BY category'
    );
    const categories = result.rows.map(r => r.category);
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('GET /api/categories/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recipe categories' });
  }
});

// =====================
// Recommend API
// =====================

// GET /api/recommend — recommend recipes based on available fridge ingredients
app.get('/api/recommend', async (req, res) => {
  try {
    const [ingredientsResult, recipesResult] = await Promise.all([
      pool.query('SELECT name, name_en FROM ingredients'),
      pool.query('SELECT * FROM recipes ORDER BY created_at DESC'),
    ]);

    const fridgeNames = new Set(
      ingredientsResult.rows.flatMap(r =>
        [r.name?.toLowerCase(), r.name_en?.toLowerCase()].filter(Boolean)
      )
    );

    const recommended = recipesResult.rows.map(recipe => {
      const recipeIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const matched = recipeIngredients.filter(ing => fridgeNames.has(ing.toLowerCase()));
      const missing = recipeIngredients.filter(ing => !fridgeNames.has(ing.toLowerCase()));
      const matchCount = matched.length;
      const totalCount = recipeIngredients.length;
      const matchRate = totalCount > 0 ? Math.round((matchCount / totalCount) * 100) : 0;
      return { ...recipe, matchCount, totalCount, matchRate, matched, missing };
    });

    recommended.sort((a, b) => b.matchRate - a.matchRate || b.matchCount - a.matchCount);

    res.json({ success: true, data: recommended, fridgeCount: fridgeNames.size });
  } catch (err) {
    console.error('GET /api/recommend error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
  }
});

// =====================
// SPA Fallback
// =====================
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =====================
// Start Server / Export
// =====================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

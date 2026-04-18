require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Database ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- OpenAI ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      difficulty VARCHAR(20) DEFAULT '보통',
      cook_time INTEGER DEFAULT 30,
      favorited BOOLEAN DEFAULT false,
      ai_generated BOOLEAN DEFAULT false,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add new columns if they don't exist (for existing tables)
  const alterQueries = [
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT '보통'`,
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time INTEGER DEFAULT 30`,
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS favorited BOOLEAN DEFAULT false`,
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false`,
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT`,
    `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS servings INTEGER DEFAULT 1`,
  ];
  for (const q of alterQueries) {
    try {
      await pool.query(q);
    } catch (e) {
      // ignore if column already exists
    }
  }

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

// GET /api/ingredients
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

// POST /api/ingredients
app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, name_en, quantity, unit, category, expiry, storage, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });
    const result = await pool.query(
      `INSERT INTO ingredients (name, name_en, quantity, unit, category, expiry, storage, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, name_en || null, quantity || 0, unit || null, category || null, expiry || null, storage || null, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create ingredient' });
  }
});

// PUT /api/ingredients/:id
app.put('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_en, quantity, unit, category, expiry, storage, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });
    const result = await pool.query(
      `UPDATE ingredients SET name=$1, name_en=$2, quantity=$3, unit=$4, category=$5, expiry=$6, storage=$7, notes=$8
       WHERE id=$9 RETURNING *`,
      [name, name_en || null, quantity || 0, unit || null, category || null, expiry || null, storage || null, notes || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update ingredient' });
  }
});

// DELETE /api/ingredients/:id
app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ingredients WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: result.rows[0], message: 'Ingredient deleted' });
  } catch (err) {
    console.error('DELETE /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete ingredient' });
  }
});

// =====================
// Recipes API
// =====================

// GET /api/recipes
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

// POST /api/recipes
app.post('/api/recipes', async (req, res) => {
  try {
    const { title, ingredients, instructions, category, difficulty, cook_time, servings, ai_generated, image_url } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });
    const ingredientsJson = JSON.stringify(ingredients || []);
    const result = await pool.query(
      `INSERT INTO recipes (title, ingredients, instructions, category, difficulty, cook_time, servings, ai_generated, image_url)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title, ingredientsJson, instructions || null, category || null,
       difficulty || '보통', cook_time || 30, servings || 1, ai_generated || false, image_url || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create recipe' });
  }
});

// PUT /api/recipes/:id
app.put('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, ingredients, instructions, category, difficulty, cook_time, servings, image_url } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });
    const ingredientsJson = JSON.stringify(ingredients || []);
    const result = await pool.query(
      `UPDATE recipes SET title=$1, ingredients=$2::jsonb, instructions=$3, category=$4,
       difficulty=$5, cook_time=$6, servings=$7, image_url=$8 WHERE id=$9 RETURNING *`,
      [title, ingredientsJson, instructions || null, category || null,
       difficulty || '보통', cook_time || 30, servings || 1, image_url || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Recipe not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update recipe' });
  }
});

// DELETE /api/recipes/:id
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM recipes WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Recipe not found' });
    res.json({ success: true, data: result.rows[0], message: 'Recipe deleted' });
  } catch (err) {
    console.error('DELETE /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete recipe' });
  }
});

// POST /api/recipes/:id/favorite - toggle favorited
app.post('/api/recipes/:id/favorite', async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query('SELECT favorited FROM recipes WHERE id=$1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ success: false, message: 'Recipe not found' });
    const newFavorited = !current.rows[0].favorited;
    const result = await pool.query(
      'UPDATE recipes SET favorited=$1 WHERE id=$2 RETURNING *',
      [newFavorited, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recipes/:id/favorite error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to toggle favorite' });
  }
});

// GET /api/recipes/:id/export - return markdown
app.get('/api/recipes/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM recipes WHERE id=$1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Recipe not found' });
    const recipe = result.rows[0];

    const formatIngredient = (ing) => {
      if (typeof ing === 'string') return ing;
      const name = ing.name || '';
      let qty = ing.quantity || '';
      let unit = ing.unit || '';
      // Water always in ml
      if (name === '물' || name.toLowerCase() === 'water') {
        if (unit === 'L' || unit === 'l') { qty = Math.round(parseFloat(qty) * 1000); unit = 'ml'; }
        else if (!unit) unit = 'ml';
      }
      return qty ? `${name} (${qty}${unit})` : name;
    };
    const ingredientsList = (recipe.ingredients || [])
      .map(ing => `- ${formatIngredient(ing)}`)
      .join('\n');

    const createdAt = recipe.created_at
      ? new Date(recipe.created_at).toLocaleDateString('ko-KR')
      : '알 수 없음';

    const markdown = `# ${recipe.title}

> ${recipe.category || '기타'} | 난이도: ${recipe.difficulty || '보통'} | 조리시간: ${recipe.cook_time || 30}분

## 재료
${ingredientsList || '- (재료 없음)'}

## 조리 방법
${recipe.instructions || '(조리 방법 없음)'}

---
*생성일: ${createdAt}*
`;

    res.json({ success: true, markdown, filename: `${recipe.title}.md` });
  } catch (err) {
    console.error('GET /api/recipes/:id/export error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to export recipe' });
  }
});

// =====================
// Categories API
// =====================

app.get('/api/categories/ingredients', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category'
    );
    res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (err) {
    console.error('GET /api/categories/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ingredient categories' });
  }
});

app.get('/api/categories/recipes', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM recipes WHERE category IS NOT NULL ORDER BY category'
    );
    res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (err) {
    console.error('GET /api/categories/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recipe categories' });
  }
});

// =====================
// Recommend API
// =====================

app.get('/api/recommend', async (req, res) => {
  try {
    const [ingredientsResult, recipesResult] = await Promise.all([
      pool.query('SELECT name, name_en, quantity, unit FROM ingredients'),
      pool.query('SELECT * FROM recipes ORDER BY created_at DESC'),
    ]);

    const fridgeIngredients = ingredientsResult.rows;
    const fridgeNames = new Set(
      fridgeIngredients.flatMap(r =>
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
// AI Recommend API
// =====================

app.post('/api/ai-recommend', async (req, res) => {
  try {
    const ingredientsResult = await pool.query(
      'SELECT name, name_en, quantity, unit FROM ingredients ORDER BY name'
    );
    const fridgeIngredients = ingredientsResult.rows;

    if (fridgeIngredients.length === 0) {
      return res.status(400).json({ success: false, message: '냉장고에 재료가 없습니다. 재료를 먼저 추가해주세요.' });
    }

    const ingredientsList = fridgeIngredients
      .map(ing => {
        let line = `- ${ing.name}`;
        if (ing.name_en) line += ` (${ing.name_en})`;
        if (ing.quantity) line += `: ${ing.quantity}${ing.unit || ''}`;
        return line;
      })
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `You are a helpful Korean chef. Given a list of fridge ingredients, suggest 3 recipes.
    Response must be valid JSON array with exactly 3 recipes. Each recipe must have:
    - title (string, Korean name)
    - category (one of: 한식, 양식, 중식, 일식, 기타)
    - difficulty (one of: 쉬움, 보통, 어려움)
    - cook_time (integer, minutes)
    - servings (integer, base serving size the recipe quantities are based on, typically 2)
    - ingredients (array of strings - ingredient names needed)
    - required_ingredients (array of objects with name, quantity, unit - all ingredients needed for the base servings)
    - missing_ingredients (array of objects with name, quantity, unit - ingredients NOT in fridge)
    - instructions (string, Korean step-by-step)
    - description (string, short Korean description)
    Important: water (물) quantities must always use ml unit (e.g. 200ml, 500ml).
    Respond ONLY with valid JSON array, no markdown.`
      }, {
        role: 'user',
        content: `냉장고 재료 목록:\n${ingredientsList}\n\n위 재료들로 만들 수 있는 레시피 3개를 추천해주세요. 부족한 재료도 표시해주세요.`
      }],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content || '';
    let recipes;
    try {
      recipes = JSON.parse(content);
    } catch (parseErr) {
      // Try to extract JSON array from response
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        recipes = JSON.parse(match[0]);
      } else {
        console.error('AI response parse error:', content);
        return res.status(500).json({ success: false, message: 'AI 응답을 파싱하는데 실패했습니다.' });
      }
    }

    res.json({ success: true, data: recipes, fridgeIngredients });
  } catch (err) {
    console.error('POST /api/ai-recommend error:', err.message);
    res.status(500).json({ success: false, message: 'AI 추천 중 오류가 발생했습니다: ' + err.message });
  }
});

// PATCH /api/ingredients/:id/quantity - quick +/- update
app.patch('/api/ingredients/:id/quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { delta, quantity } = req.body;
    let result;
    if (delta !== undefined) {
      result = await pool.query(
        'UPDATE ingredients SET quantity = GREATEST(0, quantity + $1) WHERE id = $2 RETURNING *',
        [delta, id]
      );
    } else if (quantity !== undefined) {
      result = await pool.query(
        'UPDATE ingredients SET quantity = GREATEST(0, $1) WHERE id = $2 RETURNING *',
        [quantity, id]
      );
    } else {
      return res.status(400).json({ success: false, message: 'delta or quantity required' });
    }
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/ingredients/:id/quantity error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update quantity' });
  }
});

// POST /api/recipes/:id/cook - deduct ingredients from fridge after cooking
app.post('/api/recipes/:id/cook', async (req, res) => {
  try {
    const { deductions } = req.body; // [{id, quantity}]
    if (!deductions || !Array.isArray(deductions)) {
      return res.status(400).json({ success: false, message: 'deductions array required' });
    }
    const updated = [];
    for (const { id, quantity } of deductions) {
      const result = await pool.query(
        'UPDATE ingredients SET quantity = GREATEST(0, quantity - $1) WHERE id = $2 RETURNING *',
        [quantity, id]
      );
      if (result.rows.length > 0) updated.push(result.rows[0]);
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('POST /api/recipes/:id/cook error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to process cooking' });
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

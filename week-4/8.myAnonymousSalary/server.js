// ============================================================
// myAnonymousSalary - Anonymous Salary/Expense Comparison Server
// ============================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----- Database Connection (lazy init for serverless) -----
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS salary_data (
      id SERIAL PRIMARY KEY,
      monthly_salary INTEGER NOT NULL,
      monthly_expense INTEGER NOT NULL,
      food_expense INTEGER DEFAULT 0,
      housing_expense INTEGER DEFAULT 0,
      transport_expense INTEGER DEFAULT 0,
      subscription_expense INTEGER DEFAULT 0,
      other_expense INTEGER DEFAULT 0,
      region VARCHAR(20) NOT NULL,
      job_category VARCHAR(30) NOT NULL,
      years_of_experience INTEGER NOT NULL,
      subscriptions JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  dbInitialized = true;
  console.log('[DB] Table salary_data ready.');
}

// ----- Middleware -----
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB init middleware for API routes
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('[DB] Initialization failed:', err.message);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ============================================================
// API Endpoints
// ============================================================

// 1. POST /api/submit - Submit salary/expense data
app.post('/api/submit', async (req, res) => {
  try {
    const {
      monthly_salary,
      monthly_expense,
      food_expense = 0,
      housing_expense = 0,
      transport_expense = 0,
      subscription_expense = 0,
      other_expense = 0,
      region,
      job_category,
      years_of_experience,
      subscriptions = [],
    } = req.body;

    // Validation
    if (!monthly_salary || !monthly_expense || !region || !job_category || years_of_experience === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: monthly_salary, monthly_expense, region, job_category, years_of_experience',
      });
    }

    const result = await pool.query(
      `INSERT INTO salary_data
        (monthly_salary, monthly_expense, food_expense, housing_expense, transport_expense,
         subscription_expense, other_expense, region, job_category, years_of_experience, subscriptions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        monthly_salary, monthly_expense, food_expense, housing_expense, transport_expense,
        subscription_expense, other_expense, region, job_category, years_of_experience,
        JSON.stringify(subscriptions),
      ]
    );

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('[POST /api/submit]', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit data' });
  }
});

// 2. GET /api/stats - Overall statistics
app.get('/api/stats', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_count,
        ROUND(AVG(monthly_salary))::int AS avg_salary,
        ROUND(AVG(monthly_expense))::int AS avg_expense,
        ROUND(AVG(food_expense))::int AS avg_food,
        ROUND(AVG(housing_expense))::int AS avg_housing,
        ROUND(AVG(transport_expense))::int AS avg_transport,
        ROUND(AVG(subscription_expense))::int AS avg_subscription,
        ROUND(AVG(other_expense))::int AS avg_other,
        ROUND(STDDEV(monthly_salary))::int AS stddev_salary,
        ROUND(STDDEV(monthly_expense))::int AS stddev_expense
      FROM salary_data
    `);

    // Calculate median salary separately
    const medianResult = await pool.query(`
      SELECT monthly_salary
      FROM salary_data
      ORDER BY monthly_salary
      LIMIT 1
      OFFSET (SELECT COUNT(*) FROM salary_data) / 2
    `);

    const stats = result.rows[0];
    stats.median_salary = medianResult.rows.length > 0 ? medianResult.rows[0].monthly_salary : 0;

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[GET /api/stats]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// 3. GET /api/compare - Compare user to all data
app.get('/api/compare', async (req, res) => {
  try {
    const { salary, expense, region, job_category, years } = req.query;

    if (!salary || !expense) {
      return res.status(400).json({
        success: false,
        message: 'Required query params: salary, expense',
      });
    }

    const salaryNum = parseInt(salary, 10);
    const expenseNum = parseInt(expense, 10);

    // Salary percentile: % of people earning LESS than user
    const salaryPercentile = await pool.query(
      `SELECT
        CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(COUNT(*) FILTER (WHERE monthly_salary < $1)::numeric / COUNT(*)::numeric * 100, 1)
        END AS percentile
      FROM salary_data`,
      [salaryNum]
    );

    // Expense percentile: % of people spending MORE than user (higher = user spends less)
    const expensePercentile = await pool.query(
      `SELECT
        CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(COUNT(*) FILTER (WHERE monthly_expense > $1)::numeric / COUNT(*)::numeric * 100, 1)
        END AS percentile
      FROM salary_data`,
      [expenseNum]
    );

    // Region averages
    const regionStats = await pool.query(
      `SELECT
        ROUND(AVG(monthly_salary))::int AS region_avg_salary,
        ROUND(AVG(monthly_expense))::int AS region_avg_expense
      FROM salary_data
      WHERE region = $1`,
      [region || '']
    );

    // Job category averages
    const jobStats = await pool.query(
      `SELECT
        ROUND(AVG(monthly_salary))::int AS job_avg_salary,
        ROUND(AVG(monthly_expense))::int AS job_avg_expense
      FROM salary_data
      WHERE job_category = $1`,
      [job_category || '']
    );

    // Similar people count (same region + job + +/-2 years experience)
    const yearsNum = parseInt(years, 10) || 0;
    const similarCount = await pool.query(
      `SELECT COUNT(*)::int AS similar_count
      FROM salary_data
      WHERE region = $1 AND job_category = $2
        AND years_of_experience BETWEEN $3 AND $4`,
      [region || '', job_category || '', yearsNum - 2, yearsNum + 2]
    );

    res.json({
      success: true,
      data: {
        salary_percentile: parseFloat(salaryPercentile.rows[0].percentile) || 0,
        expense_percentile: parseFloat(expensePercentile.rows[0].percentile) || 0,
        region_avg_salary: regionStats.rows[0]?.region_avg_salary || 0,
        region_avg_expense: regionStats.rows[0]?.region_avg_expense || 0,
        job_avg_salary: jobStats.rows[0]?.job_avg_salary || 0,
        job_avg_expense: jobStats.rows[0]?.job_avg_expense || 0,
        similar_count: similarCount.rows[0]?.similar_count || 0,
      },
    });
  } catch (err) {
    console.error('[GET /api/compare]', err.message);
    res.status(500).json({ success: false, message: 'Failed to compare data' });
  }
});

// 4. GET /api/distribution - Salary & expense distribution buckets
app.get('/api/distribution', async (_req, res) => {
  try {
    // Salary distribution: 0-100, 100-150, 150-200, ..., 900+
    // Values are in 만원 units
    const salaryBuckets = [
      { min: 0, max: 100, label: '0~100만원' },
      { min: 100, max: 150, label: '100~150만원' },
      { min: 150, max: 200, label: '150~200만원' },
      { min: 200, max: 250, label: '200~250만원' },
      { min: 250, max: 300, label: '250~300만원' },
      { min: 300, max: 350, label: '300~350만원' },
      { min: 350, max: 400, label: '350~400만원' },
      { min: 400, max: 450, label: '400~450만원' },
      { min: 450, max: 500, label: '450~500만원' },
      { min: 500, max: 600, label: '500~600만원' },
      { min: 600, max: 700, label: '600~700만원' },
      { min: 700, max: 800, label: '700~800만원' },
      { min: 800, max: 900, label: '800~900만원' },
      { min: 900, max: 999999, label: '900만원+' },
    ];

    // Expense distribution: 0-50, 50-100, ..., 500+
    const expenseBuckets = [
      { min: 0, max: 50, label: '0~50만원' },
      { min: 50, max: 100, label: '50~100만원' },
      { min: 100, max: 150, label: '100~150만원' },
      { min: 150, max: 200, label: '150~200만원' },
      { min: 200, max: 250, label: '200~250만원' },
      { min: 250, max: 300, label: '250~300만원' },
      { min: 300, max: 400, label: '300~400만원' },
      { min: 400, max: 500, label: '400~500만원' },
      { min: 500, max: 999999, label: '500만원+' },
    ];

    // Build salary distribution with a single query using CASE
    const salaryCases = salaryBuckets.map(
      (b, i) => `COUNT(*) FILTER (WHERE monthly_salary >= ${b.min} AND monthly_salary < ${b.max}) AS s${i}`
    ).join(', ');

    const salaryResult = await pool.query(`SELECT ${salaryCases} FROM salary_data`);
    const salaryDistribution = salaryBuckets.map((b, i) => ({
      range: b.max >= 999999 ? `${b.min}+` : `${b.min}-${b.max}`,
      count: parseInt(salaryResult.rows[0][`s${i}`], 10),
      label: b.label,
      min: b.min,
      max: b.max,
    }));

    // Build expense distribution
    const expenseCases = expenseBuckets.map(
      (b, i) => `COUNT(*) FILTER (WHERE monthly_expense >= ${b.min} AND monthly_expense < ${b.max}) AS e${i}`
    ).join(', ');

    const expenseResult = await pool.query(`SELECT ${expenseCases} FROM salary_data`);
    const expenseDistribution = expenseBuckets.map((b, i) => ({
      range: b.max >= 999999 ? `${b.min}+` : `${b.min}-${b.max}`,
      count: parseInt(expenseResult.rows[0][`e${i}`], 10),
      label: b.label,
      min: b.min,
      max: b.max,
    }));

    res.json({
      success: true,
      data: { salary_distribution: salaryDistribution, expense_distribution: expenseDistribution },
    });
  } catch (err) {
    console.error('[GET /api/distribution]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch distribution' });
  }
});

// 5. GET /api/by-region - Stats grouped by region
app.get('/api/by-region', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        region,
        COUNT(*)::int AS count,
        ROUND(AVG(monthly_salary))::int AS avg_salary,
        ROUND(AVG(monthly_expense))::int AS avg_expense
      FROM salary_data
      GROUP BY region
      ORDER BY count DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/by-region]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch region stats' });
  }
});

// 6. GET /api/subscriptions - Subscription service usage counts
app.get('/api/subscriptions', async (_req, res) => {
  try {
    // Unnest JSONB array and count each service
    const result = await pool.query(`
      WITH total AS (
        SELECT COUNT(*)::numeric AS cnt FROM salary_data
      ),
      services AS (
        SELECT jsonb_array_elements_text(subscriptions) AS service
        FROM salary_data
        WHERE jsonb_array_length(subscriptions) > 0
      )
      SELECT
        service,
        COUNT(*)::int AS count,
        ROUND(COUNT(*)::numeric / GREATEST(total.cnt, 1) * 100, 1) AS percentage
      FROM services, total
      GROUP BY service, total.cnt
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: result.rows.map((r) => ({
        service: r.service,
        count: r.count,
        percentage: parseFloat(r.percentage),
      })),
    });
  } catch (err) {
    console.error('[GET /api/subscriptions]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription stats' });
  }
});

// 7. GET /api/list - Paginated list of entries
app.get('/api/list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // Allowed sort columns (whitelist to prevent SQL injection)
    const sortMap = {
      salary: 'monthly_salary',
      expense: 'monthly_expense',
      years: 'years_of_experience',
    };
    const sortCol = sortMap[req.query.sort] || 'monthly_salary';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM salary_data');
    const total = countResult.rows[0].total;

    const result = await pool.query(
      `SELECT
        monthly_salary, monthly_expense,
        food_expense, housing_expense, transport_expense,
        subscription_expense, other_expense,
        region, job_category, years_of_experience,
        subscriptions, created_at
      FROM salary_data
      ORDER BY ${sortCol} ${order}
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      total,
      page,
    });
  } catch (err) {
    console.error('[GET /api/list]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch list' });
  }
});

// ----- SPA Fallback -----
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----- Error Handling Middleware -----
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ----- Start Server / Export for Vercel -----
if (require.main === module) {
  initDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Server] Running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Startup] DB init failed:', err.message);
      process.exit(1);
    });
}

module.exports = app;

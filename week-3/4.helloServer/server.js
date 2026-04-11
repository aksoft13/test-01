// server.js — Hello Server: minimal REST API with static UI
// -----------------------------------------------------------
// 1. Module imports
const express = require('express');
const path = require('path');

// 2. App initialization
const app = express();
const PORT = process.env.PORT || 3000;

// 3. In-memory data store
let users = [
  { id: 1, name: 'Alice Kim',  email: 'alice@example.com' },
  { id: 2, name: 'Bob Lee',    email: 'bob@example.com'   },
  { id: 3, name: 'Carol Park', email: 'carol@example.com' },
];
let nextUserId = 4;

// 4. Middleware
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Static file serving (index.html, client.js live next to server.js)
app.use(express.static(path.join(__dirname)));

// 5. API Routes
// ---- GET /api/hello ----
app.get('/api/hello', (_req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Hello, World!',
      timestamp: new Date().toISOString(),
    },
  });
});

// ---- GET /api/status ----
app.get('/api/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
    },
  });
});

// ---- GET /api/users ----
app.get('/api/users', (_req, res) => {
  res.json({ success: true, data: users });
});

// ---- GET /api/users/:id ----
app.get('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }
  const user = users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, data: user });
});

// ---- POST /api/users ----
app.post('/api/users', (req, res) => {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Both "name" and "email" are required',
      });
    }
    const newUser = { id: nextUserId++, name: String(name), email: String(email) };
    users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// ---- DELETE /api/users/:id ----
app.delete('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }
  const before = users.length;
  users = users.filter((u) => u.id !== id);
  if (users.length === before) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, message: `User ${id} deleted` });
});

// 6. Error handling middleware
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// 7. Start server (dual-mode: local + serverless export)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Hello Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

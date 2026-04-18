const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const TODOS_FILE = path.join(__dirname, 'todos.json');

// ========================================
// File I/O Helpers
// ========================================

function readTodos() {
  try {
    const raw = fs.readFileSync(TODOS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTodos(todos) {
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf-8');
}

// ========================================
// Response Helpers
// ========================================

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ========================================
// Static File Serving
// ========================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ========================================
// Filename Generator
// ========================================

function generateFilename(order, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);
  return `todo_${order}_${slug}`;
}

// ========================================
// HTTP Server
// ========================================

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // ------ GET /api/todos ------
    if (method === 'GET' && pathname === '/api/todos') {
      const todos = readTodos();
      return sendJSON(res, 200, { success: true, data: todos });
    }

    // ------ POST /api/todos ------
    if (method === 'POST' && pathname === '/api/todos') {
      const body = await parseBody(req);
      const { title, details = [] } = body;

      if (!title || !title.trim()) {
        return sendJSON(res, 400, { success: false, message: 'title is required' });
      }

      const todos = readTodos();
      const maxOrder = todos.reduce((max, t) => Math.max(max, t.order || 0), 0);
      const newOrder = maxOrder + 1;

      const newTodo = {
        filename: generateFilename(newOrder, title.trim()),
        date: new Date().toISOString().split('T')[0],
        title: title.trim(),
        order: newOrder,
        details: Array.isArray(details) ? details : [],
        completed: false,
      };

      todos.push(newTodo);
      writeTodos(todos);

      return sendJSON(res, 201, { success: true, data: newTodo });
    }

    // ------ PATCH /api/todos/:filename (toggle completed) ------
    const patchMatch = pathname.match(/^\/api\/todos\/(.+)$/);
    if (method === 'PATCH' && patchMatch) {
      const filename = decodeURIComponent(patchMatch[1]);
      const todos = readTodos();
      const idx = todos.findIndex((t) => t.filename === filename);

      if (idx === -1) {
        return sendJSON(res, 404, { success: false, message: 'Todo not found' });
      }

      todos[idx].completed = !todos[idx].completed;
      writeTodos(todos);

      return sendJSON(res, 200, { success: true, data: todos[idx] });
    }

    // ------ DELETE /api/todos/:filename ------
    const deleteMatch = pathname.match(/^\/api\/todos\/(.+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const filename = decodeURIComponent(deleteMatch[1]);
      const todos = readTodos();
      const idx = todos.findIndex((t) => t.filename === filename);

      if (idx === -1) {
        return sendJSON(res, 404, { success: false, message: 'Todo not found' });
      }

      todos.splice(idx, 1);
      writeTodos(todos);

      return sendJSON(res, 200, { success: true, message: 'Deleted' });
    }

    // ------ Static Files ------
    if (method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        return serveStaticFile(res, path.join(__dirname, 'index.html'));
      }

      // Serve other static files (client.js, etc.)
      const safePath = path.join(__dirname, pathname);
      if (safePath.startsWith(__dirname)) {
        return serveStaticFile(res, safePath);
      }
    }

    // ------ 404 Fallback ------
    sendJSON(res, 404, { success: false, message: 'Not found' });

  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { success: false, message: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Todos JSON server running on http://localhost:${PORT}`);
});

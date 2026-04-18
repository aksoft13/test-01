const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TODOS_DIR = __dirname;

// ========================================
// Helper: MIME types for static file serving
// ========================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

// ========================================
// Helper: Send JSON response
// ========================================
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ========================================
// Helper: Read request body as JSON
// ========================================
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ========================================
// Helper: Parse a .txt todo file into an object
// ========================================
function parseTodoFile(filename, content) {
  const lines = content.split('\n');

  let date = '';
  let title = '';
  const details = [];
  let completed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('날짜:')) {
      date = trimmed.replace('날짜:', '').trim();
    } else if (trimmed.match(/^할일\s*\d*:/)) {
      title = trimmed.replace(/^할일\s*\d*:/, '').trim();
    } else if (trimmed.startsWith('- ')) {
      details.push(trimmed.slice(2));
    } else if (trimmed.startsWith('상태:')) {
      completed = trimmed.includes('[x]') || trimmed.includes('[X]');
    }
  }

  return { filename, title, date, details, completed };
}

// ========================================
// Helper: Build .txt content from todo data
// ========================================
function buildTodoContent(number, title, details, completed) {
  const today = new Date().toISOString().slice(0, 10);
  const status = completed ? '[x]' : '[ ]';
  const detailLines = details.length > 0
    ? '\n' + details.map((d) => `- ${d}`).join('\n') + '\n'
    : '\n';

  return `날짜: ${today}\n할일 ${number}: ${title}\n${detailLines}\n상태: ${status} 완료\n`;
}

// ========================================
// Helper: Get all .txt todo files
// ========================================
function getTodoFiles() {
  return fs.readdirSync(TODOS_DIR)
    .filter((f) => f.startsWith('todo_') && f.endsWith('.txt'))
    .sort();
}

// ========================================
// Helper: Determine next todo number and filename
// ========================================
function nextTodoFilename(title) {
  const files = getTodoFiles();
  let maxNum = 0;
  for (const f of files) {
    const match = f.match(/^todo_(\d+)_/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  const num = maxNum + 1;
  // Create a safe filename slug from the title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) || 'task';

  return { num, filename: `todo_${num}_${slug}.txt` };
}

// ========================================
// Route: GET /api/todos
// ========================================
function handleGetTodos(req, res) {
  try {
    const files = getTodoFiles();
    const todos = files.map((f) => {
      const content = fs.readFileSync(path.join(TODOS_DIR, f), 'utf-8');
      return parseTodoFile(f, content);
    });
    sendJSON(res, 200, { success: true, data: todos });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: 'Failed to read todos' });
  }
}

// ========================================
// Route: POST /api/todos
// ========================================
async function handleCreateTodo(req, res) {
  try {
    const body = await readBody(req);
    const title = (body.title || '').trim();
    if (!title) {
      return sendJSON(res, 400, { success: false, message: 'title is required' });
    }
    const details = Array.isArray(body.details) ? body.details : [];

    const { num, filename } = nextTodoFilename(title);
    const content = buildTodoContent(num, title, details, false);

    fs.writeFileSync(path.join(TODOS_DIR, filename), content, 'utf-8');

    const todo = parseTodoFile(filename, content);
    sendJSON(res, 201, { success: true, data: todo });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: 'Failed to create todo' });
  }
}

// ========================================
// Route: PATCH /api/todos/:filename  (toggle completed)
// ========================================
async function handleToggleTodo(req, res, filename) {
  try {
    const filePath = path.join(TODOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return sendJSON(res, 404, { success: false, message: 'Todo not found' });
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    // Toggle the status
    if (content.includes('[x]') || content.includes('[X]')) {
      content = content.replace(/\[x\]/i, '[ ]');
    } else {
      content = content.replace('[ ]', '[x]');
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    const todo = parseTodoFile(filename, content);
    sendJSON(res, 200, { success: true, data: todo });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: 'Failed to update todo' });
  }
}

// ========================================
// Route: DELETE /api/todos/:filename
// ========================================
function handleDeleteTodo(req, res, filename) {
  try {
    const filePath = path.join(TODOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return sendJSON(res, 404, { success: false, message: 'Todo not found' });
    }

    fs.unlinkSync(filePath);
    sendJSON(res, 200, { success: true, message: 'Todo deleted' });
  } catch (err) {
    sendJSON(res, 500, { success: false, message: 'Failed to delete todo' });
  }
}

// ========================================
// HTTP Server & Router
// ========================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // --- API Routes ---
  if (pathname === '/api/todos' && method === 'GET') {
    return handleGetTodos(req, res);
  }

  if (pathname === '/api/todos' && method === 'POST') {
    return handleCreateTodo(req, res);
  }

  // PATCH /api/todos/:filename
  const patchMatch = pathname.match(/^\/api\/todos\/(.+)$/);
  if (patchMatch && method === 'PATCH') {
    return handleToggleTodo(req, res, decodeURIComponent(patchMatch[1]));
  }

  // DELETE /api/todos/:filename
  if (patchMatch && method === 'DELETE') {
    return handleDeleteTodo(req, res, decodeURIComponent(patchMatch[1]));
  }

  // --- Static File Serving ---
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(TODOS_DIR, 'index.html');
  } else {
    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    filePath = path.join(TODOS_DIR, safePath);
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      sendJSON(res, 404, { success: false, message: 'Not found' });
    }
  } catch (err) {
    sendJSON(res, 500, { success: false, message: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

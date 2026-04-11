// client.js — Hello Server API Playground frontend logic
// -------------------------------------------------------

// Endpoint catalog (must mirror server.js routes)
const ENDPOINTS = [
  {
    id: 'hello',
    method: 'GET',
    path: '/api/hello',
    description: 'Returns a greeting message with the current server timestamp.',
  },
  {
    id: 'status',
    method: 'GET',
    path: '/api/status',
    description: 'Returns server health status and uptime (seconds).',
  },
  {
    id: 'users-list',
    method: 'GET',
    path: '/api/users',
    description: 'Returns the full list of users currently in memory.',
  },
  {
    id: 'users-get',
    method: 'GET',
    path: '/api/users/:id',
    description: 'Returns a single user matching the provided id.',
    hasParam: true,
  },
  {
    id: 'users-create',
    method: 'POST',
    path: '/api/users',
    description: 'Creates a new user from a JSON body containing name and email.',
    hasBody: true,
    sampleBody: { name: 'Dave Choi', email: 'dave@example.com' },
  },
  {
    id: 'users-delete',
    method: 'DELETE',
    path: '/api/users/:id',
    description: 'Deletes a user by id from the in-memory store.',
    hasParam: true,
  },
];

// --- DOM references -----------------------------------------------------
const $list          = document.getElementById('endpoint-list');
const $empty         = document.getElementById('empty-state');
const $panel         = document.getElementById('request-panel');
const $selMethod     = document.getElementById('sel-method');
const $selPath       = document.getElementById('sel-path');
const $selDesc       = document.getElementById('sel-description');
const $paramSection  = document.getElementById('param-section');
const $paramInput    = document.getElementById('param-input');
const $bodySection   = document.getElementById('body-section');
const $bodyInput     = document.getElementById('body-input');
const $bodyFormatBtn = document.getElementById('body-format-btn');
const $sendBtn       = document.getElementById('send-btn');
const $sendBtnLabel  = document.getElementById('send-btn-label');
const $respSection   = document.getElementById('response-section');
const $respStatus    = document.getElementById('resp-status');
const $respTime      = document.getElementById('resp-time');
const $respBody      = document.getElementById('resp-body');

let currentEndpoint = null;

// --- Render endpoint list ----------------------------------------------
function renderEndpoints() {
  $list.innerHTML = '';
  ENDPOINTS.forEach((ep) => {
    const li = document.createElement('li');
    li.className =
      'mx-2 mb-1 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors';
    li.dataset.id = ep.id;
    li.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="method-badge method-${ep.method}">${ep.method}</span>
        <span class="text-sm font-mono text-slate-200 truncate">${ep.path}</span>
      </div>
      <p class="text-xs text-slate-500 mt-1 pl-[60px] leading-snug">${ep.description}</p>
    `;
    li.addEventListener('click', () => selectEndpoint(ep.id));
    $list.appendChild(li);
  });
}

// --- Select endpoint ---------------------------------------------------
function selectEndpoint(id) {
  const ep = ENDPOINTS.find((e) => e.id === id);
  if (!ep) return;
  currentEndpoint = ep;

  // Highlight active item
  Array.from($list.children).forEach((li) => {
    if (li.dataset.id === id) {
      li.classList.add('bg-slate-800', 'ring-1', 'ring-sky-500/40');
    } else {
      li.classList.remove('bg-slate-800', 'ring-1', 'ring-sky-500/40');
    }
  });

  // Populate right panel
  $empty.classList.add('hidden');
  $panel.classList.remove('hidden');

  $selMethod.textContent = ep.method;
  $selMethod.className = `method-badge method-${ep.method}`;
  $selPath.textContent = ep.path;
  $selDesc.textContent = ep.description;

  // URL param
  if (ep.hasParam) {
    $paramSection.classList.remove('hidden');
    $paramInput.value = '1';
  } else {
    $paramSection.classList.add('hidden');
    $paramInput.value = '';
  }

  // Request body
  if (ep.hasBody) {
    $bodySection.classList.remove('hidden');
    $bodyInput.value = JSON.stringify(ep.sampleBody || {}, null, 2);
  } else {
    $bodySection.classList.add('hidden');
    $bodyInput.value = '';
  }

  // Reset response
  $respSection.classList.add('hidden');
}

// --- Build URL (substitute :id) ----------------------------------------
function buildUrl(ep) {
  let url = ep.path;
  if (ep.hasParam) {
    const val = encodeURIComponent($paramInput.value.trim() || '');
    url = url.replace(':id', val);
  }
  return url;
}

// --- Send request ------------------------------------------------------
async function sendRequest() {
  if (!currentEndpoint) return;
  const ep = currentEndpoint;
  const url = buildUrl(ep);

  // Build fetch options
  const options = { method: ep.method, headers: {} };
  if (ep.hasBody) {
    try {
      const parsed = JSON.parse($bodyInput.value || '{}');
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(parsed);
    } catch (err) {
      showResponse(0, 0, { error: 'Invalid JSON body: ' + err.message }, true);
      return;
    }
  }

  // Loading state
  $sendBtn.disabled = true;
  $sendBtnLabel.textContent = 'Sending...';

  const start = Date.now();
  try {
    const res = await fetch(url, options);
    const elapsed = Date.now() - start;

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    showResponse(res.status, elapsed, data, !res.ok);
  } catch (err) {
    const elapsed = Date.now() - start;
    showResponse(0, elapsed, { error: 'Network error: ' + err.message }, true);
  } finally {
    $sendBtn.disabled = false;
    $sendBtnLabel.textContent = 'Send Request';
  }
}

// --- Show response -----------------------------------------------------
function showResponse(status, elapsedMs, data, isError) {
  $respSection.classList.remove('hidden');

  // Status
  $respStatus.textContent = status === 0 ? 'ERR' : status;
  $respStatus.className = 'font-mono font-semibold ' + statusColor(status, isError);

  // Timing
  $respTime.textContent = `${elapsedMs} ms`;

  // Body
  if (typeof data === 'string') {
    $respBody.textContent = data;
  } else {
    const json = JSON.stringify(data, null, 2);
    $respBody.innerHTML = highlightJson(json);
  }
}

function statusColor(status, isError) {
  if (status === 0 || isError) return 'text-red-400';
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 300 && status < 400) return 'text-sky-400';
  if (status >= 400 && status < 500) return 'text-orange-400';
  return 'text-red-400';
}

// --- JSON syntax highlighter -------------------------------------------
function highlightJson(jsonStr) {
  // Escape HTML first
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// --- Format body button ------------------------------------------------
$bodyFormatBtn.addEventListener('click', () => {
  try {
    const parsed = JSON.parse($bodyInput.value || '{}');
    $bodyInput.value = JSON.stringify(parsed, null, 2);
  } catch (err) {
    // Flash error briefly in button label
    const orig = $bodyFormatBtn.textContent;
    $bodyFormatBtn.textContent = 'Invalid JSON';
    $bodyFormatBtn.classList.add('text-red-400');
    setTimeout(() => {
      $bodyFormatBtn.textContent = orig;
      $bodyFormatBtn.classList.remove('text-red-400');
    }, 1500);
  }
});

// --- Wire up ------------------------------------------------------------
$sendBtn.addEventListener('click', sendRequest);
renderEndpoints();

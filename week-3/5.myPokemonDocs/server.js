// server.js — Pokemon Docs Express backend (proxy + cache for PokeAPI)
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// ---------- In-memory caches ----------
// key: name-or-id (string, lowercased) → cleaned pokemon object
const pokemonCache = new Map();
// id → cleaned pokemon object (for quick id-based lookups from random)
const pokemonByIdCache = new Map();
// Cached list of the original 151 pokemon (id + name)
let pokemonListCache = null;

// Fixed random ids — picked once at startup, never changes
const fixedRandomIds = (() => {
  const ids = new Set();
  while (ids.size < 5) {
    ids.add(Math.floor(Math.random() * 151) + 1);
  }
  return Array.from(ids);
})();
console.log('[server] fixed random pokemon ids:', fixedRandomIds);

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(__dirname));

// Request logger
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------- Helpers ----------
function cleanPokemon(raw) {
  const statsMap = {};
  for (const s of raw.stats || []) {
    // PokeAPI uses "special-attack" / "special-defense"
    const key = s.stat.name.replace('-', '_');
    statsMap[key] = s.base_stat;
  }
  return {
    id: raw.id,
    name: raw.name,
    height: raw.height,
    weight: raw.weight,
    types: (raw.types || []).map((t) => t.type.name),
    sprites: {
      front_default: raw.sprites?.front_default || null,
      official_artwork:
        raw.sprites?.other?.['official-artwork']?.front_default || null,
    },
    stats: {
      hp: statsMap.hp ?? null,
      attack: statsMap.attack ?? null,
      defense: statsMap.defense ?? null,
      speed: statsMap.speed ?? null,
      special_attack: statsMap.special_attack ?? null,
      special_defense: statsMap.special_defense ?? null,
    },
  };
}

async function fetchPokemon(nameOrId) {
  const key = String(nameOrId).toLowerCase();

  // Cache hit by name/id key
  if (pokemonCache.has(key)) {
    return pokemonCache.get(key);
  }
  // Cache hit by numeric id
  if (/^\d+$/.test(key) && pokemonByIdCache.has(Number(key))) {
    const cached = pokemonByIdCache.get(Number(key));
    pokemonCache.set(key, cached);
    return cached;
  }

  const url = `${POKEAPI_BASE}/pokemon/${key}`;
  const { data } = await axios.get(url, { timeout: 10000 });
  const cleaned = cleanPokemon(data);

  // Populate both caches
  pokemonCache.set(key, cleaned);
  pokemonCache.set(cleaned.name.toLowerCase(), cleaned);
  pokemonByIdCache.set(cleaned.id, cleaned);

  return cleaned;
}

// ---------- API routes ----------

// GET /api/pokemon — list of original 151 (id + name)
app.get('/api/pokemon', async (_req, res) => {
  try {
    if (pokemonListCache) {
      return res.json({ success: true, data: pokemonListCache });
    }
    const { data } = await axios.get(`${POKEAPI_BASE}/pokemon?limit=151`, {
      timeout: 10000,
    });
    // Extract id from URL like .../pokemon/25/
    const list = (data.results || []).map((p) => {
      const match = p.url.match(/\/pokemon\/(\d+)\//);
      return {
        id: match ? Number(match[1]) : null,
        name: p.name,
      };
    });
    pokemonListCache = list;
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('GET /api/pokemon error:', err.message);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch pokemon list' });
  }
});

// GET /api/pokemon/random?count=5 — random pokemon from ids 1-151
app.get('/api/pokemon/random', async (req, res) => {
  try {
    const countRaw = parseInt(req.query.count, 10);
    const count = Number.isFinite(countRaw) && countRaw > 0 ? countRaw : 5;
    const safeCount = Math.min(count, 151);

    const results = await Promise.all(
      fixedRandomIds.slice(0, safeCount).map((id) => fetchPokemon(id))
    );

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('GET /api/pokemon/random error:', err.message);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch random pokemon' });
  }
});

// GET /api/pokemon/:nameOrId — single pokemon lookup
app.get('/api/pokemon/:nameOrId', async (req, res) => {
  const { nameOrId } = req.params;
  try {
    const pokemon = await fetchPokemon(nameOrId);
    res.json({ success: true, data: pokemon });
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({
        success: false,
        message: `Pokemon "${nameOrId}" not found`,
      });
    }
    console.error(`GET /api/pokemon/${nameOrId} error:`, err.message);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch pokemon' });
  }
});

// GET /api/cache/stats — cache introspection
app.get('/api/cache/stats', (_req, res) => {
  res.json({
    success: true,
    data: {
      size: pokemonCache.size,
      keys: Array.from(pokemonCache.keys()),
    },
  });
});

// ---------- Error fallback ----------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ---------- Startup (local) / export (serverless) ----------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Pokemon Docs server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

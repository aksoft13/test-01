// client.js — simple smoke-test for the Pokemon Docs backend.
// Fetches 5 random pokemon on page load and logs the result.

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[client] DOMContentLoaded — hitting /api/pokemon/random?count=5');
  try {
    const res = await fetch('/api/pokemon/random?count=5');
    if (!res.ok) {
      console.error('[client] request failed with status', res.status);
      return;
    }
    const json = await res.json();
    console.log('[client] random pokemon response:', json);
    if (json.success && Array.isArray(json.data)) {
      console.table(
        json.data.map((p) => ({
          id: p.id,
          name: p.name,
          types: p.types.join(', '),
          hp: p.stats.hp,
          attack: p.stats.attack,
        }))
      );
    }
  } catch (err) {
    console.error('[client] fetch error:', err);
  }
});

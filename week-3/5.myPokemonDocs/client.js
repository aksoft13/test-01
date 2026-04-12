// client.js — simple smoke-test for the Pokemon Docs backend.
// Fetches 5 random pokemon on page load and logs the result.

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[client] DOMContentLoaded — fetching pokemon #1~5');
  try {
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((id) => fetch(`/api/pokemon/${id}`))
    );
    const jsons = await Promise.all(responses.map((r) => r.json()));
    const json = { success: true, data: jsons.map((j) => j.data) };
    console.log('[client] pokemon #1~5 response:', json);
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

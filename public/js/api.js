// Komunikasi dengan server. Daftar koleksi harus sama dengan server/db.js.
export const COLLECTIONS = ['materials', 'partners', 'batches', 'deliveries', 'sales', 'returns', 'expirations', 'expenses', 'reminders', 'purchases', 'stockouts', 'capital'];

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.login) { location.replace(`/login.html${location.hash}`); throw new Error(json.error); } // sesi berakhir
  if (!res.ok) throw new Error(json.error || 'Terjadi kesalahan. Coba lagi.');
  return json;
}

export async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { location.replace('/login.html'); }
}

export async function loadAll() {
  const [settings, ...lists] = await Promise.all([api('/settings'), ...COLLECTIONS.map((c) => api('/' + c))]);
  const data = {};
  COLLECTIONS.forEach((c, i) => { data[c] = lists[i]; });
  return { settings, data };
}

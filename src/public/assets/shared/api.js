export function createApi(getToken) {
  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(path, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || JSON.stringify(body.errors || body));
    return body;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })
  };
}

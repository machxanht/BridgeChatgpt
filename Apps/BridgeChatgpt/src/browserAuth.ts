let csrf = '';
const originalFetch = window.fetch.bind(window);
export const authFetch = originalFetch;
export function setBrowserCsrf(value: string) { csrf = value; }

// Existing dashboard clients share the same session/CSRF transport. Never attach
// capabilities to external origins, including links supplied by agent output.
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  const internal = url.origin === window.location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp'));
  if (!internal) return originalFetch(input, init);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrf) headers.set('x-bridge-csrf', csrf);
  const response = await originalFetch(input, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 401) window.dispatchEvent(new Event('bridge-session-expired'));
  return response;
};

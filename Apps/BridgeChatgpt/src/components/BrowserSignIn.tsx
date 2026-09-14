import { useEffect, useState, type ReactNode } from 'react';
import { authFetch, setBrowserCsrf } from '../browserAuth';

export function BrowserSignIn({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const expired = () => { setBrowserCsrf(''); setState('signed-out'); };
    window.addEventListener('bridge-session-expired', expired);
    authFetch('/api/auth/session').then(async response => {
      const data = response.ok ? await response.json() : null;
      if (!active) return;
      setBrowserCsrf(data?.csrf || '');
      setState(data ? 'signed-in' : 'signed-out');
    }).catch(() => { if (active) { setState('signed-out'); setError('Cannot reach Bridge. Try again.'); } });
    return () => { active = false; window.removeEventListener('bridge-session-expired', expired); };
  }, []);
  if (state === 'signed-in') return <>{children}</>;
  if (state === 'checking') return <main className="p-8" role="status">Connecting to Bridge…</main>;
  return <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-950 text-zinc-100">
    <form className="w-full max-w-sm space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError('');
      try {
        const response = await authFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sign-in failed.');
        setPassword(''); setBrowserCsrf(data.csrf); setState('signed-in');
      } catch (err) { setError(err instanceof Error ? err.message : 'Cannot reach Bridge.'); }
      finally { setBusy(false); }
    }}>
      <h1 className="text-2xl font-semibold">Sign in to Bridge</h1>
      <label className="block" htmlFor="bridge-password">Access password</label>
      <input id="bridge-password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded border border-zinc-600 bg-zinc-900 p-3" />
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="rounded bg-blue-600 px-4 py-3 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}

import { useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { Logo } from './Logo';
import {
  Auth,
  AuthContext,
  DEMO_USERS,
  apiScope,
  msalEnabled,
  pca,
  useAuth,
} from './auth';
import { createApi, Me } from './api';
import { BranchApp } from './BranchApp';
import { HeadOffice } from './HeadOffice';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/v1';

// One shared interactive-auth attempt at a time, so N concurrent API calls that
// hit an expired token don't each open a login popup (the browser blocks the extras).
let interactiveAuth: Promise<string> | null = null;

function AuthProvider({ children }: { children: (auth: Auth) => JSX.Element }) {
  const [ready, setReady] = useState(!msalEnabled);
  const [account, setAccount] = useState<import('@azure/msal-browser').AccountInfo | null>(null);
  const [devUserId, setDevUserId] = useState(DEMO_USERS[0].id);

  useEffect(() => {
    if (!msalEnabled || !pca) return;
    (async () => {
      await pca.initialize();
      await pca.handleRedirectPromise();
      setAccount(pca.getAllAccounts()[0] ?? null);
      setReady(true);
    })();
  }, []);

  const auth: Auth = useMemo(
    () => ({
      mode: msalEnabled ? 'msal' : 'demo',
      ready,
      account,
      signedIn: msalEnabled ? !!account : true,
      devUserId,
      setDevUserId,
      login: async () => {
        if (!pca) return;
        const res = await pca.loginPopup({ scopes: apiScope ? [apiScope] : ['User.Read'] });
        setAccount(res.account);
      },
      logout: () => {
        // Only clear the UI once logout actually completes; a cancelled logout
        // keeps the session (consistent with what's still in the MSAL cache).
        if (pca && account) pca.logoutPopup({ account }).then(() => setAccount(null)).catch(() => {});
        else setAccount(null);
      },
      authHeaders: async (): Promise<Record<string, string>> => {
        if (!msalEnabled) return { 'x-user-id': devUserId };
        if (!pca || !account) return {};
        const scopes = apiScope ? [apiScope] : ['User.Read'];
        try {
          const res = await pca.acquireTokenSilent({ account, scopes });
          return { Authorization: `Bearer ${res.accessToken}` };
        } catch (err) {
          // Only fall back to an interactive popup when sign-in is actually
          // required; transient/network errors shouldn't pop a login.
          if (!(err instanceof InteractionRequiredAuthError)) throw err;
          if (!interactiveAuth) {
            interactiveAuth = pca
              .acquireTokenPopup({ scopes })
              .then((r) => r.accessToken)
              .finally(() => {
                interactiveAuth = null;
              });
          }
          return { Authorization: `Bearer ${await interactiveAuth}` };
        }
      },
    }),
    [ready, account, devUserId],
  );

  if (!ready) return <div className="center">Loading…</div>;
  return <AuthContext.Provider value={auth}>{children(auth)}</AuthContext.Provider>;
}

function Shell() {
  const auth = useAuth();
  const [role, setRole] = useState<'branch' | 'hq'>('branch');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => createApi(API_BASE, auth.authHeaders), [auth]);

  useEffect(() => {
    if (!auth.signedIn) return;
    api
      .me()
      .then(setMe)
      .catch((e) => setError(e.message));
  }, [api, auth.signedIn, auth.devUserId]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <h1>Stories OneApp</h1>
            <small>OPERATIONS · DAILY CHECKLISTS</small>
          </div>
        </div>
        <div className="spacer" />
        <div className="roleswitch">
          <button className={role === 'branch' ? 'active' : ''} onClick={() => setRole('branch')}>
            Branch App
          </button>
          <button className={role === 'hq' ? 'active' : ''} onClick={() => setRole('hq')}>
            Head Office
          </button>
        </div>
        <div className="authbox">
          {auth.mode === 'demo' ? (
            <select value={auth.devUserId} onChange={(e) => auth.setDevUserId(e.target.value)}>
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : auth.signedIn ? (
            <button onClick={auth.logout}>Sign out</button>
          ) : (
            <button onClick={auth.login}>Sign in</button>
          )}
        </div>
      </header>

      <main>
        {!auth.signedIn ? (
          <div className="center">Sign in with your Stories account to continue.</div>
        ) : (
          <>
            {error && <div className="err">{error}</div>}
            {role === 'branch' ? <BranchApp api={api} me={me} /> : <HeadOffice api={api} />}
          </>
        )}
      </main>
    </div>
  );
}

export function App() {
  return <AuthProvider>{() => <Shell />}</AuthProvider>;
}

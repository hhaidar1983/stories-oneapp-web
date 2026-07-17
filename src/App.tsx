import { createElement as h, useEffect, useMemo, useState } from 'react';
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
import { Escalations } from './Escalations';
import { EscalationSettings } from './EscalationSettings';

// Roles allowed to edit escalation settings (everyone HQ can see the board).
const SETTINGS_ROLES = ['admin', 'head_office'];

function HeadOfficeShell({ api, me }: { api: ReturnType<typeof createApi>; me: Me | null }) {
  const [tab, setTab] = useState<'submissions' | 'escalations' | 'settings'>('submissions');
  const canSettings = !!me && SETTINGS_ROLES.includes(me.role);
  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button className={'hqtab ' + (tab === id ? 'on' : '')} onClick={() => setTab(id)}>
      {label}
    </button>
  );
  return (
    <>
      <div className="hqtabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Tab id="submissions" label="Live submissions" />
        <Tab id="escalations" label="Escalations" />
        {canSettings && <Tab id="settings" label="⚙ Settings" />}
      </div>
      {tab === 'submissions' && <HeadOffice api={api} />}
      {tab === 'escalations' && <Escalations api={api} />}
      {tab === 'settings' && canSettings && <EscalationSettings api={api} />}
    </>
  );
}

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/v1';

// Which view a signed-in user sees is decided by their role (set at login), not a
// manual toggle. Everyone else defaults to the branch (staff) app.
const HQ_ROLES = ['hq_reviewer', 'head_office', 'admin', 'area_manager', 'ops_manager'];

// Staff app launcher. Only 'checklists' is live today; the rest are placeholders
// to be wired to their real systems/links later. Set url on a tile to open a
// link, or live to route it inside this app.
type AppTile = { key: string; icon: string; name: string; sub: string; live?: boolean; url?: string };
const APP_TILES: AppTile[] = [
  { key: 'checklists', icon: '📋', name: 'Daily Checklists', sub: 'Opening, handover & closing', live: true },
  { key: 'maintenance', icon: '🛠️', name: 'Maintenance Tickets', sub: 'Report a broken machine or fixture' },
  { key: 'suggestions', icon: '💡', name: 'Suggestions', sub: 'Share an idea to improve Stories' },
  { key: 'vacation', icon: '🌴', name: 'Vacation Request', sub: 'Request time off' },
];

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

function Hub({ onOpen }: { onOpen: (key: string) => void }) { return h('div', null, h('div', { className: 'sectionlabel' }, 'Stories staff apps'), h('div', { className: 'cards applauncher' }, APP_TILES.map((a) => h('div', { key: a.key, className: 'card appcard ' + (a.live || a.url ? '' : 'soon'), onClick: () => { if (a.url) window.open(a.url, '_blank', 'noopener'); else if (a.live) onOpen(a.key); } }, h('span', { className: 'badge ' + (a.live || a.url ? 'b-done' : 'b-todo') }, a.live || a.url ? 'OPEN' : 'COMING SOON'), h('div', { className: 'cicon' }, a.icon), h('h3', null, a.name), h('div', { className: 'sub' }, a.sub))))); }

function Shell() {
  const auth = useAuth();
  const [openApp, setOpenApp] = useState<string | null>(null);
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
        ) : !openApp ? (
          Hub({ onOpen: setOpenApp })
        ) : (
          <>
            {h('button', { className: 'backbtn menuback', onClick: () => setOpenApp(null) }, '← Menu')}
            {error && <div className="err">{error}</div>}
            {!me || !HQ_ROLES.includes(me.role) ? <BranchApp api={api} me={me} /> : <HeadOfficeShell api={api} me={me} />}
          </>
        )}
      </main>
    </div>
  );
}

export function App() {
  return <AuthProvider>{() => <Shell />}</AuthProvider>;
}

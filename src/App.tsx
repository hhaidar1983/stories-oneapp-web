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
import { createApi, Me, BranchConfigRow, PersonRow } from './api';
import { BranchApp } from './BranchApp';
import { HeadOffice } from './HeadOffice';
import { Escalations } from './Escalations';
import { EscalationSettings } from './EscalationSettings';
import { ExecSummary } from './ExecSummary';
import { ChecklistEditor } from './ChecklistEditor';
import { Login } from './Login';
import { FaceEnroll } from './FaceEnroll';

// Roles allowed to edit escalation settings (everyone HQ can see the board).
const SETTINGS_ROLES = ['admin', 'head_office'];

// Roles allowed to enroll staff faces / set PINs (matches the backend guard).
const MANAGER_ROLES = ['admin', 'head_office', 'hq_reviewer', 'ops_manager', 'area_manager'];

const bsBox: React.CSSProperties = { background: '#ffffff', border: '1px solid #DCE8E1', borderRadius: 10, padding: 14, marginBottom: 14 };
const bsLbl: React.CSSProperties = { fontSize: 11, color: '#6B7D73', display: 'block', marginBottom: 4 };
const bsInp: React.CSSProperties = { background: '#ffffff', color: '#14201A', border: '1px solid #DCE8E1', borderRadius: 8, padding: '7px 9px', fontSize: 14, width: '100%', boxSizing: 'border-box' };

function BSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? '#086C42' : '#C9D6CE', position: 'relative', transition: 'background .15s', flex: '0 0 auto' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

function BRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <BSwitch on={on} onChange={onChange} />
    </div>
  );
}

function BranchSettings({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<BranchConfigRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BranchConfigRow | null>(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.branchConfigs().then(setRows).catch((e: any) => setError(e.message));
  }, [api]);

  if (error) return <div className="err">{error}</div>;
  if (!rows) return <div className="center">Loading branch settings…</div>;

  const select = (r: BranchConfigRow) => { setSelId(r.branch_id); setDraft({ ...r }); setSaved(false); };
  const patch = (p: Partial<BranchConfigRow>) => { setDraft({ ...(draft as BranchConfigRow), ...p }); setSaved(false); };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        active: draft.active,
        deadline_opening: draft.deadline_opening,
        deadline_handover: draft.deadline_handover,
        deadline_closing: draft.deadline_closing,
        trig_not_submitted: draft.trig_not_submitted,
        trig_low_completion: draft.trig_low_completion,
        trig_flagged: draft.trig_flagged,
        trig_rushed: draft.trig_rushed,
        ch_email: draft.ch_email,
        ch_whatsapp: draft.ch_whatsapp,
      };
      const out = await api.updateBranchConfig(draft.branch_id, body);
      setRows((rows as BranchConfigRow[]).map((x) => (x.branch_id === out.branch_id ? out : x)));
      setDraft(out);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => (r.branch_name || r.branch_id).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="sectionlabel">Branch alerts</div>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: -2, marginBottom: 12 }}>Per-branch alerting: master on/off, checklist deadlines (Beirut time), which triggers fire, and delivery channels. Changes apply on the engine's next check.</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 250px', minWidth: 230 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search branches…" style={{ ...bsInp, marginBottom: 8 }} />
          <div style={{ ...bsBox, padding: 4, maxHeight: 430, overflowY: 'auto' }}>
            {filtered.map((r) => (
              <button key={r.branch_id} type="button" onClick={() => select(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: r.branch_id === selId ? '#EAF4EE' : 'transparent', border: 'none', color: '#14201A', padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto', background: r.active ? '#086C42' : '#8b978f' }} />
                <span style={{ flex: 1, fontSize: 13 }}>{r.branch_name || r.branch_id}</span>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{r.branch_id}</span>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ padding: 12, fontSize: 12, opacity: 0.6 }}>No branches match.</div>}
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          {!draft && <div style={{ ...bsBox, opacity: 0.7, fontSize: 13 }}>Select a branch to edit its settings.</div>}
          {draft && (
            <div style={bsBox}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{draft.branch_name || draft.branch_id}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{draft.branch_id}</div>
                </div>
                <BSwitch on={draft.active} onChange={(v) => patch({ active: v })} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>{draft.active ? 'Alerting ON for this branch' : 'Alerting OFF — no alerts will be sent'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, margin: '4px 0 6px' }}>Checklist deadlines</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1 }}><span style={bsLbl}>Opening</span><input type="time" value={draft.deadline_opening} onChange={(e) => patch({ deadline_opening: e.target.value })} style={bsInp} /></div>
                <div style={{ flex: 1 }}><span style={bsLbl}>Handover</span><input type="time" value={draft.deadline_handover} onChange={(e) => patch({ deadline_handover: e.target.value })} style={bsInp} /></div>
                <div style={{ flex: 1 }}><span style={bsLbl}>Closing</span><input type="time" value={draft.deadline_closing} onChange={(e) => patch({ deadline_closing: e.target.value })} style={bsInp} /></div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, margin: '4px 0 2px' }}>Triggers</div>
              <BRow label="Flagged evidence" on={draft.trig_flagged} onChange={(v) => patch({ trig_flagged: v })} />
              <BRow label="Not submitted by deadline" on={draft.trig_not_submitted} onChange={(v) => patch({ trig_not_submitted: v })} />
              <BRow label="Low completion" on={draft.trig_low_completion} onChange={(v) => patch({ trig_low_completion: v })} />
              <BRow label="Rushed (too fast)" on={draft.trig_rushed} onChange={(v) => patch({ trig_rushed: v })} />
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, margin: '10px 0 2px' }}>Delivery channels</div>
              <BRow label="Email" on={draft.ch_email} onChange={(v) => patch({ ch_email: v })} />
              <BRow label="WhatsApp" on={draft.ch_whatsapp} onChange={(v) => patch({ ch_whatsapp: v })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <button type="button" onClick={save} disabled={saving} style={{ background: '#086C42', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
                {saved && <span style={{ fontSize: 12, color: '#086C42', fontWeight: 700 }}>Saved ✓</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const DEMO_ADMIN = { id: 'ed73a968-ff2a-43cf-a966-11b49914fe91', name: 'Charbel N. — Head Office (Admin)' };

const PERSON_ROLES: { v: string; l: string }[] = [
  { v: 'admin', l: 'Admin' },
  { v: 'head_office', l: 'Head Office' },
  { v: 'hq_reviewer', l: 'HQ Reviewer' },
  { v: 'ops_manager', l: 'Operations Manager' },
  { v: 'area_manager', l: 'Area Manager' },
  { v: 'branch_manager', l: 'Branch Manager' },
  { v: 'shift_lead', l: 'Shift Lead' },
  { v: 'staff', l: 'Staff' },
];
const roleLabel = (v: string) => (PERSON_ROLES.find((r) => r.v === v) || { l: v }).l;

function People({ api }: { api: ReturnType<typeof createApi> }) {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [branches, setBranches] = useState<BranchConfigRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.people().then(setRows).catch((e: any) => setError(e.message));
    api.branchConfigs().then(setBranches).catch(() => {});
  }, [api]);

  if (error) return <div className="err">{error}</div>;
  if (!rows) return <div className="center">Loading people…</div>;

  const edit = (r: PersonRow) => { setDraft({ ...r }); setIsNew(false); setSaved(false); };
  const addNew = () => { setDraft({ id: '', name: '', email: null, whatsapp: null, role: 'staff', branch_id: null, active: true }); setIsNew(true); setSaved(false); };
  const patch = (p: Partial<PersonRow>) => { setDraft({ ...(draft as PersonRow), ...p }); setSaved(false); };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: draft.name, email: draft.email, whatsapp: draft.whatsapp, role: draft.role, branch_id: draft.branch_id, active: draft.active };
      if (isNew) await api.createPerson(body);
      else await api.updatePerson(draft.id, body);
      const fresh = await api.people();
      setRows(fresh);
      setSaved(true);
      setDraft(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => (r.name + ' ' + r.role + ' ' + (r.email || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="sectionlabel">People &amp; permissions</div>
      <p style={{ fontSize: 12, color: '#6B7D73', marginTop: -2, marginBottom: 12 }}>Add the people who use Stories OneApp — their role (what they can access), email, WhatsApp, and branch. Managed by admin.</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 280px', minWidth: 250 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" style={{ ...bsInp, flex: 1 }} />
            <button type="button" onClick={addNew} style={{ background: '#086C42', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
          </div>
          <div style={{ ...bsBox, padding: 4, maxHeight: 430, overflowY: 'auto' }}>
            {filtered.map((r) => (
              <button key={r.id} type="button" onClick={() => edit(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: draft && draft.id === r.id ? '#EAF4EE' : 'transparent', border: 'none', color: '#14201A', padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: r.active ? '#086C42' : '#C9D6CE' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#6B7D73' }}>{roleLabel(r.role)}{r.branch_name ? ' · ' + r.branch_name : ''}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#6B7D73' }}>No people match.</div>}
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          {!draft && <div style={{ ...bsBox, color: '#6B7D73', fontSize: 13 }}>Select a person to edit, or add a new one.</div>}
          {draft && (
            <div style={bsBox}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{isNew ? 'New person' : draft.name}</div>
              <div style={{ marginBottom: 10 }}><span style={bsLbl}>Name</span><input value={draft.name} onChange={(e) => patch({ name: e.target.value })} style={bsInp} /></div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}><span style={bsLbl}>Email</span><input value={draft.email || ''} onChange={(e) => patch({ email: e.target.value })} style={bsInp} /></div>
                <div style={{ flex: 1 }}><span style={bsLbl}>WhatsApp</span><input value={draft.whatsapp || ''} onChange={(e) => patch({ whatsapp: e.target.value })} placeholder="+961..." style={bsInp} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><span style={bsLbl}>Role</span>
                  <select value={draft.role} onChange={(e) => patch({ role: e.target.value })} style={bsInp}>
                    {PERSON_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}><span style={bsLbl}>Branch</span>
                  <select value={draft.branch_id || ''} onChange={(e) => patch({ branch_id: e.target.value || null })} style={bsInp}>
                    <option value="">— none —</option>
                    {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name || b.branch_id}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13, flex: 1 }}>Active (can access the app)</span>
                <BSwitch on={draft.active} onChange={(v) => patch({ active: v })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={save} disabled={saving} style={{ background: '#086C42', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : isNew ? 'Create person' : 'Save changes'}</button>
                {saved && <span style={{ fontSize: 12, color: '#086C42', fontWeight: 700 }}>Saved ✓</span>}
                <button type="button" onClick={() => setDraft(null)} style={{ background: 'transparent', color: '#6B7D73', border: 'none', fontSize: 13, cursor: 'pointer', marginLeft: 'auto' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function HeadOfficeShell({ api, me }: { api: ReturnType<typeof createApi>; me: Me | null }) {
  const [tab, setTab] = useState<'submissions' | 'escalations' | 'exec'>('submissions');
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
        <Tab id="exec" label="Executive" />
      </div>
      {tab === 'submissions' && <HeadOffice api={api} />}
      {tab === 'escalations' && <Escalations api={api} />}
      {tab === 'exec' && <ExecSummary api={api} me={me} />}
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
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem('stories.session') : null,
  );

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
      // Signed in by a face/PIN token, by Microsoft, or (dev only) always.
      signedIn: !!token || (msalEnabled ? !!account : true),
      devUserId,
      setDevUserId,
      sessionToken: token,
      loginWithToken: (t: string) => {
        if (typeof window !== 'undefined') window.localStorage.setItem('stories.session', t);
        setToken(t);
      },
      login: async () => {
        if (!pca) return;
        const res = await pca.loginPopup({ scopes: apiScope ? [apiScope] : ['User.Read'] });
        setAccount(res.account);
      },
      logout: () => {
        // Clear any face/PIN session first.
        if (typeof window !== 'undefined') window.localStorage.removeItem('stories.session');
        setToken(null);
        // Only clear the UI once logout actually completes; a cancelled logout
        // keeps the session (consistent with what's still in the MSAL cache).
        if (pca && account) pca.logoutPopup({ account }).then(() => setAccount(null)).catch(() => {});
        else setAccount(null);
      },
      authHeaders: async (): Promise<Record<string, string>> => {
        // A face/PIN session token wins when present.
        if (token) return { Authorization: `Bearer ${token}` };
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
    [ready, account, devUserId, token],
  );

  if (!ready) return <div className="center">Loading…</div>;
  return <AuthContext.Provider value={auth}>{children(auth)}</AuthContext.Provider>;
}

function Hub({ onOpen, me }: { onOpen: (key: string) => void; me: Me | null }) {
  const tiles: AppTile[] = APP_TILES.filter((a) => a.live || a.url);
  if (me && SETTINGS_ROLES.includes(me.role)) {
    tiles.push({ key: 'admin', icon: '🛠️', name: 'Admin & Settings', sub: 'Escalation chain, branch alerts, people & checklists', live: true });
  }
  if (me && MANAGER_ROLES.includes(me.role)) {
    tiles.push({ key: 'faceenroll', icon: '🧑‍💼', name: 'Staff Face Setup', sub: 'Enroll faces & set login PINs', live: true });
  }
  return h(
    'div',
    null,
    h('div', { className: 'sectionlabel' }, 'Stories staff apps'),
    h(
      'div',
      { className: 'cards applauncher' },
      tiles.map((a) =>
        h(
          'div',
          {
            key: a.key,
            className: 'card appcard ' + (a.live || a.url ? '' : 'soon'),
            onClick: () => {
              if (a.url) window.open(a.url, '_blank', 'noopener');
              else if (a.live) onOpen(a.key);
            },
          },
          h('span', { className: 'badge ' + (a.live || a.url ? 'b-done' : 'b-todo') }, a.live || a.url ? 'OPEN' : 'COMING SOON'),
          h('div', { className: 'cicon' }, a.icon),
          h('h3', null, a.name),
          h('div', { className: 'sub' }, a.sub),
        ),
      ),
    ),
  );
}

function AdminShell({ api }: { api: ReturnType<typeof createApi> }) {
  const [sec, setSec] = useState<'' | 'settings' | 'branches' | 'people' | 'checklists'>('');
  if (sec) {
    return (
      <>
        <button className="backbtn menuback" onClick={() => setSec('')}>← Back to settings</button>
        {sec === 'settings' && <EscalationSettings api={api} />}
        {sec === 'branches' && <BranchSettings api={api} />}
        {sec === 'people' && <People api={api} />}
        {sec === 'checklists' && <ChecklistEditor api={api} />}
      </>
    );
  }
  const cardStyle: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left', width: '100%', background: '#ffffff', border: '1px solid #DCE8E1', borderRadius: 14, padding: 16, cursor: 'pointer', color: '#14201A' };
  const icStyle = (bg: string): React.CSSProperties => ({ width: 44, height: 44, borderRadius: 11, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, background: bg });
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, marginBottom: 6 };
  const glabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, color: '#6B7D73', textTransform: 'uppercase', margin: '20px 2px 10px' };
  const Card = ({ id, icon, tone, title, desc }: { id: 'settings' | 'branches' | 'people' | 'checklists'; icon: string; tone: string; title: string; desc: string }) => (
    <button type="button" style={cardStyle} onClick={() => setSec(id)}>
      <span style={icStyle(tone)}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, marginBottom: 3 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12.8, color: '#6B7D73', lineHeight: 1.45 }}>{desc}</span>
      </span>
      <span style={{ color: '#c3d2c9', fontSize: 20, alignSelf: 'center' }}>›</span>
    </button>
  );
  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 2px' }}>Admin &amp; Settings</div>
      <p style={{ color: '#6B7D73', fontSize: 13.5, marginTop: 0, marginBottom: 4 }}>Manage how Stories OneApp escalates problems and who can use it.</p>
      <div style={glabel}>Alerts &amp; escalations</div>
      <div style={grid}>
        <Card id="settings" icon="🚨" tone="#e7f2eb" title="Escalation chain" desc="Who gets alerted at each level, and how fast a problem climbs the chain." />
        <Card id="branches" icon="🔔" tone="#fdeede" title="Branch alerts" desc="Per-branch deadlines, which problems trigger, and delivery channels." />
      </div>
      <div style={glabel}>Organization</div>
      <div style={grid}>
        <Card id="people" icon="👥" tone="#e6eefb" title="People & permissions" desc="Add people, set their role and branch, and control access." />
        <Card id="checklists" icon="📋" tone="#f0ecfa" title="Checklists" desc="Edit Opening, Handover and Closing items, per branch." />
      </div>
    </>
  );
}

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
              {[...DEMO_USERS, DEMO_ADMIN].map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : auth.signedIn ? (
            <button onClick={auth.logout}>Sign out</button>
          ) : null}
        </div>
      </header>

      <main>
        {!auth.signedIn ? (
          <Login
            api={api}
            onToken={auth.loginWithToken}
            onMicrosoft={auth.login}
            microsoftEnabled={auth.mode === 'msal'}
          />
        ) : !openApp ? (
          Hub({ onOpen: setOpenApp, me })
        ) : openApp === 'admin' ? (
          <>
            {h('button', { className: 'backbtn menuback', onClick: () => setOpenApp(null) }, '← Menu')}
            {!me || !SETTINGS_ROLES.includes(me.role) ? (
              <div className="err">Admin access required.</div>
            ) : (
              <AdminShell api={api} />
            )}
          </>
        ) : openApp === 'faceenroll' ? (
          <>
            {h('button', { className: 'backbtn menuback', onClick: () => setOpenApp(null) }, '← Menu')}
            <FaceEnroll api={api} />
          </>
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

import { useEffect, useState } from 'react';
import { Api, BranchChecklistRow, BranchConfigRow, ChecklistTypeRow } from './api';

// ── Shared styles ────────────────────────────────────────────────────────────

const box: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
};
const inp: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 4,
};
const btn: React.CSSProperties = {
  background: 'var(--green)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 14px',
  fontSize: 13,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: '#fff',
  color: 'var(--green)',
  border: '1px solid var(--green)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  background: '#fff',
  color: 'var(--danger)',
  border: '1px solid var(--danger-line)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

// ── Catalog panel ────────────────────────────────────────────────────────────

function CatalogPanel({ api }: { api: Api }) {
  const [types, setTypes] = useState<ChecklistTypeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');

  useEffect(() => {
    api.listChecklistTypes().then(setTypes).catch((e: any) => setError(e.message));
  }, [api]);

  async function addType() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const rows = await api.createChecklistType({ name: newName.trim(), icon: newIcon.trim() || null });
      setTypes(rows ? [rows] : types); // backend returns one row
      // Refresh full list
      const fresh = await api.listChecklistTypes();
      setTypes(fresh);
      setNewName('');
      setNewIcon('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(key: string, active: boolean) {
    setSaving(true);
    setError(null);
    try {
      await api.updateChecklistType(key, { active });
      const fresh = await api.listChecklistTypes();
      setTypes(fresh);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(key: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteChecklistType(key);
      const fresh = await api.listChecklistTypes();
      setTypes(fresh);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={box}>
      <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Checklist catalog</strong>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
        The global set of checklist types. Inactive types are hidden from branches but their history is preserved.
      </div>
      {error && (
        <div style={{ ...box, borderColor: 'var(--danger-line)', color: 'var(--danger)', marginBottom: 10 }}>{error}</div>
      )}
      {!types && !error && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
      {types && types.map((t) => (
        <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{t.icon || '📋'}</span>
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{t.key}</span>
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: t.active ? 'var(--green-l)' : 'var(--line)',
              color: t.active ? 'var(--green)' : 'var(--muted)',
              cursor: 'pointer',
            }}
            onClick={() => !saving && toggleActive(t.key, !t.active)}
            title={t.active ? 'Click to deactivate' : 'Click to activate'}
          >
            {t.active ? 'Active' : 'Inactive'}
          </span>
          <button
            style={btnDanger}
            disabled={saving}
            onClick={() => deleteType(t.key)}
            title="Delete (blocked if any submission exists)"
          >
            Delete
          </button>
        </div>
      ))}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={lbl}>New type name</label>
          <input style={inp} value={newName} placeholder="e.g. PM Checks" onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <label style={lbl}>Icon (emoji)</label>
          <input style={{ ...inp, width: 80 }} value={newIcon} placeholder="🔧" maxLength={4} onChange={(e) => setNewIcon(e.target.value)} />
        </div>
        <button style={btn} disabled={saving || !newName.trim()} onClick={addType}>
          {saving ? 'Adding…' : '+ Add type'}
        </button>
      </div>
    </div>
  );
}

// ── Branch assignments panel ─────────────────────────────────────────────────

function AssignmentsPanel({ api, branches }: { api: Api; branches: BranchConfigRow[] }) {
  const [branch, setBranch] = useState('');
  const [rows, setRows] = useState<BranchChecklistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!branch) { setRows(null); return; }
    setError(null);
    setSaved(false);
    api.getBranchAssignments(branch).then(setRows).catch((e: any) => setError(e.message));
  }, [api, branch]);

  function move(idx: number, dir: number) {
    if (!rows) return;
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
    setRows(next.map((r, i) => ({ ...r, sort: (i + 1) * 10 })));
    setSaved(false);
  }

  function toggleRow(idx: number) {
    if (!rows) return;
    const next = rows.slice();
    next[idx] = { ...next[idx], active: !next[idx].active };
    setRows(next);
    setSaved(false);
  }

  async function save() {
    if (!rows || !branch) return;
    setSaving(true);
    setError(null);
    try {
      const fresh = await api.putBranchAssignments({
        branchId: branch,
        assignments: rows.map((r, i) => ({ typeKey: r.typeKey, sort: (i + 1) * 10, active: r.active })),
      });
      setRows(fresh);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={box}>
      <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Branch checklist assignments</strong>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
        Choose which checklists run at each branch and their order. Inactive types are hidden from staff.
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Branch</label>
        <select style={inp} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Select a branch…</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>{b.branch_name || b.branch_id}</option>
          ))}
        </select>
      </div>
      {error && <div style={{ ...box, borderColor: 'var(--danger-line)', color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
      {branch && !rows && !error && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
      {rows && rows.map((r, idx) => (
        <div key={r.typeKey} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
          borderBottom: '1px solid var(--line)',
          opacity: r.active ? 1 : 0.5,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button style={{ ...btnGhost, padding: '2px 7px', fontSize: 11 }} onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
            <button style={{ ...btnGhost, padding: '2px 7px', fontSize: 11 }} onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}>↓</button>
          </div>
          <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{r.icon || '📋'}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.name}</span>
          <span
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
              background: r.active ? 'var(--green-l)' : 'var(--line)',
              color: r.active ? 'var(--green)' : 'var(--muted)',
            }}
            onClick={() => toggleRow(idx)}
            title="Toggle active/inactive for this branch"
          >
            {r.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      ))}
      {rows && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button style={btn} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save assignments'}</button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved ✓</span>}
        </div>
      )}
    </div>
  );
}

// ── Clone panel ──────────────────────────────────────────────────────────────

function ClonePanel({ api, branches }: { api: Api; branches: BranchConfigRow[] }) {
  const [fromBranch, setFromBranch] = useState('');
  const [toBranches, setToBranches] = useState<string[]>([]);
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [include, setInclude] = useState<'structure+items' | 'structure'>('structure+items');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ branchId: string; ok: boolean; error?: string }[] | null>(null);

  function toggleTarget(id: string) {
    setToBranches((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setResult(null);
  }

  async function run() {
    if (!fromBranch || toBranches.length === 0) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.cloneChecklists({ fromBranch, toBranches, mode, include });
      setResult(res.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const targetBranches = branches.filter((b) => b.branch_id !== fromBranch);

  return (
    <div style={box}>
      <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Clone checklists to other branches</strong>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
        Copy a branch's checklist setup (which types are active + their items) onto one or more other branches.
      </div>
      {error && <div style={{ ...box, borderColor: 'var(--danger-line)', color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={lbl}>Copy FROM branch</label>
          <select style={inp} value={fromBranch} onChange={(e) => { setFromBranch(e.target.value); setToBranches([]); setResult(null); }}>
            <option value="">Select source branch…</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name || b.branch_id}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label style={lbl}>Mode</label>
          <select style={inp} value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}>
            <option value="merge">Merge — add missing only</option>
            <option value="replace">Replace — clear and overwrite</option>
          </select>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label style={lbl}>Include</label>
          <select style={inp} value={include} onChange={(e) => setInclude(e.target.value as 'structure+items' | 'structure')}>
            <option value="structure+items">Structure + items</option>
            <option value="structure">Structure only</option>
          </select>
        </div>
      </div>
      {fromBranch && (
        <>
          <label style={lbl}>Copy TO branches (select multiple)</label>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 12 }}>
            {targetBranches.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No other branches available.</div>
            )}
            {targetBranches.map((b) => {
              const checked = toBranches.includes(b.branch_id);
              const res = result?.find((r) => r.branchId === b.branch_id);
              return (
                <label key={b.branch_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleTarget(b.branch_id)} />
                  <span style={{ flex: 1, fontSize: 13 }}>{b.branch_name || b.branch_id}</span>
                  {res && (
                    <span style={{ fontSize: 11, color: res.ok ? 'var(--green)' : 'var(--danger)' }}>
                      {res.ok ? '✓ Done' : '✗ ' + res.error}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={btn} disabled={running || toBranches.length === 0} onClick={run}>
              {running ? 'Cloning…' : `Clone to ${toBranches.length || 'selected'} branch${toBranches.length !== 1 ? 'es' : ''}`}
            </button>
            {toBranches.length > 0 && !running && (
              <button style={btnGhost} onClick={() => setToBranches(targetBranches.map((b) => b.branch_id))}>
                Select all
              </button>
            )}
            {result && (
              <span style={{ fontSize: 12, color: result.every((r) => r.ok) ? 'var(--green)' : 'var(--danger)' }}>
                {result.filter((r) => r.ok).length}/{result.length} succeeded
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function ManageChecklists({ api }: { api: Api }) {
  const [branches, setBranches] = useState<BranchConfigRow[]>([]);

  useEffect(() => {
    api.branchConfigs().then(setBranches).catch(() => {});
  }, [api]);

  return (
    <div>
      <div className="pagetitle">Manage checklists</div>
      <div className="pagesub">
        Add new checklist types, control which types each branch runs, and clone setups across branches.
      </div>
      <CatalogPanel api={api} />
      <AssignmentsPanel api={api} branches={branches} />
      <ClonePanel api={api} branches={branches} />
    </div>
  );
}

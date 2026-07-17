import { useEffect, useState } from 'react';
import { Api, Checklist, ChecklistItem, MediaRef, Me, SubmissionItemInput, uploadToBlob } from './api';

// All Stories branches (Dynamics 365 BC store codes S0001–S0025). Mirrors the
// backend seed so the picker lists every branch; defaults to the signed-in
// user's home branch when they have one.
const DEMO_BRANCHES = [
  { id: 'S0001', name: 'Store 1 — Jnah' },
  { id: 'S0002', name: 'Ramlet El Bayda' },
  { id: 'S0003', name: 'Verdun 2' },
  { id: 'S0004', name: 'Cubic — Sin el Fil' },
  { id: 'S0005', name: 'Khalde 1 — MATTA' },
  { id: 'S0006', name: 'Dunes' },
  { id: 'S0007', name: 'Khalde 2 — Drive Thru' },
  { id: 'S0008', name: 'Ain Mreisseh' },
  { id: 'S0009', name: 'Airport Road' },
  { id: 'S0010', name: 'Zalqa' },
  { id: 'S0011', name: 'Antelias' },
  { id: 'S0012', name: 'Le Mall' },
  { id: 'S0013', name: 'Kaslik' },
  { id: 'S0014', name: 'Mansourieh' },
  { id: 'S0015', name: 'Batroun' },
  { id: 'S0016', name: 'Aley' },
  { id: 'S0017', name: 'Rawche — Arjan' },
  { id: 'S0018', name: 'Amioun' },
  { id: 'S0019', name: 'Centromall' },
  { id: 'S0020', name: 'Rabieh — BAYADA' },
  { id: 'S0021', name: 'Saida' },
  { id: 'S0022', name: 'Tyre' },
  { id: 'S0023', name: 'Jbeil' },
  { id: 'S0024', name: 'Broumana' },
  { id: 'S0025', name: 'Store 25' },
];

// Checklists run in shift order — opening, then handover, then closing —
// regardless of what order the API returns them in.
const CHECKLIST_ORDER: Record<string, number> = { opening: 0, handover: 1, closing: 2 };

type Value = { valueCheck?: 'pass' | 'fail'; valueNumber?: number; valueText?: string; media?: MediaRef[] };
type Values = Record<string, Value>;

// Local calendar date (branch timezone), not UTC — 'en-CA' formats as YYYY-MM-DD.
const today = () => new Date().toLocaleDateString('en-CA');

function isFilled(item: ChecklistItem, v: Value | undefined): boolean {
  if (!v) return false;
  switch (item.type) {
    case 'check': return v.valueCheck === 'pass' || v.valueCheck === 'fail';
    case 'number': return v.valueNumber != null && !Number.isNaN(v.valueNumber);
    case 'text': return !!(v.valueText && v.valueText.trim());
    case 'photo':
    case 'video': return !!(v.media && v.media.length);
    default: return false;
  }
}

function progress(list: Checklist, values: Values) {
  const req = list.items.filter((i) => i.required);
  const done = req.filter((i) => isFilled(i, values[i.id])).length;
  return { done, total: req.length, pct: req.length ? Math.round((done / req.length) * 100) : 100 };
}

export function BranchApp({ api, me }: { api: Api; me: Me | null }) {
  const [branchId, setBranchId] = useState<string>(me?.branch?.id || DEMO_BRANCHES[0].id);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [open, setOpen] = useState<Checklist | null>(null);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Anti-fraud timing: the server-issued session and the moment each item was
  // first completed, used to derive per-item dwell + order at submit time.
  const [session, setSession] = useState<{ sessionId: string; startedAtMs: number } | null>(null);
  const [completedAt, setCompletedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    if (me?.branch?.id) setBranchId(me.branch.id);
  }, [me]);

  useEffect(() => {
    let stale = false; // ignore a slow response after the branch changed again
    setOpen(null);
    setError(null);
    api
      .checklists(branchId)
      .then((c) => {
        if (!stale) setChecklists(Array.isArray(c) ? c : []);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [api, branchId]);

  async function openChecklist(c: Checklist) {
    setValues({});
    setCompletedAt({});
    setError(null);
    setOpen(c);
    // Ask the server to open a timed session (start clock is server-side, so it
    // can't be faked). If it fails — e.g. demo backend — fall back to a local
    // clock so timing still works, just without server verification of the total.
    try {
      const s = await api.startSession({ branchId, templateKey: c.key, businessDate: today() });
      setSession({ sessionId: s.sessionId, startedAtMs: Date.now() });
    } catch {
      setSession({ sessionId: '', startedAtMs: Date.now() });
    }
  }

  // Stamp the completion time the first moment an item becomes filled, so we can
  // measure the transition time between one check and the next.
  useEffect(() => {
    if (!open) return;
    setCompletedAt((prev) => {
      let next = prev;
      for (const item of open.items) {
        if (isFilled(item, values[item.id]) && prev[item.id] == null) {
          if (next === prev) next = { ...prev };
          next[item.id] = Date.now();
        }
      }
      return next;
    });
  }, [values, open]);

  async function capture(item: ChecklistItem, kind: 'photo' | 'video', file: File) {
    setBusy(item.id);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const token = await api.uploadToken({ branchId, businessDate: today(), itemKey: item.id, kind, ext });
      await uploadToBlob(token, file);
      setValues((v) => ({
        ...v,
        [item.id]: { ...v[item.id], media: [{ kind, storageKey: token.storageKey, mime: file.type, sizeBytes: file.size }] },
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!open) return;
    setBusy('submit');
    setError(null);
    try {
      // Derive per-item timing from the completion timestamps: sequence = order
      // completed, dwellMs = gap since the previous completion (session start for
      // the first). This is the "time transition between every check".
      const ordered = Object.entries(completedAt).sort((a, b) => a[1] - b[1]);
      const seq: Record<string, number> = {};
      const dwell: Record<string, number> = {};
      let prevMs = session?.startedAtMs ?? ordered[0]?.[1];
      ordered.forEach(([id, ts], idx) => {
        seq[id] = idx + 1;
        dwell[id] = Math.max(0, ts - (prevMs ?? ts));
        prevMs = ts;
      });

      const items: SubmissionItemInput[] = Object.entries(values).map(([templateItemId, v]) => ({
        templateItemId,
        valueCheck: v.valueCheck,
        valueNumber: v.valueNumber,
        valueText: v.valueText,
        media: v.media,
        dwellMs: dwell[templateItemId],
        sequence: seq[templateItemId],
      }));
      const res = await api.submit({
        branchId,
        templateKey: open.key,
        businessDate: today(),
        sessionId: session?.sessionId || undefined,
        items,
      });
      const mins = res.durationSec != null ? ` · took ${Math.floor(res.durationSec / 60)}m ${res.durationSec % 60}s` : '';
      const pace = res.paceFlag ? ' ⚠ flagged as too fast' : '';
      alert(`Submitted — status: ${res.status.toUpperCase()} (${res.completionPct}%)${mins}${pace}`);
      setValues({}); // clear the draft so the card grid reflects reality
      setCompletedAt({});
      setSession(null);
      setOpen(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (open) {
    const p = progress(open, values);
    const missing = open.items.filter((i) => i.required && !isFilled(i, values[i.id]));
    return (
      <>
        <div className="detailhead">
          <button className="backbtn" onClick={() => setOpen(null)}>← Back</button>
          <h2>{open.icon} {open.name}</h2>
          <span className="prog">{p.done}/{p.total} · {p.pct}%</span>
        </div>
        {error && <div className="err">{error}</div>}
        {open.items.map((item) => (
          <ItemRow key={item.id} item={item} value={values[item.id]} busy={busy === item.id}
            onCheck={(val) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueCheck: val } }))}
            onNumber={(n) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueNumber: Number.isNaN(n) ? undefined : n } }))}
            onText={(t) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueText: t } }))}
            onCapture={capture} />
        ))}
        <div className="submitbar">
          <div className="txt">{missing.length ? `${missing.length} required item(s) left` : 'All required items complete ✓'}</div>
          <button className="primary" disabled={missing.length > 0 || busy === 'submit'} onClick={submit}>
            {busy === 'submit' ? 'Submitting…' : 'Submit to Head Office'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ctxbar">
        <div>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {DEMO_BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <span className="who">Signed in as <b>{me?.name || '—'}</b> · {me?.role || 'staff'}</span>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="sectionlabel">Today's checklists</div>
      <div className="cards">
        {[...checklists]
          .sort((a, b) => (CHECKLIST_ORDER[a.key] ?? 9) - (CHECKLIST_ORDER[b.key] ?? 9))
          .map((c) => {
          const p = progress(c, values);
          return (
            <div key={c.id} className="card" onClick={() => openChecklist(c)}>
              <span className={`badge ${p.pct >= 100 ? 'b-done' : p.pct > 0 ? 'b-prog' : 'b-todo'}`}>
                {p.pct >= 100 ? 'READY' : p.pct > 0 ? 'IN PROGRESS' : 'TO DO'}
              </span>
              <div className="cicon">{c.icon}</div>
              <h3>{c.name}</h3>
              <div className="sub">{c.items.length} items</div>
              <div className="bar"><i style={{ width: `${p.pct}%` }} /></div>
              <div className="meta"><span>{p.done}/{p.total} required</span><span>{p.pct}%</span></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ItemRow(props: {
  item: ChecklistItem;
  value: Value | undefined;
  busy: boolean;
  onCheck: (v: 'pass' | 'fail') => void;
  onNumber: (n: number) => void;
  onText: (t: string) => void;
  onCapture: (item: ChecklistItem, kind: 'photo' | 'video', file: File) => void;
}) {
  const { item, value } = props;
  const done = isFilled(item, value);
  const num = value?.valueNumber;
  const inRange = num != null && !item.noRange
    ? (item.min == null || num >= item.min) && (item.max == null || num <= item.max)
    : null;

  return (
    <div className={`item ${done ? 'done' : ''}`}>
      <div className="itemtop">
        <span style={{ color: done ? 'var(--green)' : 'var(--line)', fontSize: 18 }}>{done ? '✓' : '○'}</span>
        <div style={{ flex: 1 }}>
          <div className="lbl">{item.label}</div>
          {item.hint && <div className="hint">{item.hint}</div>}
        </div>
        <span className={item.required ? 'req' : 'opt'}>{item.required ? 'REQUIRED' : 'OPTIONAL'}</span>
      </div>

      {item.type === 'check' && (
        <div className="control"><div className="checkrow">
          <button className={`cbtn pass ${value?.valueCheck === 'pass' ? 'sel' : ''}`} onClick={() => props.onCheck('pass')}>✓ Pass</button>
          <button className={`cbtn fail ${value?.valueCheck === 'fail' ? 'sel' : ''}`} onClick={() => props.onCheck('fail')}>✕ Fail</button>
        </div></div>
      )}
      {item.type === 'number' && (
        <div className="control"><div className="numrow">
          <input type="number" step="0.1" value={num ?? ''} placeholder="0"
            onChange={(e) => props.onNumber(parseFloat(e.target.value))} />
          <span className="unit">{item.unit}</span>
          {!item.noRange && item.min != null && <span className="unit">· target {item.min}–{item.max}{item.unit}</span>}
          {inRange != null && <span className={`range ${inRange ? 'ok' : 'bad'}`}>{inRange ? 'in range' : 'out of range'}</span>}
        </div></div>
      )}
      {item.type === 'text' && (
        <div className="control">
          <textarea placeholder="Type a note…" value={value?.valueText ?? ''} onChange={(e) => props.onText(e.target.value)} />
        </div>
      )}
      {(item.type === 'photo' || item.type === 'video') && (
        <div className="control"><div className="capture">
          <label className={`capbtn ${item.type === 'video' ? 'video' : ''}`}>
            {item.type === 'photo' ? '📷' : '🎥'} {props.busy ? 'Uploading…' : value?.media?.length ? 'Retake' : item.type === 'photo' ? 'Take photo' : 'Record video'}
            <input type="file" accept={item.type === 'photo' ? 'image/*' : 'video/*'} capture="environment"
              onChange={(e) => e.target.files?.[0] && props.onCapture(item, item.type as 'photo' | 'video', e.target.files[0])} />
          </label>
          {value?.media?.length ? <span className="captured-tag">✓ captured</span> : null}
        </div></div>
      )}
    </div>
  );
}

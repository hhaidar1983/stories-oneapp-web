import { useEffect, useState } from 'react';
import { Api, AppNotification, ResolutionLogRow, SubmissionDetail, SubmissionSummary } from './api';

// Local calendar date (branch timezone), not UTC — 'en-CA' formats as YYYY-MM-DD.
const today = () => new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('en-CA');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtNiceDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
}
function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return y + '-' + mo + '-' + da;
}

function fmtDur(sec?: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
// Reviewers think in seconds, not milliseconds: "0ms" and "398ms" read as a
// glitch rather than as "they did not stop to look at it".
function fmtDwell(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return 'under 1s';
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

// An alert’s severity, as a class on the row. Good news, something to look at
// and a real escalation should not all shout in the same colour.
function alertKind(kind: string): string {
  if (kind === 'escalation') return 'k-escalation';
  if (kind === 'submission_flagged') return 'k-flagged';
  if (kind === 'submission_clear') return 'k-clear';
  return 'k-digest';
}
function alertIcon(kind: string): string {
  if (kind === 'escalation') return '▲';
  if (kind === 'submission_flagged') return '⚑';
  if (kind === 'submission_clear') return '✓';
  return '•';
}

// Only allow https media links; never render a javascript:/data: URL into href.
function safeHttps(url: string): string | null {
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const STATUS_CLASS: Record<string, string> = {
  submitted: 'st-sub',
  flagged: 'st-flag',
  approved: 'st-approved',
  returned: 'st-returned',
  in_progress: 'st-part',
};

export function HeadOffice({ api }: { api: Api }) {
  const [rows, setRows] = useState<SubmissionSummary[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);

  function load() {
    api.submissions(`date=${today()}`)
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message));
    api.notifications(true)
      .then((n) => setNotifs(Array.isArray(n) ? n : []))
      .catch(() => {});
  }
  useEffect(load, [api]);

  return (
    <>
      {notifs.length > 0 && (
        <>
          <div className="sectionlabel">Alerts · {notifs.length}</div>
          <div className="alerts">
            {notifs.map((n) => (
              <div className={`alert ${alertKind(n.kind)}`} key={n.id}>
                <span className="ic">{alertIcon(n.kind)}</span>
                <div className="at" style={{ cursor: n.submissionId ? 'pointer' : 'default', minWidth: 0 }} onClick={() => n.submissionId && api.submission(n.submissionId).then(setDetail).catch((e) => setError(e.message))}>
                  <div className="title">{n.title}</div>
                  <div className="body" style={{ overflowWrap: 'anywhere' }}>{(n.body || '').split('View results and media:')[0].split('Daily report:')[0].split('https://')[0].trim()}</div>
                  {n.submissionId && <div style={{ marginTop: 4, color: '#005844', fontWeight: 700, fontSize: 13 }}>Open checklist →</div>}
                </div>
                <span className="time">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button onClick={() => api.markNotificationRead(n.id).then(load).catch((e) => setError(e.message))}>
                  Mark read
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="sectionlabel">Head office · Live submissions — today</div>
      {error && <div className="err">{error}</div>}
      <table>
        <thead>
          <tr><th>Branch</th><th>Checklist</th><th>Completion</th><th>Duration</th><th>Status</th><th>Time</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No submissions yet today.</td></tr>
          )}
          {rows.map((r) => {
            const clickable = r.status === 'submitted' || r.status === 'flagged';
            return (
              <tr key={r.id} className={clickable ? 'rowbtn' : ''}
                onClick={() => clickable && api.submission(r.id).then(setDetail).catch((e) => setError(e.message))}>
                <td><b>{r.branch.name}</b></td>
                <td>{r.name}</td>
                <td>{r.completionPct}%</td>
                <td className={r.paceFlag ? 'pace-bad' : ''}>
                  {fmtDur(r.durationSec)}{r.paceFlag ? ' ⚠' : ''}
                </td>
                <td><span className={`st ${STATUS_CLASS[r.status] || 'st-part'}`}>{r.status.toUpperCase()}</span></td>
                <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <OpsLog api={api} onOpen={(id) => api.submission(id).then(setDetail).catch((e) => setError(e.message))} />
      {detail && (
        <ReviewModal
          api={api}
          detail={detail}
          onClose={() => setDetail(null)}
          onDone={() => { setDetail(null); load(); }}
        />
      )}
    </>
  );
}

function ItemResolve({ api, submissionId, item }: { api: Api; submissionId: string; item: SubmissionDetail['items'][number] }) {
  const [res, setRes] = useState<{ r: string | null; note: string | null; by: string | null }>({ r: item.resolution, note: item.resolutionNote, by: item.resolvedByName });
  const [mode, setMode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(action: string) {
    if (action === 'escalated' && !note.trim()) { setErr('Add your remarks first'); return; }
    setBusy(true); setErr(null);
    try {
      await api.resolveItem(submissionId, item.id, { action: action as 'fixed' | 'escalated', note: note.trim() || undefined });
      setRes({ r: action, note: note.trim() || null, by: 'You' });
      setMode('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (res.r === 'fixed') {
    return <div className="rvresolved" style={{ marginTop: 6, color: '#2fbd74', fontWeight: 600 }}>Successfully fixed{res.by ? ' - ' + res.by : ''}{res.note ? ' - ' + res.note : ''}</div>;
  }
  if (res.r === 'escalated') {
    return <div className="rvresolved" style={{ marginTop: 6, color: '#e8a33d', fontWeight: 600 }}>Escalated to Ops{res.by ? ' - ' + res.by : ''}{res.note ? ' - ' + res.note : ''}</div>;
  }
  return (
    <div className="rvresolve" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      {err ? <div className="err" style={{ margin: '4px 0' }}>{err}</div> : null}
      {mode !== 'escalate' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: '#1f7a4d', color: '#fff' }} disabled={busy} onClick={() => act('fixed')}>Mark fixed</button>
          <button style={{ background: '#b5601a', color: '#fff' }} disabled={busy} onClick={() => setMode('escalate')}>Escalate to Ops</button>
        </div>
      ) : (
        <div>
          <textarea placeholder="Your remarks for the Operations Manager" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button disabled={busy} onClick={() => setMode('')}>Cancel</button>
            <button style={{ background: '#b5601a', color: '#fff' }} disabled={busy} onClick={() => act('escalated')}>Send to Ops</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OpsLog({ api, onOpen }: { api: Api; onOpen: (id: string) => void }) {
  const [reports, setReports] = useState<SubmissionSummary[]>([]);
  const [log, setLog] = useState<ResolutionLogRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [repDate, setRepDate] = useState(new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('en-CA'));
  const [err, setErr] = useState<string | null>(null);
  function loadLog() {
    api.resolutionLog().then((r) => setLog(Array.isArray(r) ? r : [])).catch((e) => setErr(e.message));
  }
  function loadReports(d: string) {
    api.submissions('date=' + d).then((r) => setReports(Array.isArray(r) ? r : [])).catch((e) => setErr(e.message));
  }
  useEffect(() => { loadLog(); loadReports(repDate); }, []);
  const shown = log.filter((l) => (filter === 'all' ? true : (l.resolution || 'pending') === filter));
  return (
    <div style={{ marginTop: 26 }}>
      <div className="sectionlabel">Operations — reports on demand</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
        <button onClick={() => { const d = addDays(repDate, -1); setRepDate(d); loadReports(d); }} aria-label="Previous day">◀</button>
        <input type="date" lang="en-GB" value={repDate} onChange={(e) => { setRepDate(e.target.value); loadReports(e.target.value); }} />
        <button onClick={() => { const d = addDays(repDate, 1); setRepDate(d); loadReports(d); }} aria-label="Next day">▶</button>
        <span style={{ fontWeight: 700, minWidth: 118 }}>{fmtNiceDate(repDate)}</span>
        <button onClick={() => loadReports(repDate)}>Load day</button>
      </div>
      {err ? <div className="err">{err}</div> : null}
      <table>
        <thead><tr><th>Branch</th><th>Checklist</th><th>Completion</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>
          {reports.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No reports for this day.</td></tr> : null}
          {reports.map((r) => (
            <tr key={r.id} className="rowbtn" onClick={() => onOpen(r.id)}>
              <td><b>{r.branch.name}</b></td>
              <td>{r.name}</td>
              <td>{r.completionPct}%</td>
              <td>{r.status.toUpperCase()}</td>
              <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sectionlabel" style={{ marginTop: 22 }}>Task log — pending and resolved</div>
      <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
        {['all', 'pending', 'fixed', 'escalated'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? '#2a6f97' : undefined, color: filter === f ? '#fff' : undefined }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>
      <table>
        <thead><tr><th>Date</th><th>Branch</th><th>Task</th><th>State</th><th>By</th><th>Remarks</th></tr></thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No flagged tasks yet.</td></tr> : null}
          {shown.map((l) => {
            const state = l.resolution || 'pending';
            const color = state === 'fixed' ? '#2fbd74' : state === 'escalated' ? '#e8a33d' : '#cc9966';
            const nice = state === 'fixed' ? 'Fixed' : state === 'escalated' ? 'Escalated' : 'Pending';
            return (
              <tr key={l.id} className="rowbtn" onClick={() => onOpen(l.submissionId)}>
                <td>{new Date(l.businessDate).toLocaleDateString('en-CA')}</td>
                <td><b>{l.branch}</b></td>
                <td>{l.label}</td>
                <td style={{ color, fontWeight: 600 }}>{nice}</td>
                <td>{l.resolvedByName || '-'}</td>
                <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{l.resolutionNote || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewModal({ api, detail, onClose, onDone }: {
  api: Api;
  detail: SubmissionDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [flags, setFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.flagged])),
  );
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'returned') {
    setBusy(true);
    setError(null);
    try {
      const itemFlags = detail.items.map((i) => ({ submissionItemId: i.id, flag: !!flags[i.id] }));
      await api.review(detail.id, { decision, comment: comment || undefined, itemFlags });
      onDone();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  // How many individual steps were answered too quickly. The total duration on
  // its own reads as a contradiction ("32m total" next to "completed too fast"),
  // so the band names the steps instead.
  const quickSteps = detail.items.filter((x) => x.paceFlag).length;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mh">
          <div>
            <h2>{detail.name}</h2>
            <div style={{ fontSize: 12.5, opacity: 0.75 }}>{detail.branch.name}</div>
          </div>
          <button style={{ color: '#eaf3ee', fontSize: 22 }} onClick={onClose}>✕</button>
        </div>
        <div className="mbody">
          {error && <div className="err">{error}</div>}
          <div className={`paceband ${detail.paceFlag ? 'bad' : ''}`}>
            <span>⏱ Total time on checklist: <b>{fmtDur(detail.durationSec)}</b></span>
            {detail.paceFlag
              ? <span className="pacewarn">
                  {quickSteps > 0
                    ? `${quickSteps} step${quickSteps === 1 ? ' was' : 's were'} answered almost instantly — worth checking the evidence before approving.`
                    : 'Finished faster than expected — worth checking the evidence before approving.'}
                </span>
              : <span className="paceok">Pace looks normal</span>}
          </div>
          {detail.items.map((i) => {
            const bad = i.flagged || i.inRange === false || i.valueCheck === 'fail';
            const isNote = i.type === 'text';
            // The headline result, as one chip. A free-text answer gets its own
            // block below the label instead, so a long note cannot stretch a pill.
            const resultTxt =
              i.type === 'number' ? `${i.valueNumber ?? '—'}${i.inRange === false ? ' · out of range' : ''}`
              : i.type === 'check' ? (i.valueCheck === 'pass' ? '✓ Passed' : i.valueCheck === 'fail' ? '✕ Failed' : 'Not answered')
              : isNote ? (i.valueText ? 'Note added' : 'No note')
              : i.media.length ? `${i.media.length} ${i.media.length === 1 ? 'file' : 'files'}` : 'No media';
            return (
              <div key={i.id} className={`rvitem${bad ? ' needslook' : ''}`}>
                <div className="rvl">{i.label}</div>
                {isNote && i.valueText ? <div className="rvnote">{i.valueText}</div> : null}
                <div className="rvchips">
                  <span className={`chip ${bad ? 'bad' : 'ok'}`}>{resultTxt}</span>
                  {i.dwellMs != null && (
                    <span className={`chip ${i.paceFlag ? 'warn' : ''}`}>
                      ⏱ {fmtDwell(i.dwellMs)}{i.paceFlag ? ' · very quick' : ''}
                    </span>
                  )}
                  {(i.media ?? []).map((m) => {
                    const dist = m.distanceM != null
                      ? m.distanceM >= 1000 ? `${(m.distanceM / 1000).toFixed(1)} km` : `${m.distanceM} m`
                      : null;
                    // The thumbnails below are the way in to the photo itself, so
                    // only the location is worth a chip here.
                    if (m.geoFlag) {
                      return <span key={m.id} className="chip bad">📍 Off-site{dist ? ` (${dist} away)` : ''}</span>;
                    }
                    if (m.gpsLat != null) {
                      return <span key={m.id} className="chip">📍 On-site{dist ? ` (${dist})` : ''}</span>;
                    }
                    return null;
                  })}
                </div>
                {(i.media ?? []).some((m) => safeHttps(m.viewUrl)) && (
                  <div className="rvmedia">
                    {(i.media ?? []).map((m) => {
                      const href = safeHttps(m.viewUrl);
                      if (!href) return null;
                      const isVideo = (m.mime || '').indexOf('video/') === 0 || m.kind === 'video';
                      return (
                        <a key={m.id} href={href} target="_blank" rel="noreferrer" style={{ position: 'relative', display: 'block', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', aspectRatio: '1 / 1' }}>
                          {isVideo
                            ? <video src={href} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <img loading="lazy" src={href} alt="evidence" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                          {m.geoFlag && <span style={{ position: 'absolute', left: 3, bottom: 3, background: 'var(--danger)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>off-site</span>}
                        </a>
                      );
                    })}
                  </div>
                )}
                <div className="rvact">
                  <button className={!flags[i.id] ? 'sel-ok' : ''} onClick={() => setFlags((f) => ({ ...f, [i.id]: false }))}>OK</button>
                  <button className={flags[i.id] ? 'sel-flag' : ''} onClick={() => setFlags((f) => ({ ...f, [i.id]: true }))}>Flag</button>
                </div>
                {bad && <ItemResolve api={api} submissionId={detail.id} item={i} />}
              </div>
            );
          })}
        </div>
        <div className="mfoot">
          <input placeholder="Add a note to the branch (optional)…" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="return" disabled={busy} onClick={() => decide('returned')}>Return</button>
          <button className="approve" disabled={busy} onClick={() => decide('approved')}>Approve</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Api, AppNotification, SubmissionDetail, SubmissionSummary } from './api';

// Local calendar date (branch timezone), not UTC — 'en-CA' formats as YYYY-MM-DD.
const today = () => new Date().toLocaleDateString('en-CA');

function fmtDur(sec?: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
function fmtDwell(ms: number | null): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
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
              <div className="alert" key={n.id}>
                <span style={{ fontSize: 18 }}>⚑</span>
                <div className="at">
                  <div className="title">{n.title}</div>
                  <div className="body">{n.body}</div>
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
              ? <span className="pacewarn">⚠ Completed suspiciously fast — verify the photo/video evidence before approving.</span>
              : <span className="paceok">Pace looks normal</span>}
          </div>
          {detail.items.map((i) => {
            const bad = i.flagged || i.inRange === false || i.valueCheck === 'fail';
            const valTxt =
              i.type === 'number' ? `${i.valueNumber ?? '—'}${i.inRange === false ? ' · out of range' : ''}`
              : i.type === 'check' ? (i.valueCheck === 'pass' ? 'Passed' : i.valueCheck === 'fail' ? 'Failed' : '—')
              : i.type === 'text' ? (i.valueText ? `“${i.valueText}”` : 'No note')
              : i.media.length ? `${i.type} evidence` : 'No media';
            return (
              <div key={i.id} className="rvitem">
                <div className="rvmeta">
                  <div className="rl">
                    {i.label}
                    <span className={`dwell ${i.paceFlag ? 'bad' : ''}`}>
                      · {fmtDwell(i.dwellMs)}{i.paceFlag ? ' ⚠ too fast' : ''}
                    </span>
                  </div>
                  <div className={`rv ${bad ? 'bad' : ''}`}>
                    {valTxt}
                    {(i.media ?? []).map((m) => {
                      const href = safeHttps(m.viewUrl);
                      return href ? (
                        <span key={m.id}> · <a href={href} target="_blank" rel="noreferrer">view</a></span>
                      ) : null;
                    })}
                  </div>
                </div>
                <div className="rvact">
                  <button className={!flags[i.id] ? 'sel-ok' : ''} onClick={() => setFlags((f) => ({ ...f, [i.id]: false }))}>OK</button>
                  <button className={flags[i.id] ? 'sel-flag' : ''} onClick={() => setFlags((f) => ({ ...f, [i.id]: true }))}>Flag</button>
                </div>
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

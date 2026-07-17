import { useEffect, useState } from 'react';
import { Api, EscalationRow } from './api';

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--danger)',
  high: '#d98324',
  medium: '#c9a227',
};
const TRIGGER_LABEL: Record<string, string> = {
  flagged_evidence: 'Flagged evidence',
  not_submitted: 'Not submitted',
  low_completion: 'Low completion',
  rushed: 'Rushed / too fast',
};
const STATUS_CLASS: Record<string, string> = {
  open: 'st-flag',
  acknowledged: 'st-part',
  resolved: 'st-approved',
};

function ageOf(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d`;
}

export function Escalations({ api }: { api: Api }) {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    api
      .escalations(showResolved ? undefined : '')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [api, showResolved]);

  const visible = showResolved ? rows : rows.filter((r) => r.status !== 'resolved');

  async function act(id: string, kind: 'ack' | 'resolve') {
    setBusy(id);
    setError(null);
    try {
      if (kind === 'ack') await api.ackEscalation(id);
      else await api.resolveEscalation(id);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const openCount = rows.filter((r) => r.status === 'open').length;

  return (
    <>
      <div className="sectionlabel">
        Escalations · {openCount} open
        <button
          style={{ marginLeft: 12, fontSize: 12 }}
          onClick={() => setShowResolved((s) => !s)}
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Branch</th>
            <th>Checklist</th>
            <th>Issue</th>
            <th>Level / responsible</th>
            <th>Age</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--muted)' }}>
                No escalations{showResolved ? '' : ' open'}. 🎉
              </td>
            </tr>
          )}
          {visible.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.branch.name}</b>
              </td>
              <td style={{ textTransform: 'capitalize' }}>{r.templateKey}</td>
              <td>
                <span style={{ color: SEV_COLOR[r.severity] || 'inherit', fontWeight: 700 }}>
                  {r.severity.toUpperCase()}
                </span>{' '}
                · {TRIGGER_LABEL[r.trigger] || r.trigger}
                {r.reason ? <div style={{ fontSize: 12, opacity: 0.7 }}>{r.reason}</div> : null}
              </td>
              <td>
                <b>
                  L{r.currentLevel} · {r.levelTitle}
                </b>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {r.assignees.length ? r.assignees.join(', ') : 'no one assigned yet'}
                </div>
              </td>
              <td>{ageOf(r.createdAt)}</td>
              <td>
                <span className={`st ${STATUS_CLASS[r.status] || 'st-part'}`}>
                  {r.status.toUpperCase()}
                </span>
              </td>
              <td>
                {r.status !== 'resolved' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.status === 'open' && (
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'ack')}>
                        Acknowledge
                      </button>
                    )}
                    <button
                      className="approve"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, 'resolve')}
                    >
                      Resolve
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : 'done'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
        Issues climb the chain automatically if not acknowledged in time. Acknowledging pauses the
        clock; resolving closes the issue. People are alerted in-app, and by email/WhatsApp once
        those are connected — set all of that in Settings.
      </div>
    </>
  );
}

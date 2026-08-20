import { useEffect, useMemo, useState } from 'react';
import { Api, EscalationRow } from './api';

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--danger)',
  high: 'var(--warn-d)',
  medium: 'var(--warn)',
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
// The four rungs of the chain. Every level is always drawn, including the empty
// ones — "nothing sitting at Level 2" is itself worth seeing. Which means the
// name cannot come from the data: an empty level has no row to read it from.
const LADDER = [1, 2, 3, 4];
const LEVEL_NAME: Record<number, string> = {
  1: 'Branch Manager',
  2: 'Area Manager',
  3: 'Operations',
  4: 'Head Office',
};
const TREND_DAYS = 7;

function ageMinutes(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}
function ageOf(iso: string): string {
  const mins = ageMinutes(iso);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d`;
}
/** How full the age bar sits. Two days reads as full, so a stale item looks stale. */
function agePct(iso: string): number {
  return Math.max(5, Math.min(100, Math.round((ageMinutes(iso) / (48 * 60)) * 100)));
}
function ageTone(iso: string): string {
  const h = ageMinutes(iso) / 60;
  return h >= 48 ? 'var(--m-crit)' : h >= 12 ? 'var(--m-warn)' : 'var(--line-2)';
}
function dayKey(iso: string): string {
  return String(iso || '').slice(0, 10);
}
function shortDay(key: string): string {
  const d = new Date(key + 'T00:00:00');
  return isNaN(d.getTime()) ? key.slice(5) : String(d.getDate());
}
function longDay(key: string): string {
  const d = new Date(key + 'T00:00:00');
  return isNaN(d.getTime())
    ? key
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function cap(s: string): string {
  return String(s || '').replace(/^./, (c) => c.toUpperCase());
}

type Chip = 'all' | 'open' | 'acknowledged' | 'high' | 'stale';

export function Escalations({ api }: { api: Api }) {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [chip, setChip] = useState<Chip>('all');
  const [level, setLevel] = useState<number | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  function load() {
    api
      .escalations(showResolved ? undefined : '')
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [api, showResolved]);

  const pool = useMemo(
    () => (showResolved ? rows : rows.filter((r) => r.status !== 'resolved')),
    [rows, showResolved],
  );

  // ---- the two summaries, both of which double as filters -------------------
  const byLevel = useMemo(() => {
    const m: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of pool) {
      if (r.status !== 'resolved') m[r.currentLevel] = (m[r.currentLevel] || 0) + 1;
    }
    return m;
  }, [pool]);

  const trend = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of pool) {
      const k = dayKey(r.businessDate || r.createdAt);
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
    const out: { key: string; n: number }[] = [];
    const now = Date.now();
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const k = new Date(now - i * 86400000).toLocaleDateString('en-CA');
      out.push({ key: k, n: counts[k] || 0 });
    }
    return out;
  }, [pool]);

  const visible = useMemo(
    () =>
      pool.filter((r) => {
        if (chip === 'open' && r.status !== 'open') return false;
        if (chip === 'acknowledged' && r.status !== 'acknowledged') return false;
        if (chip === 'high' && r.severity !== 'high' && r.severity !== 'critical') return false;
        if (chip === 'stale' && ageMinutes(r.createdAt) < 48 * 60) return false;
        if (level != null && r.currentLevel !== level) return false;
        if (day && dayKey(r.businessDate || r.createdAt) !== day) return false;
        return true;
      }),
    [pool, chip, level, day],
  );

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
  const ackCount = pool.filter((r) => r.status === 'acknowledged').length;
  const highCount = pool.filter((r) => r.severity === 'high' || r.severity === 'critical').length;
  const filtered = chip !== 'all' || level != null || day != null;
  const ladderMax = Math.max(1, ...LADDER.map((l) => byLevel[l] || 0));
  const trendMax = Math.max(1, ...trend.map((t) => t.n));

  const CHIPS: { id: Chip; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: pool.length },
    { id: 'open', label: 'Open', count: openCount },
    { id: 'acknowledged', label: 'Acknowledged', count: ackCount },
    { id: 'high', label: 'High', count: highCount },
    { id: 'stale', label: 'Over 2 days' },
  ];

  return (
    <>
      <div className="pagetitle">Escalations</div>
      <p className="pagesub">
        {openCount} open. Issues climb the chain automatically if nobody acknowledges them —
        acknowledging pauses the clock, resolving closes the issue.{' '}
        <button className="linkbtn" onClick={() => setShowResolved((s) => !s)}>
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </p>
      {error && <div className="err">{error}</div>}

      <div className="filters" role="group" aria-label="Filter escalations">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            className="fchip"
            aria-pressed={chip === c.id}
            onClick={() => setChip(c.id)}
          >
            {c.label}
            {c.count != null && <span className="fcount">{c.count}</span>}
          </button>
        ))}
      </div>

      <div className="escpanels">
        <div className="panel">
          <p className="ptitle">Where it&rsquo;s stuck</p>
          <p className="psub">Open items by level · tap to filter</p>
          {LADDER.map((l, i) => {
            const n = byLevel[l] || 0;
            const title = pool.find((r) => r.currentLevel === l)?.levelTitle || LEVEL_NAME[l];
            return (
              <button
                key={l}
                className="lvrow"
                aria-pressed={level === l}
                onClick={() => setLevel(level === l ? null : l)}
              >
                <span className="lvhead">
                  <span className="lvl">
                    L{l} · {title}
                  </span>
                  <span className="val">{n}</span>
                </span>
                <span className="track">
                  <span
                    className="fill"
                    style={{
                      width: n ? `${Math.max(2, Math.round((n / ladderMax) * 100))}%` : 0,
                      background: `var(--seq-${i + 1})`,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel">
          <p className="ptitle">Raised per day</p>
          <p className="psub">Last {TREND_DAYS} days · tap a day to filter</p>
          <div className="trend" role="group" aria-label="Escalations raised per day">
            {trend.map((t) => (
              <button
                key={t.key}
                className="tcol"
                aria-pressed={day === t.key}
                aria-label={`${longDay(t.key)}: ${t.n} raised`}
                title={`${longDay(t.key)} · ${t.n} raised`}
                onClick={() => setDay(day === t.key ? null : t.key)}
              >
                <span className="tval">{t.n || ''}</span>
                <span
                  className="bar"
                  style={{ height: `${Math.max(3, Math.round((t.n / trendMax) * 54))}px` }}
                />
                <span className="d">{shortDay(t.key)}</span>
              </button>
            ))}
          </div>
          <button className="linkbtn" onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Hide the table' : 'Show as a table'}
          </button>
          {asTable && (
            <div className="minitable">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((t) => (
                    <tr key={t.key}>
                      <td data-label="Day">{longDay(t.key)}</td>
                      <td data-label="Raised">{t.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="sectionlabel listhd">
        {filtered ? `${visible.length} of ${pool.length} shown` : `${pool.length} items`}
        {filtered && (
          <button
            className="linkbtn"
            onClick={() => {
              setChip('all');
              setLevel(null);
              setDay(null);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ---- phones: one card per issue, collapsed until you open it ------- */}
      <div className="onlynarrow">
        {visible.length === 0 && (
          <div className="emptybox">No escalations match that filter. 🎉</div>
        )}
        {visible.map((r) => {
          const isOpen = openCard === r.id;
          return (
            <div key={r.id} className={`ecard sev-${r.severity}`} data-open={isOpen ? '1' : '0'}>
              <button
                className="echead"
                aria-expanded={isOpen}
                onClick={() => setOpenCard(isOpen ? null : r.id)}
              >
                <span className="ecmeta">
                  <span className={`chip sev-${r.severity}`}>{cap(r.severity)}</span>
                  <span className={`chip stt-${r.status}`}>{cap(r.status)}</span>
                  <span className="ecage">
                    <span className="agebar">
                      <i
                        style={{ width: `${agePct(r.createdAt)}%`, background: ageTone(r.createdAt) }}
                      />
                    </span>
                    {ageOf(r.createdAt)}
                  </span>
                  <span className="ecchev" aria-hidden="true">
                    ▶
                  </span>
                </span>
                <span className="ectitle">{r.branch.name}</span>
                <span className="ecsub">
                  <span style={{ textTransform: 'capitalize' }}>{r.templateKey}</span> ·{' '}
                  {(TRIGGER_LABEL[r.trigger] || r.trigger).toLowerCase()}
                </span>
              </button>
              <div className="ecbody">
                {r.reason && <div className="ecwhy">{r.reason}</div>}
                <div className="ecown">
                  <span className="lv">
                    Level {r.currentLevel} · {r.levelTitle}
                  </span>
                  <span className="who">
                    {r.assignees.map((a) => String(a).trim()).filter(Boolean).join(', ') ||
                      'no one assigned yet'}
                  </span>
                </div>
                {r.status !== 'resolved' ? (
                  <div className="ecact">
                    {r.status === 'open' && (
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'ack')}>
                        Acknowledge
                      </button>
                    )}
                    <button
                      className="go"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, 'resolve')}
                    >
                      Resolve
                    </button>
                  </div>
                ) : (
                  <div className="ecwhy">
                    Resolved {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : ''}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- wider screens: the table, which genuinely reads better here --- */}
      <div className="onlywide">
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
                  No escalations match that filter. 🎉
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id}>
                <td data-label="Branch">
                  <b>{r.branch.name}</b>
                </td>
                <td data-label="Checklist" style={{ textTransform: 'capitalize' }}>
                  {r.templateKey}
                </td>
                <td data-label="Issue">
                  <span style={{ color: SEV_COLOR[r.severity] || 'inherit', fontWeight: 700 }}>
                    {cap(r.severity)}
                  </span>{' '}
                  · {TRIGGER_LABEL[r.trigger] || r.trigger}
                  {r.reason ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.reason}</div>
                  ) : null}
                </td>
                <td data-label="Level">
                  <b>
                    L{r.currentLevel} · {r.levelTitle}
                  </b>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {r.assignees.map((a) => String(a).trim()).filter(Boolean).join(', ') ||
                      'no one assigned yet'}
                  </div>
                </td>
                <td data-label="Age">{ageOf(r.createdAt)}</td>
                <td data-label="Status">
                  <span className={`st ${STATUS_CLASS[r.status] || 'st-part'}`}>{cap(r.status)}</span>
                </td>
                <td data-label="Action">
                  {r.status !== 'resolved' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {r.status === 'open' && (
                        <button
                          className="btn-ghost"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'ack')}
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        className="btn-go"
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
      </div>

      <p className="footnote">
        People are alerted in-app, and by email or WhatsApp once those are connected — set all of
        that in Settings.
      </p>
    </>
  );
}

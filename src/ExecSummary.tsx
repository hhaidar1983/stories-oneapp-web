import { useEffect, useMemo, useState } from 'react';
import { Api, ExecConfig, ExecSummaryData, Me, Recipient } from './api';

const emptyRecipient = (): Recipient => ({ name: '', email: '', whatsapp: '' });

// Submission statuses arrive as stored values — in_progress, submitted,
// approved. The table used to print them straight through .toUpperCase(),
// so a reader saw "IN_PROGRESS". Show the words instead, and tidy up any
// status added later rather than falling back to raw text.
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  submitted: 'Submitted',
  flagged: 'Flagged',
  approved: 'Approved',
  returned: 'Returned',
};
function statusLabel(s: string): string {
  const k = String(s || '').toLowerCase().trim();
  if (!k) return String.fromCharCode(8212);
  if (STATUS_LABELS[k]) return STATUS_LABELS[k];
  return k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function statusChip(s: string): string {
  const k = String(s || '').toLowerCase().trim();
  if (k === 'flagged') return 'chip sev-high';
  if (k === 'approved' || k === 'submitted') return 'chip stt-acknowledged';
  return 'chip stt-medium';
}

type Lens = 'all' | 'flagged' | 'attention';

export function ExecSummary({ api, me }: { api: Api; me: Me | null }) {
  const today = new Date(Date.now() - 5 * 3600 * 1000).toLocaleDateString('en-CA');
  const [date, setDate] = useState(today);
  const [sum, setSum] = useState<ExecSummaryData | null>(null);
  const [cfg, setCfg] = useState<ExecConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lens, setLens] = useState<Lens>('all');
  // The denominator for "branches reporting" — a count with no total is not a
  // fact anyone can act on.
  const [branchTotal, setBranchTotal] = useState<number | null>(null);

  const canEdit = !!me && (me.role === 'admin' || me.role === 'head_office');

  function loadSummary(d: string) {
    api.execSummary(d).then(setSum).catch((e) => setErr(e.message));
  }
  useEffect(() => { loadSummary(date); }, []);
  useEffect(() => { api.execConfig().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    api.activeBranches().then((b) => setBranchTotal(Array.isArray(b) ? b.length : null)).catch(() => {});
  }, [api]);

  function setRecipient(idx: number, field: keyof Recipient, val: string) {
    if (!cfg) return;
    const recipients = cfg.recipients.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
    setCfg({ ...cfg, recipients });
  }
  function addRecipient() { if (cfg) setCfg({ ...cfg, recipients: [...cfg.recipients, emptyRecipient()] }); }
  function removeRecipient(idx: number) { if (cfg) setCfg({ ...cfg, recipients: cfg.recipients.filter((_, i) => i !== idx) }); }
  function setChannel(k: 'inApp' | 'email' | 'whatsapp', v: boolean) { if (cfg) setCfg({ ...cfg, channels: { ...cfg.channels, [k]: v } }); }

  async function save() {
    if (!cfg) return;
    setBusy(true); setErr(null); setMsg(null);
    try { const saved = await api.saveExecConfig(cfg); setCfg(saved); setMsg('Settings saved.'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function sendNow() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.sendExecSummary(date);
      const parts: string[] = [];
      if (r && r.sent && r.sent.inApp) parts.push('in-app');
      if (r && r.sent && r.sent.email) parts.push(r.sent.email + ' email');
      if (r && r.sent && r.sent.whatsapp) parts.push(r.sent.whatsapp + ' WhatsApp');
      setMsg('Sent: ' + (parts.length ? parts.join(', ') : 'no channels enabled'));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const t = sum ? sum.totals : null;
  const all = sum ? sum.branches : [];
  const attention = useMemo(
    () => all.filter((b) => String(b.status).toLowerCase() === 'flagged' || b.completionPct < 100),
    [all],
  );
  const shown = useMemo(() => {
    if (lens === 'flagged') return all.filter((b) => b.flagged > 0);
    if (lens === 'attention') return attention;
    return all;
  }, [all, attention, lens]);

  // Pending / Fixed / Escalated are a breakdown of Flagged, so they belong
  // inside that card as one bar rather than beside it as three more numbers.
  const flagged = t ? t.flaggedItems || 0 : 0;
  const parts = t ? [
    { k: 'pending', n: t.pending || 0, c: 'var(--m-warn)' },
    { k: 'fixed', n: t.fixed || 0, c: 'var(--m-good)' },
    { k: 'escalated', n: t.escalated || 0, c: 'var(--m-crit)' },
  ] : [];
  const partTotal = parts.reduce((a, p) => a + p.n, 0) || 1;

  function toggle(l: Lens) {
    setLens((cur) => (cur === l ? 'all' : l));
  }

  return (
    <div>
      <div className="pagetitle">Executive summary</div>
      <div className="daterow">
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); loadSummary(e.target.value); }}
        />
        <button className="btn-ghost" onClick={() => loadSummary(date)}>Refresh</button>
      </div>
      {err ? <div className="err">{err}</div> : null}
      {msg ? <div className="okmsg">{msg}</div> : null}

      {t ? (
        <div className="statgrid">
          <div className="statcard">
            <div className="n">
              {t.branchesReporting}
              {branchTotal ? <span className="of">/{branchTotal}</span> : null}
            </div>
            <div className="l">Branches reported</div>
            <div
              className="meter"
              role="img"
              aria-label={`${t.branchesReporting} of ${branchTotal || '?'} branches reported`}
            >
              <i style={{ width: `${branchTotal ? Math.round((t.branchesReporting / branchTotal) * 100) : 0}%` }} />
            </div>
          </div>

          <div className="statcard">
            <div className="n">{t.avgCompletion}%</div>
            <div className="l">Average completion</div>
            <div className="meter" role="img" aria-label={`${t.avgCompletion} percent average completion`}>
              <i style={{ width: `${Math.max(0, Math.min(100, t.avgCompletion))}%` }} />
            </div>
          </div>

          <button
            className="statcard wide"
            aria-pressed={lens === 'flagged'}
            onClick={() => toggle('flagged')}
          >
            <div className="n">{flagged}</div>
            <div className="l">Flagged tasks — tap to filter</div>
            {flagged > 0 && (
              <>
                <div
                  className="stack"
                  role="img"
                  aria-label={parts.map((p) => `${p.n} ${p.k}`).join(', ')}
                >
                  {parts.map((p) =>
                    p.n ? (
                      <span key={p.k} style={{ width: `${(p.n / partTotal) * 100}%`, background: p.c }} />
                    ) : null,
                  )}
                </div>
                <div className="mlegend">
                  {parts.map((p) => (
                    <span key={p.k}>
                      <i style={{ background: p.c }} />
                      <b>{p.n}</b> {p.k}
                    </span>
                  ))}
                </div>
              </>
            )}
          </button>

          <button
            className="statcard wide"
            aria-pressed={lens === 'attention'}
            onClick={() => toggle('attention')}
          >
            <div className="n">{attention.length}</div>
            <div className="l">Checklists needing attention — flagged or unfinished</div>
          </button>

          <div className="statcard wide">
            <div className="n">{t.openEscalations}</div>
            <div className="l">Escalations opened this day</div>
          </div>
        </div>
      ) : null}

      {all.length ? (
        <>
          <div className="sectionlabel listhd">
            {lens === 'all' ? 'By checklist' : `${shown.length} of ${all.length} shown`}
            {lens !== 'all' && (
              <button className="linkbtn" onClick={() => setLens('all')}>Show all</button>
            )}
          </div>

          {/* ---- phones: one compact card per checklist ------------------- */}
          <div className="onlynarrow">
            {shown.length === 0 && <div className="emptybox">Nothing matches. 🎉</div>}
            {shown.map((b, i) => (
              <div className="bcard" key={i}>
                <div className="bchead">
                  <span className="bn">{b.branch}</span>
                  <span className={statusChip(b.status)}>{statusLabel(b.status)}</span>
                </div>
                <div className="bcsub">{b.checklist}</div>
                <div className="bcbar">
                  <span className="track">
                    <i style={{ width: `${Math.max(0, Math.min(100, b.completionPct))}%` }} />
                  </span>
                  <span className="pct">{b.completionPct}%</span>
                </div>
                {(b.flagged > 0 || b.pending > 0) && (
                  <div className="bcchips">
                    {b.flagged > 0 && <span className="chip stt-medium">{b.flagged} flagged</span>}
                    {b.pending > 0 && <span className="chip stt-medium">{b.pending} pending</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ---- wider screens: the table --------------------------------- */}
          <div className="onlywide">
            <table>
              <thead>
                <tr><th>Branch</th><th>Checklist</th><th>Status</th><th>Completion</th><th>Flagged</th><th>Pending</th></tr>
              </thead>
              <tbody>
                {shown.map((b, i) => (
                  <tr key={i}>
                    <td data-label="Branch"><b>{b.branch}</b></td>
                    <td data-label="Checklist">{b.checklist}</td>
                    <td data-label="Status">{statusLabel(b.status)}</td>
                    <td data-label="Completion">{b.completionPct}%</td>
                    <td data-label="Flagged">{b.flagged}</td>
                    <td data-label="Pending">{b.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {canEdit && cfg ? (
        <div className="delivery">
          <div className="sectionlabel">Daily summary delivery</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
            <label><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Auto-send enabled</label>
            <label>Send time (Beirut): <input type="time" value={cfg.sendTime} onChange={(e) => setCfg({ ...cfg, sendTime: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0' }}>
            <label><input type="checkbox" checked={cfg.channels.inApp} onChange={(e) => setChannel('inApp', e.target.checked)} /> In-app</label>
            <label><input type="checkbox" checked={cfg.channels.email} onChange={(e) => setChannel('email', e.target.checked)} /> Email</label>
            <label><input type="checkbox" checked={cfg.channels.whatsapp} onChange={(e) => setChannel('whatsapp', e.target.checked)} /> WhatsApp</label>
          </div>
          <div style={{ margin: '8px 0', fontWeight: 600 }}>Recipients</div>
          {cfg.recipients.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <input placeholder="Name" value={r.name} onChange={(e) => setRecipient(i, 'name', e.target.value)} />
              <input placeholder="Email" value={r.email} onChange={(e) => setRecipient(i, 'email', e.target.value)} />
              <input placeholder="WhatsApp (+961...)" value={r.whatsapp} onChange={(e) => setRecipient(i, 'whatsapp', e.target.value)} />
              <button className="btn-ghost" onClick={() => removeRecipient(i)}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={addRecipient}>Add recipient</button>
            <button className="btn-go" disabled={busy} onClick={save}>Save settings</button>
            <button className="btn-go" disabled={busy} onClick={sendNow}>Send now (this day)</button>
          </div>
          <p className="footnote">
            Email uses the Microsoft/Outlook sender; WhatsApp uses the 4jawaly channel. Each is only
            sent when its credentials are configured on the server.
          </p>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Api, ExecConfig, ExecSummaryData, Me, Recipient } from './api';

const emptyRecipient = (): Recipient => ({ name: '', email: '', whatsapp: '' });

export function ExecSummary({ api, me }: { api: Api; me: Me | null }) {
  const today = new Date().toLocaleDateString('en-CA');
  const [date, setDate] = useState(today);
  const [sum, setSum] = useState<ExecSummaryData | null>(null);
  const [cfg, setCfg] = useState<ExecConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = !!me && (me.role === 'admin' || me.role === 'head_office');

  function loadSummary(d: string) {
    api.execSummary(d).then(setSum).catch((e) => setErr(e.message));
  }
  useEffect(() => { loadSummary(date); }, []);
  useEffect(() => { api.execConfig().then(setCfg).catch(() => {}); }, []);

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
  return (
    <div>
      <div className="sectionlabel">Executive summary</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadSummary(e.target.value); }} />
        <button onClick={() => loadSummary(date)}>Refresh</button>
      </div>
      {err ? <div className="err">{err}</div> : null}
      {msg ? <div style={{ color: '#2fbd74', margin: '6px 0' }}>{msg}</div> : null}
      {t ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '10px 0' }}>
          <Stat label="Branches reporting" value={t.branchesReporting} />
          <Stat label="Avg completion" value={t.avgCompletion + '%'} />
          <Stat label="Flagged tasks" value={t.flaggedItems} />
          <Stat label="Pending" value={t.pending} />
          <Stat label="Fixed" value={t.fixed} />
          <Stat label="Escalated" value={t.escalated} />
          <Stat label="Open escalations" value={t.openEscalations} />
        </div>
      ) : null}
      {sum && sum.branches.length ? (
        <table>
          <thead>
            <tr><th>Branch</th><th>Checklist</th><th>Status</th><th>Completion</th><th>Flagged</th><th>Pending</th></tr>
          </thead>
          <tbody>
            {sum.branches.map((b, i) => (
              <tr key={i}>
                <td><b>{b.branch}</b></td>
                <td>{b.checklist}</td>
                <td>{String(b.status).toUpperCase()}</td>
                <td>{b.completionPct}%</td>
                <td>{b.flagged}</td>
                <td>{b.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {canEdit && cfg ? (
        <div style={{ marginTop: 26, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14 }}>
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
              <button onClick={() => removeRecipient(i)}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={addRecipient}>Add recipient</button>
            <button disabled={busy} onClick={save} style={{ background: '#1f7a4d', color: '#fff' }}>Save settings</button>
            <button disabled={busy} onClick={sendNow} style={{ background: '#2a6f97', color: '#fff' }}>Send now (this day)</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
            Email uses the Microsoft/Outlook sender; WhatsApp uses the 4jawaly channel. Each is only sent when its credentials are configured on the server.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
    </div>
  );
}

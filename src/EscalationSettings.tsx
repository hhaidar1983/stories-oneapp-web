import { useEffect, useState } from 'react';
import { Api, EscalationConfig, Level, Person, SectionKey, TriggerKey, BranchConfigRow } from './api';

const SECTIONS: { key: SectionKey; name: string }[] = [
  { key: 'opening', name: 'Opening' },
  { key: 'handover', name: 'Shift Handover' },
  { key: 'closing', name: 'Closing' },
];
const TRIGGERS: { key: TriggerKey; name: string }[] = [
  { key: 'flagged_evidence', name: 'Flagged evidence (off-site / out-of-range / failed check)' },
  { key: 'not_submitted', name: 'Not submitted by deadline' },
  { key: 'low_completion', name: 'Low completion' },
  { key: 'rushed', name: 'Rushed / too fast' },
];
const SEVERITIES = ['critical', 'high', 'medium'] as const;
const levelsFrom = (start: number, max: number): number[] => { const out: number[] = []; for (let l = Math.max(1, start || 1); l <= max; l++) out.push(l); return out; };

const box: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #DCE8E1',
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
};
const lbl: React.CSSProperties = { fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 4 };
const inp: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #DCE8E1',
  color: '#14201A',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
};

export function EscalationSettings({ api }: { api: Api }) {
  const [cfg, setCfg] = useState<EscalationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testLevel, setTestLevel] = useState(1)
  const [branch, setBranch] = useState('')
  const [branches, setBranches] = useState<BranchConfigRow[]>([]);

  useEffect(() => {
    api
      .escalationConfig(branch || undefined)
      .then(setCfg)
      .catch((e) => setError(e.message));
  }, [api, branch]);

  useEffect(() => {
    api.branchConfigs().then((rows) => setBranches(rows)).catch(() => {})
  }, [api])

  if (error) return <div className="err">{error}</div>;
  if (!cfg) return <div className="center">Loading settings…</div>;

  const update = (patch: Partial<EscalationConfig>) => {
    setCfg({ ...cfg, ...patch });
    setSaved(false);
  };

  const setLevel = (i: number, l: Level) => {
    const levels = cfg.levels.slice();
    levels[i] = l;
    update({ levels });
  };
  const setPerson = (li: number, pi: number, p: Person) => {
    const people = cfg.levels[li].people.slice();
    people[pi] = p;
    setLevel(li, { ...cfg.levels[li], people });
  };
  const addPerson = (li: number) =>
    setLevel(li, {
      ...cfg.levels[li],
      people: [...cfg.levels[li].people, { name: '', email: '', whatsapp: '' }],
    });
  const removePerson = (li: number, pi: number) =>
    setLevel(li, {
      ...cfg.levels[li],
      people: cfg.levels[li].people.filter((_, x) => x !== pi),
    });

  const addLevel = () => {
    const n = cfg.levels.length + 1;
    update({ levels: [...cfg.levels, { level: n, title: '', people: [] }], climbMinutes: { ...cfg.climbMinutes, [String(n - 1)]: cfg.climbMinutes[String(n - 1)] ?? 30 } });
  };

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const out = await api.saveEscalationConfig(cfg, branch || undefined);
      setCfg(out);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await api.testEscalation({ level: testLevel });
      const who = r.recipients.length
        ? r.recipients.map((p) => p.name || p.email).filter(Boolean).join(', ')
        : 'no one is assigned at this level yet';
      setTestMsg('Sent a test to L' + r.level + ' (' + r.levelTitle + ') for ' + r.branch + '. Recipients: ' + who + '.');
    } catch (e: any) {
      setTestMsg('Test failed: ' + (e?.message || e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <div className="sectionlabel">Escalation chain</div>
<p style={{ fontSize: 12, opacity: 0.7, marginTop: -2, marginBottom: 12 }}>Who gets alerted when a problem is raised, and how fast it climbs the chain. To choose which problems trigger and set deadlines per branch, use the Branch alerts tab.</p>
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Branch scope</label>
        <select style={inp} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Company default (all branches)</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>{b.branch_name || b.branch_id}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
          {branch ? 'Editing the escalation chain for this branch only.' : 'Editing the company-wide default chain. Pick a branch to set an override.'}
        </div>
      </div>

      {/* CHAIN + PEOPLE */}
      <h3 style={{ margin: '6px 0' }}>1 · The management chain &amp; who to notify</h3>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>
        Add every person for each level, with their Stories Coffee email and WhatsApp number. You can
        assign several people to the same level — they all get alerted.
      </div>
      {cfg.levels.map((lv, li) => (
        <div key={li} style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <b>Level {lv.level}</b>
            <input
              style={{ ...inp, flex: 1 }}
              value={lv.title}
              onChange={(e) => setLevel(li, { ...lv, title: e.target.value })}
            />
          </div>
          {lv.people.map((p, pi) => (
            <div
              key={pi}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.2fr auto', gap: 8, marginBottom: 6 }}
            >
              <input
                style={inp}
                placeholder="Name"
                value={p.name}
                onChange={(e) => setPerson(li, pi, { ...p, name: e.target.value })}
              />
              <input
                style={inp}
                placeholder="name@storiescoffee.com"
                value={p.email}
                onChange={(e) => setPerson(li, pi, { ...p, email: e.target.value })}
              />
              <input
                style={inp}
                placeholder="+9613 000000 (WhatsApp)"
                value={p.whatsapp}
                onChange={(e) => setPerson(li, pi, { ...p, whatsapp: e.target.value })}
              />
              <button onClick={() => removePerson(li, pi)}>✕</button>
            </div>
          ))}
          <button style={{ fontSize: 12 }} onClick={() => addPerson(li)}>
            + Add person
          </button>
        </div>
      ))}

      <button style={{ fontSize: 12, marginTop: 2 }} onClick={addLevel}>+ Add level</button>

      {/* CLIMB TIMINGS */}
      <h3 style={{ margin: '14px 0 6px' }}>2 · Time to climb each level</h3>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>
        Minutes an issue waits, unacknowledged, before it moves up to the next level.
      </div>
      <div style={box}>
        {cfg.levels.slice(0, -1).map((lv, i) => {
          const next = cfg.levels[i + 1];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 13 }}>
                {lv.title} → {next.title}
              </span>
              <input
                type="number"
                min={1}
                style={{ ...inp, width: 90 }}
                value={cfg.climbMinutes[String(lv.level)] ?? 30}
                onChange={(e) =>
                  update({
                    climbMinutes: { ...cfg.climbMinutes, [String(lv.level)]: Number(e.target.value) },
                  })
                }
              />
              <span style={{ fontSize: 12, opacity: 0.6 }}>minutes</span>
            </div>
          );
        })}
      </div>

      {/* PER-SECTION SEVERITY */}
      <h3 style={{ margin: '14px 0 6px' }}>3 · Severity &amp; entry level, per checklist</h3>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>
        For each checklist section, set how severe each problem is and which level it enters the chain
        at. Turn a trigger off to ignore it for that section.
      </div>
      {SECTIONS.map((s) => (
        <div key={s.key} style={box}>
          <b>{s.name}</b>
          <div style={{ marginTop: 6 }}>
            <label style={lbl}>Deadline (branch-local, HH:MM)</label>
            <input
              style={{ ...inp, width: 110 }}
              value={cfg.deadlines[s.key] ?? ''}
              onChange={(e) => update({ deadlines: { ...cfg.deadlines, [s.key]: e.target.value } })}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            {TRIGGERS.map((t) => {
              const rule = cfg.sectionRules[s.key][t.key];
              const setRule = (patch: Partial<typeof rule>) => {
                const sectionRules = { ...cfg.sectionRules };
                sectionRules[s.key] = {
                  ...sectionRules[s.key],
                  [t.key]: { ...rule, ...patch },
                };
                update({ sectionRules });
              };
              return (
                <div
                  key={t.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 6,
                    opacity: rule.enabled ? 1 : 0.45,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => setRule({ enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 12.5 }}>{t.name}</span>
                  <select
                    style={inp}
                    value={rule.severity}
                    onChange={(e) => setRule({ severity: e.target.value as any })}
                  >
                    {SEVERITIES.map((sv) => (
                      <option key={sv} value={sv}>
                        {sv}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cfg.levels.map((lv) => {
                    const cur = rule.levels && rule.levels.length ? rule.levels : levelsFrom(rule.startLevel, cfg.levels.length);
                    const on = cur.indexOf(lv.level) >= 0;
                    return (
                      <label key={lv.level} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                        <input type="checkbox" checked={on} onChange={(e) => { const base = rule.levels && rule.levels.length ? rule.levels.slice() : levelsFrom(rule.startLevel, cfg.levels.length); const nx = e.target.checked ? Array.from(new Set([...base, lv.level])).sort((a, b) => a - b) : base.filter((x) => x !== lv.level); setRule({ levels: nx, startLevel: nx[0] || lv.level }); }} />
                        L{lv.level} · {lv.title}
                      </label>
                    );
                  })}
                </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* CHANNELS */}
      <h3 style={{ margin: '14px 0 6px' }}>4 · Alert channels</h3>
      <div style={box}>
        {(['inApp', 'email', 'whatsapp'] as const).map((ch) => (
          <label key={ch} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 18 }}>
            <input
              type="checkbox"
              checked={cfg.channels[ch]}
              onChange={(e) => update({ channels: { ...cfg.channels, [ch]: e.target.checked } })}
            />
            {ch === 'inApp' ? 'In-app' : ch === 'email' ? 'Email' : 'WhatsApp'}
          </label>
        ))}
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
          In-app works now. Email &amp; WhatsApp deliver once their sending accounts are connected.
        </div>
      </div>

      <h3 style={{ margin: '14px 0 6px' }}>5 · Send a test alert</h3>
      <div style={box}>
        <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>
          Fire a harmless test alert to check delivery. It routes exactly like a real one — Level 1 to
          the branch's own manager, Level 2 to its area manager.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>Send to</span>
          <select style={inp} value={testLevel} onChange={(e) => setTestLevel(Number(e.target.value))}>
            {cfg.levels.map((lv) => (
              <option key={lv.level} value={lv.level}>
                L{lv.level} · {lv.title}
              </option>
            ))}
          </select>
          <button disabled={testing} onClick={sendTest}>
            {testing ? 'Sending…' : 'Send test alert'}
          </button>
        </div>
        {testMsg && (
          <div style={{ fontSize: 12.5, marginTop: 8, color: '#086C42' }}>{testMsg}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <button className="primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span style={{ color: '#086C42' }}>Saved ✓</span>}
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Api, BranchConfigRow, ChecklistAdminItem, ChecklistAdminSection } from './api';

const TYPE_OPTIONS = [
  { v: 'check', label: 'Checkbox (done / not done)' },
  { v: 'number', label: 'Number reading' },
  { v: 'photo', label: 'Photo' },
  { v: 'video', label: 'Video' },
  { v: 'text', label: 'Text note' },
];

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
const btnX: React.CSSProperties = {
  background: '#fff',
  color: 'var(--danger)',
  border: '1px solid var(--danger-line)',
  borderRadius: 6,
  padding: '4px 9px',
  fontSize: 12,
  cursor: 'pointer',
};

function blankItem(): ChecklistAdminItem {
  return {
    id: null,
    sort: 0,
    label: '',
    type: 'check',
    required: true,
    unit: null,
    min: null,
    max: null,
    noRange: false,
    needsPhoto: false,
    needsVideo: false,
    hint: null,
  };
}

let __uidSeq = 1;
const nextUid = () => 'u' + __uidSeq++;
function withUid(it: ChecklistAdminItem): ChecklistAdminItem {
  return (it as any)._uid ? it : ({ ...it, _uid: nextUid() } as any);
}
function withUidSections(secs: ChecklistAdminSection[] | null) {
  return secs ? secs.map((sc) => ({ ...sc, items: sc.items.map(withUid) })) : secs;
}
function stripUid(it: ChecklistAdminItem): ChecklistAdminItem {
  const clone: any = { ...(it as any) };
  delete clone._uid;
  return clone as ChecklistAdminItem;
}

export function ChecklistEditor({ api }: { api: Api }) {
  const [branches, setBranches] = useState<BranchConfigRow[]>([]);
  const [branch, setBranch] = useState('');
  const [sections, setSections] = useState<ChecklistAdminSection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; from: number } | null>(null);

  useEffect(() => {
    api.branchConfigs().then(setBranches).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!branch) {
      setSections(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSavedKey(null);
    api
      .adminChecklists(branch)
      .then((sc) => setSections(withUidSections(sc)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api, branch]);

  function patchSection(key: string, items: ChecklistAdminItem[]) {
    setSections((prev) =>
      prev ? prev.map((s) => (s.key === key ? { ...s, items } : s)) : prev,
    );
    setSavedKey(null);
  }
  function setItem(key: string, idx: number, patch: Partial<ChecklistAdminItem>) {
    const sec = sections?.find((s) => s.key === key);
    if (!sec) return;
    const items = sec.items.slice();
    items[idx] = { ...items[idx], ...patch };
    patchSection(key, items);
  }
  function addItem(key: string) {
    const sec = sections?.find((s) => s.key === key);
    if (!sec) return;
    patchSection(key, [...sec.items, withUid(blankItem())]);
  }
  function removeItem(key: string, idx: number) {
    const sec = sections?.find((s) => s.key === key);
    if (!sec) return;
    patchSection(
      key,
      sec.items.filter((_, i) => i !== idx),
    );
  }
  function move(key: string, idx: number, dir: number) {
    const sec = sections?.find((s) => s.key === key);
    if (!sec) return;
    const j = idx + dir;
    if (j < 0 || j >= sec.items.length) return;
    const items = sec.items.slice();
    const tmp = items[idx];
    items[idx] = items[j];
    items[j] = tmp;
    patchSection(key, items);
  }
  function moveTo(key: string, from: number, to: number) {
    if (from === to) return;
    const sec = sections?.find((sc) => sc.key === key);
    if (!sec) return;
    const items = sec.items.slice();
    const [m] = items.splice(from, 1);
    items.splice(to, 0, m);
    patchSection(key, items);
  }
  function insertAbove(key: string, idx: number) {
    const sec = sections?.find((sc) => sc.key === key);
    if (!sec) return;
    const items = sec.items.slice();
    items.splice(idx, 0, withUid(blankItem()));
    patchSection(key, items);
  }

  async function saveSection(key: string) {
    const sec = sections?.find((s) => s.key === key);
    if (!sec) return;
    setSavingKey(key);
    setError(null);
    setSavedKey(null);
    try {
      const updated = await api.saveChecklistSection({
        branchId: branch,
        key,
        items: sec.items.map(stripUid),
      });
      setSections(withUidSections(updated));
      setSavedKey(key);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  }

  async function resetSection(key: string) {
    setSavingKey(key);
    setError(null);
    try {
      const updated = await api.resetChecklistSection(branch, key);
      setSections(withUidSections(updated));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <div className="sectionlabel">Checklists</div>
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Branch</label>
        <select
          style={inp}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          <option value="">Select a branch…</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.branch_name || b.branch_id}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Each branch has its own Opening, Shift Handover and Closing checklists.
          Editing here changes only the selected branch.
        </div>
      </div>

      {error && (
        <div style={{ ...box, borderColor: 'var(--danger-line)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!branch && !loading && (
        <div style={{ color: 'var(--muted)' }}>
          Pick a branch to view and edit its checklists.
        </div>
      )}

      {branch &&
        sections &&
        sections.map((sec) => (
          <div style={box} key={sec.key}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                gap: 8,
              }}
            >
              <div>
                <strong style={{ color: 'var(--ink)', fontSize: 15 }}>
                  {sec.name}
                </strong>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: sec.isOverride ? 'var(--green-l)' : 'var(--line)',
                    color: sec.isOverride ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {sec.isOverride ? 'Custom for this branch' : 'Company default'}
                </span>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                  {sec.items.length} items
                </span>
              </div>
              {sec.isOverride && (
                <button
                  style={btnGhost}
                  disabled={savingKey === sec.key}
                  onClick={() => resetSection(sec.key)}
                >
                  Reset to default
                </button>
              )}
            </div>

            {sec.items.map((it, idx) => (
              <div
                key={(it as any)._uid ?? idx}
                onDragOver={(e) => {
                  if (drag && drag.key === sec.key) e.preventDefault();
                }}
                onDrop={() => {
                  if (drag && drag.key === sec.key) moveTo(sec.key, drag.from, idx);
                  setDrag(null);
                }}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  background:
                    drag && drag.key === sec.key && drag.from === idx
                      ? 'var(--green-l2)'
                      : '#fff',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <div
                      draggable
                      onDragStart={() => setDrag({ key: sec.key, from: idx })}
                      onDragEnd={() => setDrag(null)}
                      title="Drag to reorder"
                      style={{ cursor: 'grab', color: 'var(--muted)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}
                    >
                      ⣿
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{idx + 1}</div>
                    <button
                      style={btnGhost}
                      onClick={() => move(sec.key, idx, -1)}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      style={btnGhost}
                      onClick={() => move(sec.key, idx, 1)}
                      disabled={idx === sec.items.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      style={btnGhost}
                      onClick={() => insertAbove(sec.key, idx)}
                      title="Insert a new task above this one"
                    >
                      ＋↑
                    </button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      style={inp}
                      value={it.label}
                      placeholder="Item label"
                      onChange={(e) =>
                        setItem(sec.key, idx, { label: e.target.value })
                      }
                    />
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 6,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <select
                        style={{ ...inp, width: 'auto' }}
                        value={it.type}
                        onChange={(e) =>
                          setItem(sec.key, idx, { type: e.target.value })
                        }
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.v} value={o.v}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label
                        style={{
                          fontSize: 12,
                          color: 'var(--ink)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={it.required}
                          onChange={(e) =>
                            setItem(sec.key, idx, { required: e.target.checked })
                          }
                        />
                        Required
                      </label>
                      <label
                        style={{
                          fontSize: 12,
                          color: 'var(--ink)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={it.needsPhoto}
                          onChange={(e) =>
                            setItem(sec.key, idx, { needsPhoto: e.target.checked })
                          }
                        />
                        Require photo
                      </label>
                      <label
                        style={{
                          fontSize: 12,
                          color: 'var(--ink)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={it.needsVideo}
                          onChange={(e) =>
                            setItem(sec.key, idx, { needsVideo: e.target.checked })
                          }
                        />
                        Require video
                      </label>
                      {it.type === 'number' && (
                        <>
                          <input
                            style={{ ...inp, width: 80 }}
                            placeholder="Unit"
                            value={it.unit || ''}
                            onChange={(e) =>
                              setItem(sec.key, idx, {
                                unit: e.target.value || null,
                              })
                            }
                          />
                          <input
                            style={{ ...inp, width: 72 }}
                            placeholder="Min"
                            value={it.min ?? ''}
                            onChange={(e) =>
                              setItem(sec.key, idx, {
                                min:
                                  e.target.value === ''
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                          <input
                            style={{ ...inp, width: 72 }}
                            placeholder="Max"
                            value={it.max ?? ''}
                            onChange={(e) =>
                              setItem(sec.key, idx, {
                                max:
                                  e.target.value === ''
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                          <label
                            style={{
                              fontSize: 12,
                              color: 'var(--ink)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={it.noRange}
                              onChange={(e) =>
                                setItem(sec.key, idx, {
                                  noRange: e.target.checked,
                                })
                              }
                            />
                            No range
                          </label>
                        </>
                      )}
                    </div>
                    <input
                      style={{ ...inp, marginTop: 6 }}
                      placeholder="Hint (optional)"
                      value={it.hint || ''}
                      onChange={(e) =>
                        setItem(sec.key, idx, { hint: e.target.value || null })
                      }
                    />
                  </div>
                  <button
                    style={btnX}
                    title="Remove item"
                    onClick={() => removeItem(sec.key, idx)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <button style={btnGhost} onClick={() => addItem(sec.key)}>
                + Add item
              </button>
              <button
                style={btn}
                disabled={savingKey === sec.key}
                onClick={() => saveSection(sec.key)}
              >
                {savingKey === sec.key ? 'Saving…' : 'Save ' + sec.name}
              </button>
              {savedKey === sec.key && (
                <span style={{ color: 'var(--green)', fontSize: 12 }}>Saved ✓</span>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

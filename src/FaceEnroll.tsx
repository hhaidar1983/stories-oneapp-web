import { useEffect, useMemo, useState } from 'react';
import type { Api, SessionUser } from './api';
import { LivenessCheck } from './LivenessCheck';

// Manager screen: capture each staff member's face (with a live liveness check)
// so they can log in by face, and optionally set a fallback PIN.
export function FaceEnroll({ api }: { api: Api }) {
  const [staff, setStaff] = useState<SessionUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [enrolling, setEnrolling] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [pinFor, setPinFor] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .staffList()
      .then((s) => {
        if (!cancelled) setStaff(s);
      })
      .catch((e) => {
        if (!cancelled) setError(msg(e) || 'Could not load staff.');
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!staff) return [];
    if (!q) return staff;
    return staff.filter((s) => s.name.toLowerCase().includes(q) || (s.branch?.name || '').toLowerCase().includes(q));
  }, [staff, query]);

  async function finishEnroll(sessionId: string) {
    if (!enrolling) return;
    const who = enrolling;
    setEnrolling(null);
    setBusy(true);
    setNote(null);
    try {
      await api.enroll(who.id, sessionId);
      setNote({ id: who.id, text: `${who.name} enrolled ✓`, ok: true });
    } catch (e) {
      setNote({ id: who.id, text: msg(e) || 'Enrollment failed — please retry.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (enrolling) {
    return (
      <div>
        <button className="backbtn" onClick={() => setEnrolling(null)}>
          ← Cancel
        </button>
        <h2 className="logintitle">Enrolling {enrolling.name}</h2>
        <p className="loginsub">Ask them to look at the camera and keep their face in the oval.</p>
        {busy ? <div className="center">Saving…</div> : <LivenessCheck api={api} mode="enroll" onDone={finishEnroll} onCancel={() => setEnrolling(null)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="sectionlabel">Staff face &amp; PIN setup</div>
      {error && <div className="err">{error}</div>}
      <input className="search" placeholder="Search staff or branch…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!staff ? (
        <div className="center">Loading staff…</div>
      ) : (
        <div className="stafflist">
          {filtered.map((s) => (
            <div key={s.id} className="staffrow enroll">
              <div className="staffmeta">
                <span className="staffname">{s.name}</span>
                <span className="staffbranch">
                  {s.role}
                  {s.branch ? ` · ${s.branch.name}` : ''}
                </span>
                {note && note.id === s.id && <span className={note.ok ? 'okmsg' : 'err inline'}>{note.text}</span>}
              </div>
              <div className="staffactions">
                <button className="minibtn primary" disabled={busy} onClick={() => setEnrolling(s)}>
                  Enroll face
                </button>
                <button className="minibtn" disabled={busy} onClick={() => setPinFor(s)}>
                  Set PIN
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pinFor && (
        <SetPinModal
          api={api}
          staff={pinFor}
          onClose={() => setPinFor(null)}
          onDone={(text, ok) => {
            setNote({ id: pinFor.id, text, ok });
            setPinFor(null);
          }}
        />
      )}
    </div>
  );
}

function SetPinModal({
  api,
  staff,
  onClose,
  onDone,
}: {
  api: Api;
  staff: SessionUser;
  onClose: () => void;
  onDone: (text: string, ok: boolean) => void;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setPin(staff.id, pin);
      onDone(`PIN set for ${staff.name} ✓`, true);
    } catch (e) {
      setBusy(false);
      setError(msg(e) || 'Could not set PIN.');
    }
  }

  return (
    <div className="modalback" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Set a PIN for {staff.name}</h3>
        <p className="loginsub">4–6 digits. They can use this if face login ever fails.</p>
        {error && <div className="err">{error}</div>}
        <input
          className="pininput"
          inputMode="numeric"
          autoFocus
          value={pin}
          maxLength={6}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
        />
        <div className="modalbtns">
          <button className="backbtn" onClick={onClose}>
            Cancel
          </button>
          <button className="minibtn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}

function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : '';
}

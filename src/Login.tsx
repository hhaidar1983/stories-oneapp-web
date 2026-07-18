import { useEffect, useState } from 'react';
import type { Api, PinStaff } from './api';
import { LivenessCheck } from './LivenessCheck';

// The unauthenticated screen. Staff sign in by face (primary) or a PIN fallback;
// head office signs in with Microsoft. On success we hand a session token up to
// the AuthProvider, which stores it and drops the user into the app.
export function Login({
  api,
  onToken,
  onMicrosoft,
  microsoftEnabled,
}: {
  api: Api;
  onToken: (token: string) => void;
  onMicrosoft: () => void;
  microsoftEnabled: boolean;
}) {
  const [mode, setMode] = useState<'choose' | 'face' | 'pin'>('choose');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function finishFace(sessionId: string) {
    setBusy('Checking your face…');
    setError(null);
    try {
      const res = await api.faceLogin(sessionId);
      onToken(res.token);
    } catch (e) {
      setBusy(null);
      setError(msg(e) || 'We could not recognise you. Try again, or use your PIN.');
      setMode('choose');
    }
  }

  if (mode === 'face') {
    return (
      <div className="loginwrap">
        <h2 className="logintitle">Look at the camera</h2>
        <p className="loginsub">Keep your face inside the oval until it finishes.</p>
        {busy ? (
          <div className="center">{busy}</div>
        ) : (
          <LivenessCheck api={api} mode="login" onDone={finishFace} onCancel={() => setMode('choose')} />
        )}
      </div>
    );
  }

  if (mode === 'pin') {
    return <PinLogin api={api} onToken={onToken} onBack={() => setMode('choose')} />;
  }

  return (
    <div className="loginwrap">
      <h1 className="logintitle">Welcome to Stories OneApp</h1>
      <p className="loginsub">Sign in to start your shift.</p>
      {error && <div className="err">{error}</div>}
      <div className="loginbtns">
        <button className="bigbtn primary" onClick={() => setMode('face')}>
          <span className="bigicon">😊</span>
          Log in with your face
        </button>
        <button className="bigbtn" onClick={() => setMode('pin')}>
          <span className="bigicon">🔢</span>
          Use a PIN instead
        </button>
        {microsoftEnabled && (
          <button className="bigbtn subtle" onClick={onMicrosoft}>
            <span className="bigicon"></span>
            Head office — sign in with Microsoft
          </button>
        )}
      </div>
    </div>
  );
}

function PinLogin({
  api,
  onToken,
  onBack,
}: {
  api: Api;
  onToken: (token: string) => void;
  onBack: () => void;
}) {
  const [roster, setRoster] = useState<PinStaff[] | null>(null);
  const [staff, setStaff] = useState<PinStaff | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .pinRoster()
      .then((r) => {
        if (!cancelled) setRoster(r);
      })
      .catch((e) => {
        if (!cancelled) setError(msg(e) || 'Could not load the staff list.');
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function submit() {
    if (!staff || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.pinLogin(staff.id, pin);
      onToken(res.token);
    } catch (e) {
      setBusy(false);
      setPin('');
      setError(msg(e) || 'Wrong PIN. Please try again.');
    }
  }

  if (!staff) {
    return (
      <div className="loginwrap">
        <button className="backbtn" onClick={onBack}>
          ← Back
        </button>
        <h2 className="logintitle">Who are you?</h2>
        {error && <div className="err">{error}</div>}
        {!roster ? (
          <div className="center">Loading…</div>
        ) : roster.length === 0 ? (
          <p className="loginsub">No PIN accounts yet. Ask your manager to set one up for you.</p>
        ) : (
          <div className="stafflist">
            {roster.map((s) => (
              <button key={s.id} className="staffrow" onClick={() => setStaff(s)}>
                <span className="staffname">{s.name}</span>
                {s.branch && <span className="staffbranch">{s.branch}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return (
    <div className="loginwrap">
      <button className="backbtn" onClick={() => { setStaff(null); setPin(''); setError(null); }}>
        ← Back
      </button>
      <h2 className="logintitle">{staff.name}</h2>
      <p className="loginsub">Enter your PIN</p>
      {error && <div className="err">{error}</div>}
      <div className="pindots">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={'pindot ' + (i < pin.length ? 'on' : '') + (i < 4 ? '' : ' opt')} />
        ))}
      </div>
      <div className="pinpad">
        {keys.map((k) => (
          <button
            key={k}
            className={'pinkey ' + (k === 'ok' ? 'ok' : k === 'del' ? 'del' : '')}
            disabled={busy || (k === 'ok' && pin.length < 4)}
            onClick={() => {
              if (k === 'del') setPin((p) => p.slice(0, -1));
              else if (k === 'ok') submit();
              else if (pin.length < 6) setPin((p) => p + k);
            }}
          >
            {k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : '';
}

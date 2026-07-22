import { useEffect, useRef, useState } from 'react';
import { Api, Checklist, ChecklistItem, MediaRef, Me, SubmissionItemInput, uploadToBlob } from './api';

// All Stories branches (Dynamics 365 BC store codes S0001–S0025). Mirrors the
// backend seed so the picker lists every branch; defaults to the signed-in
// user's home branch when they have one.
const DEMO_BRANCHES = [
  { id: 'S0001', name: 'Store 1 — Jnah' },
  { id: 'S0002', name: 'Ramlet El Bayda' },
  { id: 'S0003', name: 'Verdun 2' },
  { id: 'S0004', name: 'Cubic — Sin el Fil' },
  { id: 'S0005', name: 'Khalde 1 — MATTA' },
  { id: 'S0006', name: 'Dunes' },
  { id: 'S0007', name: 'Khalde 2 — Drive Thru' },
  { id: 'S0008', name: 'Ain Mreisseh' },
  { id: 'S0009', name: 'Airport Road' },
  { id: 'S0010', name: 'Zalqa' },
  { id: 'S0011', name: 'Antelias' },
  { id: 'S0012', name: 'Le Mall' },
  { id: 'S0013', name: 'Kaslik' },
  { id: 'S0014', name: 'Mansourieh' },
  { id: 'S0015', name: 'Batroun' },
  { id: 'S0016', name: 'Aley' },
  { id: 'S0017', name: 'Rawche — Arjan' },
  { id: 'S0018', name: 'Amioun' },
  { id: 'S0019', name: 'Centromall' },
  { id: 'S0020', name: 'Rabieh — BAYADA' },
  { id: 'S0021', name: 'Saida' },
  { id: 'S0022', name: 'Tyre' },
  { id: 'S0023', name: 'Jbeil' },
  { id: 'S0024', name: 'Broumana' },
  { id: 'S0025', name: 'Store 25' },
];

// Checklists run in shift order — opening, then handover, then closing —
// regardless of what order the API returns them in.
const CHECKLIST_ORDER: Record<string, number> = { opening: 0, handover: 1, closing: 2 };

type Value = { valueCheck?: 'pass' | 'fail'; valueNumber?: number; valueText?: string; media?: MediaRef[] };
type Values = Record<string, Value>;

// Local calendar date (branch timezone), not UTC — 'en-CA' formats as YYYY-MM-DD.
const today = () => new Date().toLocaleDateString('en-CA');

function isFilled(item: ChecklistItem, v: Value | undefined): boolean {
  if (!v) return false;
  if (item.needsPhoto && !(v.media && v.media.some((m) => m.kind === 'photo'))) return false;
  if (item.needsVideo && !(v.media && v.media.some((m) => m.kind === 'video'))) return false;
  switch (item.type) {
    case 'check': return v.valueCheck === 'pass' || v.valueCheck === 'fail';
    case 'number': return v.valueNumber != null && !Number.isNaN(v.valueNumber);
    case 'text': return !!(v.valueText && v.valueText.trim());
    case 'photo':
    case 'video': return !!(v.media && v.media.length);
    default: return false;
  }
}

function progress(list: Checklist, values: Values) {
  const req = list.items.filter((i) => i.required);
  const done = req.filter((i) => isFilled(i, values[i.id])).length;
  return { done, total: req.length, pct: req.length ? Math.round((done / req.length) * 100) : 100 };
}

export function BranchApp({ api, me }: { api: Api; me: Me | null }) {
  const [branchId, setBranchId] = useState<string>(me?.branch?.id || DEMO_BRANCHES[0].id);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [open, setOpen] = useState<Checklist | null>(null);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Anti-fraud timing: the server-issued session and the moment each item was
  // first completed, used to derive per-item dwell + order at submit time.
  const [session, setSession] = useState<{ sessionId: string; startedAtMs: number } | null>(null);
  const [completedAt, setCompletedAt] = useState<Record<string, number>>({});
  // Which item (if any) is currently capturing through the in-app camera.
  const [cam, setCam] = useState<{ item: ChecklistItem; kind: 'photo' | 'video' } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const branchLabel = DEMO_BRANCHES.find((b) => b.id === branchId)?.name || me?.branch?.name || branchId;

  useEffect(() => {
    if (me?.branch?.id) setBranchId(me.branch.id);
  }, [me]);

  useEffect(() => {
    let stale = false; // ignore a slow response after the branch changed again
    setOpen(null);
    setError(null);
    api
      .checklists(branchId)
      .then((c) => {
        if (!stale) setChecklists(Array.isArray(c) ? c : []);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [api, branchId]);

  async function openChecklist(c: Checklist) {
    setValues({});
    setCompletedAt({});
    setError(null);
    setOpen(c);
    // Ask the server to open a timed session (start clock is server-side, so it
    // can't be faked). If it fails — e.g. demo backend — fall back to a local
    // clock so timing still works, just without server verification of the total.
    try {
      const s = await api.startSession({ branchId, templateKey: c.key, businessDate: today() });
      setSession({ sessionId: s.sessionId, startedAtMs: Date.now() });
    } catch {
      setSession({ sessionId: '', startedAtMs: Date.now() });
    }
  }

  // Stamp the completion time the first moment an item becomes filled, so we can
  // measure the transition time between one check and the next.
  useEffect(() => {
    if (!open) return;
    setCompletedAt((prev) => {
      let next = prev;
      for (const item of open.items) {
        if (isFilled(item, values[item.id]) && prev[item.id] == null) {
          if (next === prev) next = { ...prev };
          next[item.id] = Date.now();
        }
      }
      return next;
    });
  }, [values, open]);

  async function capture(item: ChecklistItem, kind: 'photo' | 'video', file: File, meta?: CaptureMeta) {
    setBusy(item.id);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const token = await api.uploadToken({ branchId, businessDate: today(), itemKey: item.id, kind, ext });
      await uploadToBlob(token, file);
      setValues((v) => ({
        ...v,
        [item.id]: {
          ...v[item.id],
          media: [
                  ...(v[item.id]?.media || []).filter((mm) => mm.kind !== kind),
                  {
            kind, storageKey: token.storageKey, mime: file.type, sizeBytes: file.size,
            gpsLat: meta?.lat, gpsLng: meta?.lng, gpsAccuracyM: meta?.accuracyM, capturedAt: meta?.capturedAt,
          }],
        },
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!open) return;
    setBusy('submit');
    setError(null);
    try {
      // Derive per-item timing from the completion timestamps: sequence = order
      // completed, dwellMs = gap since the previous completion (session start for
      // the first). This is the "time transition between every check".
      const ordered = Object.entries(completedAt).sort((a, b) => a[1] - b[1]);
      const seq: Record<string, number> = {};
      const dwell: Record<string, number> = {};
      let prevMs = session?.startedAtMs ?? ordered[0]?.[1];
      ordered.forEach(([id, ts], idx) => {
        seq[id] = idx + 1;
        dwell[id] = Math.max(0, ts - (prevMs ?? ts));
        prevMs = ts;
      });

      const items: SubmissionItemInput[] = Object.entries(values).map(([templateItemId, v]) => ({
        templateItemId,
        valueCheck: v.valueCheck,
        valueNumber: v.valueNumber,
        valueText: v.valueText,
        media: v.media,
        dwellMs: dwell[templateItemId],
        sequence: seq[templateItemId],
      }));
      const res = await api.submit({
        branchId,
        templateKey: open.key,
        businessDate: today(),
        sessionId: session?.sessionId || undefined,
        items,
      });
      const mins = res.durationSec != null ? ` · took ${Math.floor(res.durationSec / 60)}m ${res.durationSec % 60}s` : '';
      const pace = res.paceFlag ? ' ⚠ flagged as too fast' : '';
      alert(`Submitted — status: ${res.status.toUpperCase()} (${res.completionPct}%)${mins}${pace}`);
      setValues({}); // clear the draft so the card grid reflects reality
      setCompletedAt({});
      setSession(null);
      setOpen(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (open) {
    const p = progress(open, values);
    const missing = open.items.filter((i) => i.required && !isFilled(i, values[i.id]));
    return (
      <>
        <div className="detailhead">
          <button className="backbtn" onClick={() => setOpen(null)}>← Back</button>
          <h2>{open.icon} {open.name}</h2>
          <span className="prog">{p.done}/{p.total} · {p.pct}%</span>
        </div>
        {error && <div className="err">{error}</div>}
        {(() => {
          const out: any[] = [];
          let cur: string | null = null;
          open.items.forEach((item) => {
            const section = item.hint || 'Checklist';
            if (section !== cur) {
              cur = section;
              const secItems = open.items.filter((i) => (i.hint || 'Checklist') === section);
              const req = secItems.filter((i) => i.required);
              const done = req.filter((i) => isFilled(i, values[i.id])).length;
              const col = !!collapsed[section];
              out.push(
                <div key={'sec-' + section} className="checklist-section" onClick={() => setCollapsed((c) => ({ ...c, [section]: !c[section] }))}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', margin: '18px 0 8px', padding: '9px 12px', background: '#123524', color: '#eaf3ee', borderRadius: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{col ? '▸' : '▾'} {section}</span>
                  <span style={{ fontSize: 12, opacity: 0.65 }}>{done}/{req.length}</span>
                </div>,
              );
            }
            if (!collapsed[section]) {
              out.push(
                <ItemRow key={item.id} item={item} value={values[item.id]} busy={busy === item.id}
                  onCheck={(val) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueCheck: val } }))}
                  onNumber={(n) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueNumber: Number.isNaN(n) ? undefined : n } }))}
                  onText={(t) => setValues((v) => ({ ...v, [item.id]: { ...v[item.id], valueText: t } }))}
                  onCamera={(it, kind) => setCam({ item: it, kind })} />,
              );
            }
          });
          return out;
        })()}
        <div className="submitbar">
          <div className="txt">{missing.length ? `${missing.length} required item(s) left` : 'All required items complete ✓'}</div>
          <button className="primary" disabled={missing.length > 0 || busy === 'submit'} onClick={submit}>
            {busy === 'submit' ? 'Submitting…' : 'Submit to Head Office'}
          </button>
        </div>
        {cam && (
          <CameraCapture
            kind={cam.kind}
            branchName={branchLabel}
            onCancel={() => setCam(null)}
            onCapture={(file, meta) => { const c = cam; setCam(null); capture(c.item, c.kind, file, meta); }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="ctxbar">
        <div>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {DEMO_BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <span className="who">Signed in as <b>{me?.name || '—'}</b> · {me?.role || 'staff'}</span>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="sectionlabel">Today's checklists</div>
      <div className="cards">
        {[...checklists]
          .sort((a, b) => (CHECKLIST_ORDER[a.key] ?? 9) - (CHECKLIST_ORDER[b.key] ?? 9))
          .map((c) => {
          const p = progress(c, values);
          return (
            <div key={c.id} className="card" onClick={() => openChecklist(c)}>
              <span className={`badge ${p.pct >= 100 ? 'b-done' : p.pct > 0 ? 'b-prog' : 'b-todo'}`}>
                {p.pct >= 100 ? 'READY' : p.pct > 0 ? 'IN PROGRESS' : 'TO DO'}
              </span>
              <div className="cicon">{c.icon}</div>
              <h3>{c.name}</h3>
              <div className="sub">{c.items.length} items</div>
              <div className="bar"><i style={{ width: `${p.pct}%` }} /></div>
              <div className="meta"><span>{p.done}/{p.total} required</span><span>{p.pct}%</span></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ItemRow(props: {
  item: ChecklistItem;
  value: Value | undefined;
  busy: boolean;
  onCheck: (v: 'pass' | 'fail') => void;
  onNumber: (n: number) => void;
  onText: (t: string) => void;
  onCamera: (item: ChecklistItem, kind: 'photo' | 'video') => void;
}) {
  const { item, value } = props;
  const done = isFilled(item, value);
  const num = value?.valueNumber;
  const inRange = num != null && !item.noRange
    ? (item.min == null || num >= item.min) && (item.max == null || num <= item.max)
    : null;

  return (
    <div className={`item ${done ? 'done' : ''}`}>
      <div className="itemtop">
        <span style={{ color: done ? 'var(--green)' : 'var(--line)', fontSize: 18 }}>{done ? '✓' : '○'}</span>
        <div style={{ flex: 1 }}>
          <div className="lbl">{item.label}</div>
          
        </div>
        <span className={item.required ? 'req' : 'opt'}>{item.required ? 'REQUIRED' : 'OPTIONAL'}</span>
      </div>

      {item.type === 'check' && (
        <div className="control"><div className="checkrow">
          <button className={`cbtn pass ${value?.valueCheck === 'pass' ? 'sel' : ''}`} onClick={() => props.onCheck('pass')}>✓ Pass</button>
          <button className={`cbtn fail ${value?.valueCheck === 'fail' ? 'sel' : ''}`} onClick={() => props.onCheck('fail')}>✕ Fail</button>
        </div></div>
      )}
      {item.type === 'number' && (
        <div className="control"><div className="numrow">
          <input type="number" step="0.1" value={num ?? ''} placeholder="0"
            onChange={(e) => props.onNumber(parseFloat(e.target.value))} />
          <span className="unit">{item.unit}</span>
          {!item.noRange && item.min != null && <span className="unit">· target {item.min}–{item.max}{item.unit}</span>}
          {inRange != null && <span className={`range ${inRange ? 'ok' : 'bad'}`}>{inRange ? 'in range' : 'out of range'}</span>}
        </div></div>
      )}
      {item.type === 'text' && (
        <div className="control">
          <textarea placeholder="Type a note…" value={value?.valueText ?? ''} onChange={(e) => props.onText(e.target.value)} />
        </div>
      )}
      {(item.type === 'photo' || item.type === 'video') && (
        <div className="control"><div className="capture">
          <button className={`capbtn ${item.type === 'video' ? 'video' : ''}`}
            onClick={() => props.onCamera(item, item.type as 'photo' | 'video')}>
            {item.type === 'photo' ? '📷' : '🎥'} {props.busy ? 'Uploading…' : value?.media?.length ? 'Retake' : item.type === 'photo' ? 'Take photo' : 'Record video'}
          </button>
          {value?.media?.length ? <span className="captured-tag">✓ captured · stamped</span> : null}
        </div></div>
      )}
        {item.needsPhoto && item.type !== 'photo' && (
          <div className="control"><div className="capture">
            <button className="capbtn" onClick={() => props.onCamera(item, 'photo')}>
              📷 {props.busy ? 'Uploading…' : (value?.media?.some((m) => m.kind === 'photo') ? 'Retake photo' : 'Add photo')}
            </button>
            {value?.media?.some((m) => m.kind === 'photo') ? <span className="captured-tag">✓ photo · stamped</span> : null}
          </div></div>
        )}
        {item.needsVideo && item.type !== 'video' && (
          <div className="control"><div className="capture">
            <button className="capbtn video" onClick={() => props.onCamera(item, 'video')}>
              🎥 {props.busy ? 'Uploading…' : (value?.media?.some((m) => m.kind === 'video') ? 'Retake video' : 'Add video')}
            </button>
            {value?.media?.some((m) => m.kind === 'video') ? <span className="captured-tag">✓ video · stamped</span> : null}
          </div></div>
        )}
    </div>
  );
}

type Geo = { lat: number; lng: number; acc: number };
let geoCache: { geo: Geo | null; state: 'ok' | 'off' } | null = null;
type CaptureMeta = { lat?: number; lng?: number; accuracyM?: number; capturedAt: string };

function pickVideoMime(): string {
  const opts = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const MR: any = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
  if (MR && MR.isTypeSupported) for (const o of opts) if (MR.isTypeSupported(o)) return o;
  return 'video/webm';
}

// In-app camera. Captures a live photo or video (no gallery/file picker so an old
// or off-site file can't be attached), reads GPS at the moment of capture, and
// burns the branch name, date/time and coordinates onto the frame as proof.
function CameraCapture({
  kind,
  branchName,
  onCancel,
  onCapture,
}: {
  kind: 'photo' | 'video';
  branchName: string;
  onCancel: () => void;
  onCapture: (file: File, meta: CaptureMeta) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoState, setGeoState] = useState<'pending' | 'ok' | 'off'>('pending');
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recTimerRef = useRef<number>(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  useEffect(() => {
    const stop = (e: any) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    const gp = (e: any) => e.preventDefault();
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('gesturestart', gp as any);
    return () => {
      document.removeEventListener('touchmove', stop);
      document.removeEventListener('gesturestart', gp as any);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available on this device/browser.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: kind === 'video',
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e: any) {
        setErr('Camera unavailable — please allow camera access on this phone, then reopen. (' + (e?.message || e) + ')');
      }
    })();
    if (geoCache) {
      setGeo(geoCache.geo);
      setGeoState(geoCache.state);
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setGeoState('ok'); geoCache = { geo: { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }, state: 'ok' }; },
        () => { geoCache = { geo: null, state: 'off' }; setGeoState('off'); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
      );
    } else {
      setGeoState('off');
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [kind]);

  function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const lines = [
      branchName,
      new Date().toLocaleString(),
      geo ? `GPS ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (±${Math.round(geo.acc)}m)` : 'GPS unavailable',
    ];
    const pad = Math.round(w * 0.02);
    const fs = Math.max(13, Math.round(w * 0.026));
    ctx.font = `600 ${fs}px Arial, Helvetica, sans-serif`;
    const barH = pad * 2 + lines.length * (fs + 5);
    ctx.fillStyle = 'rgba(14,36,26,0.62)';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = '#eaf3ee';
    ctx.textBaseline = 'top';
    lines.forEach((ln, i) => ctx.fillText(ln, pad, h - barH + pad + i * (fs + 5)));
  }

  function stopStream() {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(recTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function takePhoto() {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const w = v.videoWidth, h = v.videoHeight;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    { const _z = zoomRef.current || 1; const _sw = w / _z, _sh = h / _z; ctx.drawImage(v, (w - _sw) / 2, (h - _sh) / 2, _sw, _sh, 0, 0, w, h); }
    drawStamp(ctx, w, h);
    const capturedAt = new Date().toISOString();
    c.toBlob((blob) => {
      if (!blob) { setErr('Could not capture image, please try again.'); return; }
      stopStream();
      onCapture(
        new File([blob], `photo_${capturedAt.replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' }),
        { lat: geo?.lat, lng: geo?.lng, accuracyM: geo ? Math.round(geo.acc) : undefined, capturedAt },
      );
    }, 'image/jpeg', 0.9);
  }

  function startVideo() {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const w = v.videoWidth, h = v.videoHeight;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const capturedAt = new Date().toISOString();
    const draw = () => {
      { const _z = zoomRef.current || 1; const _sw = w / _z, _sh = h / _z; ctx.drawImage(v, (w - _sw) / 2, (h - _sh) / 2, _sw, _sh, 0, 0, w, h); }
      drawStamp(ctx, w, h);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    let canvasStream: MediaStream;
    try {
      canvasStream = (c as any).captureStream(30);
    } catch {
      setErr('Video recording is not supported on this browser.');
      return;
    }
    (streamRef.current?.getAudioTracks() || []).forEach((t) => canvasStream.addTrack(t));
    const mime = pickVideoMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(canvasStream, { mimeType: mime });
    } catch {
      setErr('Video recording is not supported on this browser.');
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current);
      const blob = new Blob(chunksRef.current, { type: mime });
      stopStream();
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      onCapture(
        new File([blob], `video_${capturedAt.replace(/[:.]/g, '-')}.${ext}`, { type: mime }),
        { lat: geo?.lat, lng: geo?.lng, accuracyM: geo ? Math.round(geo.acc) : undefined, capturedAt },
      );
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
    setRecSecs(0);
    recTimerRef.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
  }

  function stopVideo() {
    recRef.current?.stop();
    setRecording(false);
  }

  const geoLabel = geoState === 'ok' && geo
    ? `📍 ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`
    : geoState === 'pending' ? '📍 locating…' : '📍 location off';

  return (
    <div className="camoverlay">
      {err ? (
        <div className="camerr">
          <p>{err}</p>
          <button className="camtext" onClick={() => { stopStream(); onCancel(); }}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline autoPlay muted style={{ transform: 'scale(' + zoom + ')', transformOrigin: 'center center', transition: 'transform 0.12s' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {ready && !err && (
            <div style={{ position: 'absolute', bottom: 160, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 6 }}>
              {[1, 2, 3].map((z) => (
                <button key={z} onClick={() => { setZoom(z); zoomRef.current = z; }} style={{ background: zoom === z ? 'rgba(8,108,66,0.95)' : 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 999, padding: '6px 13px', fontSize: 14, fontWeight: 700 }}>{z}×</button>
              ))}
            </div>
          )}
          <div className="camtop">
            <span>{branchName}</span>
            <span className={`camgeo ${geoState === 'ok' ? 'ok' : geoState === 'off' ? 'bad' : ''}`}>{geoLabel}</span>
          </div>
          {recording && (
            <div style={{ position: 'absolute', bottom: 206, left: '50%', transform: 'translateX(-50%)', background: 'rgba(190,45,45,0.95)', color: '#fff', padding: '5px 14px', borderRadius: 999, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, zIndex: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
              REC {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}
            </div>
          )}
          <div className="camhint">
            {recording ? 'Recording — tap the button to stop' : kind === 'photo' ? 'Live photo · stamped with branch, time & GPS' : 'Live video · stamped with branch, time & GPS'}
          </div>
          <div className="cambar">
            <button className="camtext" onClick={() => { stopStream(); onCancel(); }}>Cancel</button>
            {kind === 'photo' ? (
              <button className="shutter" disabled={!ready} onClick={takePhoto} aria-label="Take photo" />
            ) : recording ? (
              <button className="shutter rec" onClick={stopVideo} aria-label="Stop recording" />
            ) : (
              <button className="shutter" disabled={!ready} onClick={startVideo} aria-label="Start recording" />
            )}
            <span style={{ width: 60 }} />
          </div>
        </>
      )}
    </div>
  );
}

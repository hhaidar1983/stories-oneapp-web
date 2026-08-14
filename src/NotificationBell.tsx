import { useEffect, useRef, useState } from 'react';
import { Api, AppNotification } from './api';

// Roles the /notifications endpoint serves (kept in sync with the backend
// NotificationsController @Roles). Other roles get 403, so we don't poll for them.
const NOTIFY_ROLES = ['admin', 'head_office', 'hq_reviewer', 'ops_manager', 'area_manager', 'branch_manager'];

// A global bell in the app header: polls for unread alerts and shows a count on
// every screen, so an escalation catches the eye no matter where the user is.
export function NotificationBell({ api, role }: { api: Api; role?: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const enabled = !!role && NOTIFY_ROLES.includes(role);

  function load() {
    if (!enabled) return;
    api
      .notifications(true)
      .then((n) => setItems(Array.isArray(n) ? n : []))
      .catch(() => {});
  }

  // Poll every 30s while mounted (and immediately on load).
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, api]);

  // Close the panel on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!enabled) return null;
  const count = items.length;

  const markOne = (id: string) => api.markNotificationRead(id).then(load).catch(() => {});
  const markAll = () =>
    Promise.all(items.map((n) => api.markNotificationRead(n.id).catch(() => {}))).then(load);

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginLeft: 4 }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,.12)',
          border: '1px solid rgba(255,255,255,.25)',
          color: '#fff',
          borderRadius: 10,
          width: 38,
          height: 34,
          fontSize: 17,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        &#128276;
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              background: '#d03b3b',
              color: '#fff',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 2px #0e241a',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 44,
            width: 340,
            maxHeight: 460,
            overflowY: 'auto',
            background: '#fff',
            color: '#14201a',
            border: '1px solid #e2e9e4',
            borderRadius: 14,
            boxShadow: '0 8px 30px rgba(14,36,26,.18)',
            zIndex: 60,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid #e2e9e4',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 13 }}>Alerts{count > 0 ? ' · ' + count : ''}</span>
            {count > 0 && (
              <button
                type="button"
                onClick={markAll}
                style={{ background: 'none', border: 'none', color: '#0b7a43', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Mark all read
              </button>
            )}
          </div>
          {count === 0 ? (
            <div style={{ padding: '22px 14px', textAlign: 'center', color: '#7a8a80', fontSize: 13 }}>
              You&apos;re all caught up.
            </div>
          ) : (
            items.map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '11px 14px', borderBottom: '1px solid #f0f3f0' }}>
                <span style={{ fontSize: 16, lineHeight: 1.3 }}>&#9873;</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: '#5a6b60', lineHeight: 1.4 }}>{n.body}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#9aa89f' }}>
                      {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => markOne(n.id)}
                      style={{ background: 'none', border: 'none', color: '#0b7a43', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', padding: 0 }}
                    >
                      Mark read
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

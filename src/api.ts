export interface ChecklistItem {
  id: string;
  sort: number;
  label: string;
  type: 'check' | 'number' | 'photo' | 'video' | 'text';
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  noRange: boolean;
  hint: string | null;
}
export interface Checklist {
  id: string;
  key: 'opening' | 'handover' | 'closing';
  name: string;
  icon: string | null;
  items: ChecklistItem[];
}

export interface UploadToken {
  storageKey: string;
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface MediaRef {
  kind: 'photo' | 'video';
  storageKey: string;
  mime?: string;
  sizeBytes?: number;
  // Where/when the shot was actually taken (read from the phone at capture).
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracyM?: number;
  capturedAt?: string;
}
export interface SubmissionItemInput {
  templateItemId: string;
  valueCheck?: 'pass' | 'fail';
  valueNumber?: number;
  valueText?: string;
  media?: MediaRef[];
  dwellMs?: number; // time spent on this item (anti-fraud)
  sequence?: number; // order it was completed in
}

export interface StartedSession {
  sessionId: string;
  startedAt: string;
}
export interface SubmissionSummary {
  id: string;
  branch: { id: string; name: string };
  checklist: string;
  name: string;
  businessDate: string;
  shift: string;
  status: string;
  completionPct: number;
  durationSec?: number | null; // total time on the checklist (server-measured)
  paceFlag?: boolean; // completed implausibly fast
  submittedAt: string | null;
}
export interface SubmissionDetail extends SubmissionSummary {
  startedAt?: string | null;
  items: {
    id: string;
    label: string;
    type: string;
    required: boolean;
    valueCheck: string | null;
    valueNumber: number | null;
    inRange: boolean | null;
    valueText: string | null;
    flagged: boolean;
    dwellMs: number | null; // time spent on this step
    sequence: number | null; // order it was completed in
    paceFlag: boolean; // too fast for its type
    media: {
      id: string;
      kind: string;
      storageKey: string;
      viewUrl: string;
      mime: string | null;
      capturedAt?: string | null;
      gpsLat?: number | null;
      gpsLng?: number | null;
      distanceM?: number | null;
      geoFlag?: boolean;
    }[];
  }[];
  reviews: { id: string; decision: string; comment: string | null; reviewer?: string; reviewedAt: string }[];
}

export interface Me {
  id: string;
  name: string;
  role: string;
  branch: { id: string; name: string; tier: string } | null;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  branchId: string | null;
  submissionId: string | null;
  read: boolean;
  createdAt: string;
}

export function createApi(base: string, authHeaders: () => Promise<Record<string, string>>) {
  async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(opts.headers as Record<string, string> | undefined),
    };
    const res = await fetch(base + path, { ...opts, headers });
    if (!res.ok) {
      const msg = await res
        .json()
        .then((b) => b.message || res.statusText)
        .catch(() => res.statusText);
      throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    return res.status === 204 ? (null as T) : (res.json() as Promise<T>);
  }

  return {
    me: () => req<Me>('/me'),
    checklists: (branchId: string) => req<Checklist[]>(`/branches/${branchId}/checklists`),
    uploadToken: (body: { branchId: string; businessDate: string; itemKey: string; kind: string; ext: string }) =>
      req<UploadToken>('/media/upload-token', { method: 'POST', body: JSON.stringify(body) }),
    // Opens the checklist session; the server stamps the start time so total
    // duration can't be faked. Call when the staff member opens the checklist.
    startSession: (body: {
      branchId: string;
      templateKey: string;
      businessDate: string;
      shift?: string;
    }) => req<StartedSession>('/submissions/start', { method: 'POST', body: JSON.stringify(body) }),
    submit: (body: {
      branchId: string;
      templateKey: string;
      businessDate: string;
      sessionId?: string;
      items: SubmissionItemInput[];
    }) => req<SubmissionDetail>('/submissions', { method: 'POST', body: JSON.stringify(body) }),
    submissions: (query?: string) =>
      req<SubmissionSummary[]>(`/submissions${query ? `?${query}` : ''}`),
    submission: (id: string) => req<SubmissionDetail>(`/submissions/${id}`),
    review: (id: string, body: { decision: string; comment?: string; itemFlags?: { submissionItemId: string; flag: boolean }[] }) =>
      req<{ id: string; status: string }>(`/submissions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    notifications: (unread = false) =>
      req<AppNotification[]>(`/notifications${unread ? '?unread=true' : ''}`),
    markNotificationRead: (id: string) =>
      req<{ id: string; read: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Upload a captured file straight to Blob storage using the one-off token. */
export async function uploadToBlob(token: UploadToken, file: File): Promise<void> {
  // Demo mode: the backend returns a stub URL — nothing to upload to.
  if (token.uploadUrl.startsWith('https://STUB')) return;
  const res = await fetch(token.uploadUrl, {
    method: token.method || 'PUT',
    headers: token.headers,
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

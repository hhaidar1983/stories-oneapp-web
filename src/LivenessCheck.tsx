import { useEffect, useState } from 'react';
import { FaceLivenessDetectorCore } from '@aws-amplify/ui-react-liveness';
import '@aws-amplify/ui-react/styles.css';
import '@aws-amplify/ui-react-liveness/styles.css';
import type { Api } from './api';

// Wraps AWS Amplify's FaceLivenessDetector (the guided "move your face into the
// oval" check). We start the session on our backend, stream the video straight
// to Rekognition using short-lived credentials the backend vends, and hand the
// sessionId back to the parent to finish (identify for login, or index for enroll).
export function LivenessCheck({
  api,
  mode,
  onDone,
  onCancel,
}: {
  api: Api;
  mode: 'login' | 'enroll';
  onDone: (sessionId: string) => void;
  onCancel: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('eu-west-1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = mode === 'enroll' ? await api.enrollSession() : await api.faceSession();
        if (cancelled) return;
        setSessionId(s.sessionId);
        setRegion(s.region);
      } catch (e) {
        if (!cancelled) setError(errText(e) || 'Could not start the camera check.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, mode]);

  if (error) {
    return (
      <div className="livenessbox">
        <div className="err">{error}</div>
        <button className="backbtn" onClick={onCancel}>
          ← Back
        </button>
      </div>
    );
  }

  if (!sessionId) return <div className="center">Starting camera…</div>;

  return (
    <div className="livenessbox">
      <FaceLivenessDetectorCore
        sessionId={sessionId}
        region={region}
        onAnalysisComplete={async () => {
          onDone(sessionId);
        }}
        onUserCancel={onCancel}
        onError={(err) => {
          setError(err?.error?.message || err?.state || 'The check failed — please try again in good light.');
        }}
        config={{
          credentialProvider: async () => {
            const c = await api.faceCreds();
            return {
              accessKeyId: c.accessKeyId,
              secretAccessKey: c.secretAccessKey,
              sessionToken: c.sessionToken,
              expiration: c.expiration ? new Date(c.expiration) : undefined,
            };
          },
        }}
      />
    </div>
  );
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : '';
}

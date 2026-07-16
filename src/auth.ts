import { createContext, useContext } from 'react';
import type { AccountInfo, Configuration } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID as string | undefined;
const tenant = (import.meta.env.VITE_MSAL_TENANT as string) || 'common';

export const apiScope = (import.meta.env.VITE_API_SCOPE as string) || '';
export const msalEnabled = !!clientId;

const config: Configuration = {
  auth: {
    clientId: clientId || '',
    authority: `https://login.microsoftonline.com/${tenant}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const pca = msalEnabled ? new PublicClientApplication(config) : null;

/** Seeded demo users (match the backend seed) for demo mode. */
export const DEMO_USERS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Rami K. — Shift Lead (Store 1, Jnah)' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Head Office Reviewer' },
];

export interface Auth {
  mode: 'msal' | 'demo';
  ready: boolean;
  account: AccountInfo | null;
  signedIn: boolean;
  devUserId: string;
  setDevUserId: (id: string) => void;
  login: () => Promise<void>;
  logout: () => void;
  /** Headers that authenticate an API request (Bearer token or dev x-user-id). */
  authHeaders: () => Promise<Record<string, string>>;
}

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext is missing');
  return ctx;
}

export interface UserSession {
  id: string;
  username: string;
  canManageCatalog: boolean;
}

export const requestHeader = { 'X-BastDecks-Request': '1' };
const events = new EventTarget();
let sessionRevision = 0;

export class SessionRequestError extends Error {
  constructor(readonly status: number, message?: string) {
    super(message);
  }
}

function sessionChanged() {
  sessionRevision++;
  events.dispatchEvent(new Event('change'));
}

export const currentSessionRevision = () => sessionRevision;

export function notifySessionExpired(revision: number) {
  if (revision !== sessionRevision) return;
  sessionChanged();
  events.dispatchEvent(new Event('expired'));
}

export function onSessionChanged(listener: () => void) {
  events.addEventListener('change', listener);
}

export function onSessionExpired(listener: () => void) {
  events.addEventListener('expired', listener);
  return () => events.removeEventListener('expired', listener);
}

async function authRequest<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth/${route}`, {
    ...init,
    headers: { ...requestHeader, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new SessionRequestError(response.status, typeof data?.error === 'string' ? data.error : undefined);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const getSession = (signal?: AbortSignal) => authRequest<UserSession>('me', { signal });

export async function authenticate(mode: 'login' | 'register', username: string, password: string) {
  const user = await authRequest<UserSession>(mode, {
    method: 'POST', body: JSON.stringify({ username, password }),
  });
  sessionChanged();
  return user;
}

export async function signOut() {
  await authRequest<void>('logout', { method: 'POST' });
  sessionChanged();
}

export async function updateProfile(data: { username: string; currentPassword: string; newPassword?: string }) {
  const revision = currentSessionRevision();
  try {
    const user = await authRequest<UserSession>('me', { method: 'PATCH', body: JSON.stringify(data) });
    sessionChanged();
    return user;
  } catch (error) {
    if (error instanceof SessionRequestError && error.status === 401) notifySessionExpired(revision);
    throw error;
  }
}

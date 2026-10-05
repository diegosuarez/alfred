// The SPA always talks to the backend via the same origin — Vite's dev
// proxy or Tailscale's path routing forwards /api/* on to the backend.
// That keeps cookies, CORS and OAuth callbacks single-origin.
let token = localStorage.getItem('alfred_token') || '';

export const setToken = (newToken: string) => {
  token = newToken;
  if (newToken) {
    localStorage.setItem('alfred_token', newToken);
  } else {
    localStorage.removeItem('alfred_token');
  }
};

export const getToken = () => token;

export interface UserSession {
  id: number;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
}

/** Fires when the backend rejects our credentials mid-session (JWT
 *  expiry, PAT revoked, etc.). App.tsx subscribes and bounces the user
 *  to the login screen so stale UI doesn't fight invisible 401s. */
export const UNAUTHORIZED_EVENT = 'alfred:unauthorized';

let refreshing: Promise<boolean> | null = null;

/** Trade the HttpOnly "remember me" cookie for a fresh access token.
 *  Resolves false when there's no live session (never remembered,
 *  revoked or expired). Concurrent callers share one request. */
export const refreshSession = (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return false;
        setToken((await r.json()).access_token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

/** fetch() with our Bearer attached. On a 401 it tries one silent
 *  refresh and replays the request with the new token. */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    // include credentials so the OAuth state cookie set by /google-accounts/connect
    // is stored cross-origin and replayed on Google's callback redirect.
    return fetch(url, { ...init, headers, credentials: 'include' });
  };
  const response = await send();
  if (response.status === 401 && token && (await refreshSession())) {
    return send();
  }
  return response;
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await authedFetch(`/api${endpoint}`, { ...options, headers });

  // Session expiry / revoked token that a refresh couldn't fix: only
  // treat as "logged out" when the call carried our Bearer (i.e. we
  // believed we were authenticated). Login endpoints can legitimately
  // 401 on bad credentials — they handle their own messaging.
  const isLoginCall =
    endpoint.startsWith('/auth/') && !endpoint.startsWith('/auth/sessions');
  if (
    response.status === 401 &&
    token &&
    !isLoginCall
  ) {
    setToken('');
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new Error('Sesión caducada. Vuelve a iniciar sesión.');
  }

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Algo salió mal en el servidor.');
  }

  return response.json();
}

export const api = {
  // Auth
  register: (email: string, password: string) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  registrationStatus: (): Promise<{ open: boolean }> =>
    request('/auth/registration-status'),

  login: async (email: string, password: string, remember = false) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    formData.append('remember', String(remember));
    const data = await request('/auth/login', {
      method: 'POST',
      body: formData,
    });
    setToken(data.access_token);
    return data;
  },

  logout: () => {
    // Revokes this device's remembered session server-side and clears
    // the cookie. Fire-and-forget: the local logout must not wait on
    // the network.
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setToken('');
  },

  // Remembered sessions ("Recuérdame")
  getSessions: (): Promise<UserSession[]> => request('/auth/sessions'),

  revokeSession: (sessionId: number) =>
    request(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),

  // Contexts
  getContexts: () =>
    request('/contexts'),

  createContext: (name: string, color?: string) =>
    request('/contexts', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  updateContext: (contextId: number, data: { name?: string; color?: string }) =>
    request(`/contexts/${contextId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteContext: (contextId: number) =>
    request(`/contexts/${contextId}`, {
      method: 'DELETE',
    }),

  // Boards
  getBoards: (contextId?: number) => {
    const qs = contextId !== undefined ? `?context_id=${contextId}` : '';
    return request(`/boards${qs}`);
  },

  createBoard: (name: string, description?: string, contextId?: number) =>
    request('/boards', {
      method: 'POST',
      body: JSON.stringify({ name, description, context_id: contextId }),
    }),

  updateBoardContext: (boardId: number, contextId: number) =>
    request(`/boards/${boardId}`, {
      method: 'PUT',
      body: JSON.stringify({ context_id: contextId }),
    }),

  assignContextGoogleAccount: (contextId: number, googleAccountId: number | null) =>
    // The backend uses 0 as a sentinel for "detach".
    request(`/contexts/${contextId}`, {
      method: 'PUT',
      body: JSON.stringify({ google_account_id: googleAccountId === null ? 0 : googleAccountId }),
    }),

  // Google accounts (connected resources, distinct from Sign-in-with-Google)
  getGoogleAccounts: () =>
    request('/google-accounts'),

  connectGoogleAccount: (extraScopes: string[] = []) =>
    request('/google-accounts/connect', {
      method: 'POST',
      body: JSON.stringify({ extra_scopes: extraScopes }),
    }),

  disconnectGoogleAccount: (accountId: number) =>
    request(`/google-accounts/${accountId}`, {
      method: 'DELETE',
    }),

  syncGoogleContacts: (accountId: number) =>
    request(`/google-accounts/${accountId}/sync-contacts`, {
      method: 'POST',
    }),

  // Personal Access Tokens
  getPats: () => request('/pats'),

  createPat: (name: string, expiresAt?: string) =>
    request('/pats', {
      method: 'POST',
      body: JSON.stringify({ name, expires_at: expiresAt }),
    }),

  revokePat: (patId: number) =>
    request(`/pats/${patId}`, { method: 'DELETE' }),

  getBoardDetail: (boardId: number) => 
    request(`/boards/${boardId}`),

  updateBoard: (boardId: number, name: string, description?: string) =>
    request(`/boards/${boardId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    }),

  // Pass an empty string to clear back to the default folder fallback.
  setBoardIcon: (boardId: number, icon: string) =>
    request(`/boards/${boardId}`, {
      method: 'PUT',
      body: JSON.stringify({ icon }),
    }),

  deleteBoard: (boardId: number) => 
    request(`/boards/${boardId}`, {
      method: 'DELETE',
    }),

  // Columns
  createColumn: (boardId: number, name: string) => 
    request(`/boards/${boardId}/columns`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateColumn: (columnId: number, name: string) => 
    request(`/columns/${columnId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),

  deleteColumn: (columnId: number) => 
    request(`/columns/${columnId}`, {
      method: 'DELETE',
    }),

  reorderColumns: (boardId: number, columnIds: number[]) => 
    request(`/boards/${boardId}/columns/reorder`, {
      method: 'POST',
      body: JSON.stringify({ column_ids: columnIds }),
    }),

  // Tags
  getTags: () =>
    request('/tags'),

  createTag: (name: string, color?: string) =>
    request('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  updateTag: (tagId: number, data: { name?: string; color?: string }) =>
    request(`/tags/${tagId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTag: (tagId: number) =>
    request(`/tags/${tagId}`, {
      method: 'DELETE',
    }),

  // Contacts
  getContacts: (contextId?: number) => {
    const qs = contextId !== undefined ? `?context_id=${contextId}` : '';
    return request(`/contacts${qs}`);
  },

  createContact: (
    data: { name: string; email?: string; image_url?: string; is_favorite?: boolean },
  ) =>
    request('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateContact: (
    contactId: number,
    data: { name?: string; email?: string; image_url?: string; is_favorite?: boolean },
  ) =>
    request(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteContact: (contactId: number) =>
    request(`/contacts/${contactId}`, { method: 'DELETE' }),

  // Tasks
  createTask: (
    columnId: number,
    taskData: {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string;
      tag_ids?: number[];
      requester_id?: number | null;
      assignee_ids?: number[];
    },
  ) =>
    request(`/columns/${columnId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(taskData),
    }),

  updateTask: (
    taskId: number,
    taskData: {
      title?: string;
      description?: string;
      priority?: string;
      due_date?: string | null;
      column_id?: number;
      tag_ids?: number[];
      requester_id?: number | null;
      assignee_ids?: number[];
      completed?: boolean;
      parent_task_id?: number;
      archived?: boolean;
    },
  ) =>
    request(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    }),

  moveTaskToBoard: (taskId: number, boardId: number, columnId: number) =>
    request(`/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify({ board_id: boardId, column_id: columnId }),
    }),

  archiveAllInColumn: (columnId: number) =>
    request(`/columns/${columnId}/archive-all`, { method: 'POST' }),

  getArchivedInColumn: (columnId: number) =>
    request(`/columns/${columnId}/archived-tasks`),

  // Reminders
  createReminder: (taskId: number, remindAtIso: string) =>
    request(`/tasks/${taskId}/reminders`, {
      method: 'POST',
      body: JSON.stringify({ remind_at: remindAtIso }),
    }),

  deleteReminder: (reminderId: number) =>
    request(`/reminders/${reminderId}`, { method: 'DELETE' }),

  getPendingReminders: () => request('/reminders/pending'),

  // Web Push
  getVapidPublicKey: () => request('/push/vapid-public-key'),

  subscribePush: (subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) =>
    request('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    }),

  unsubscribePush: (endpoint: string) =>
    request('/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint, keys: { p256dh: '', auth: '' } }),
    }),

  deleteTask: (taskId: number) => 
    request(`/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  reorderTasks: (columnId: number, taskIds: number[]) => 
    request(`/columns/${columnId}/tasks/reorder`, {
      method: 'POST',
      body: JSON.stringify({ task_ids: taskIds, column_id: columnId }),
    }),

  // Subtasks (a child task — full Task under a parent via parent_task_id).
  // The convenience POST inherits column/board from the parent so the
  // SPA doesn't have to know them.
  createSubtask: (parentTaskId: number, title: string) =>
    request(`/tasks/${parentTaskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  // Attachments
  uploadAttachment: (taskId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/tasks/${taskId}/attachments`, {
      method: 'POST',
      body: fd,
    });
  },

  deleteAttachment: (attachmentId: number) =>
    request(`/attachments/${attachmentId}`, { method: 'DELETE' }),

  // Passkeys (WebAuthn). Begin returns PublicKeyCredentialCreationOptions
  // / PublicKeyCredentialRequestOptions encoded by the python-webauthn
  // lib (base64url strings for challenge / user.id / credential.id).
  passkeyRegisterBegin: (label?: string) =>
    request('/passkeys/register/begin', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  passkeyRegisterFinish: (label: string | undefined, credential: any) =>
    request('/passkeys/register/finish', {
      method: 'POST',
      body: JSON.stringify({ label, credential }),
    }),

  passkeyLoginBegin: () =>
    request('/passkeys/login/begin', { method: 'POST', body: JSON.stringify({}) }),

  passkeyLoginFinish: (state: string, credential: any, remember = false) =>
    request('/passkeys/login/finish', {
      method: 'POST',
      body: JSON.stringify({ state, credential, remember }),
    }),

  listPasskeys: () => request('/passkeys'),

  deletePasskey: (id: number) =>
    request(`/passkeys/${id}`, { method: 'DELETE' }),

  // Focus (Pomodoro)
  createFocusSession: (taskId: number, duration: number) => 
    request('/focus', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, duration }),
    }),

  getFocusStats: () => 
    request('/focus/stats'),
};

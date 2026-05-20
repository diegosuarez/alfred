export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:30000';

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

async function request(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  const response = await fetch(`${API_URL}/api${endpoint}`, {
    ...options,
    headers,
    // include credentials so the OAuth state cookie set by /google-accounts/connect
    // is stored cross-origin and replayed on Google's callback redirect.
    credentials: 'include',
  });
  
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

  login: async (email: string, password: string) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    const data = await request('/auth/login', {
      method: 'POST',
      body: formData,
    });
    setToken(data.access_token);
    return data;
  },

  logout: () => {
    setToken('');
  },

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

  // Tasks
  createTask: (
    columnId: number,
    taskData: {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string;
      tag_ids?: number[];
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
    },
  ) =>
    request(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
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

  // Subtasks
  createSubtask: (taskId: number, title: string) =>
    request(`/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  updateSubtask: (
    subtaskId: number,
    data: { title?: string; completed?: boolean; position?: number },
  ) =>
    request(`/subtasks/${subtaskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSubtask: (subtaskId: number) =>
    request(`/subtasks/${subtaskId}`, {
      method: 'DELETE',
    }),

  // Focus (Pomodoro)
  createFocusSession: (taskId: number, duration: number) => 
    request('/focus', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, duration }),
    }),

  getFocusStats: () => 
    request('/focus/stats'),
};

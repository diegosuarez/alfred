const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

  // Boards
  getBoards: () => 
    request('/boards'),

  createBoard: (name: string, description?: string) => 
    request('/boards', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

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

  // Tasks
  createTask: (columnId: number, taskData: { title: string; description?: string; priority?: string; due_date?: string }) => 
    request(`/columns/${columnId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(taskData),
    }),

  updateTask: (taskId: number, taskData: { title?: string; description?: string; priority?: string; due_date?: string | null; column_id?: number }) => 
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

  // Focus (Pomodoro)
  createFocusSession: (taskId: number, duration: number) => 
    request('/focus', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, duration }),
    }),

  getFocusStats: () => 
    request('/focus/stats'),
};

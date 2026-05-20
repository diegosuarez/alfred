import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { FocusTimer } from './components/FocusTimer';
import { Statistics } from './components/Statistics';
import { QuickCapture } from './components/QuickCapture';
import { GoogleSettings } from './components/GoogleSettings';
import { api, getToken, setToken } from './services/api';

interface Context {
  id: number;
  name: string;
  color?: string | null;
  google_account_id?: number | null;
}

interface Board {
  id: number;
  name: string;
  description?: string;
  context_id: number | null;
}

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [contexts, setContexts] = useState<Context[]>([]);
  // null = "All contexts"
  const [activeContextId, setActiveContextId] = useState<number | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<'board' | 'stats'>('board');
  const [activeTask, setActiveTask] = useState<{ id: number; title: string } | null>(null);
  
  // Responsive mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(false);

  // Triggers reload of active components when a task is captured globally
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Google settings modal
  const [showSettings, setShowSettings] = useState(false);

  // Decodes JWT payload to extract user metadata
  const parseUserEmail = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      setUserEmail(payload.sub || 'Usuario');
    } catch (e) {
      setUserEmail('Usuario');
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setShowSidebar(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadContextsAndBoards = async () => {
    try {
      const [ctxData, boardsData] = await Promise.all([
        api.getContexts(),
        api.getBoards(),
      ]);

      let finalContexts: Context[] = ctxData;
      let finalBoards: Board[] = boardsData;

      if (finalBoards.length === 0) {
        // Auto-create a default board on first login for smooth onboarding.
        // The backend lazily creates a "General" context to attach it to.
        const defaultBoard = await api.createBoard(
          '🎯 Mi Primer Tablero',
          'Organiza tus tareas aquí.'
        );
        finalBoards = [defaultBoard];
        // Refresh contexts so we pick up the freshly-created "General".
        finalContexts = await api.getContexts();
      }

      setContexts(finalContexts);
      setBoards(finalBoards);

      if (activeBoardId === null && finalBoards.length > 0) {
        setActiveBoardId(finalBoards[0].id);
      }
    } catch (err) {
      console.error('Error loading contexts/boards:', err);
    }
  };

  useEffect(() => {
    // Pick up a JWT handed back by the Google OAuth callback before
    // checking localStorage, so a fresh login wins over a stale token.
    const url = new URL(window.location.href);
    const oauthToken = url.searchParams.get('token');
    const oauthError = url.searchParams.get('oauth_error');
    const googleConnected = url.searchParams.get('google_connected');
    if (oauthToken) {
      setToken(oauthToken);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
    if (oauthError) {
      alert(`Google sign-in failed: ${oauthError}`);
      url.searchParams.delete('oauth_error');
      window.history.replaceState({}, '', url.toString());
    }
    if (googleConnected) {
      // Surface the settings modal so the user sees the freshly-attached account.
      setShowSettings(true);
      url.searchParams.delete('google_connected');
      window.history.replaceState({}, '', url.toString());
    }

    const token = getToken();
    if (token) {
      setIsAuthenticated(true);
      parseUserEmail(token);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadContextsAndBoards();
    }
  }, [isAuthenticated, refreshTrigger]);

  const handleLoginSuccess = () => {
    const token = getToken();
    setIsAuthenticated(true);
    if (token) parseUserEmail(token);
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setUserEmail('');
    setContexts([]);
    setActiveContextId(null);
    setBoards([]);
    setActiveBoardId(null);
    setCurrentView('board');
    setActiveTask(null);
  };

  const handleCreateBoard = async (name: string) => {
    try {
      // Scope new boards to the active context when one is selected; if
      // we're on "All contexts", let the backend pick the default.
      const newBoard = await api.createBoard(
        name,
        undefined,
        activeContextId ?? undefined,
      );
      setBoards([...boards, newBoard]);
      setActiveBoardId(newBoard.id);
      setCurrentView('board');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateContext = async (name: string) => {
    try {
      const created = await api.createContext(name);
      setContexts([...contexts, created]);
      setActiveContextId(created.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const reloadContexts = async () => {
    try {
      const fresh = await api.getContexts();
      setContexts(fresh);
    } catch (err) {
      console.error('Error reloading contexts:', err);
    }
  };

  const handleStartFocus = (task: { id: number; title: string }) => {
    setActiveTask(task);
  };

  const handleTaskCaptured = () => {
    // Increment trigger to force board reloads
    setRefreshTrigger((prev) => prev + 1);
  };

  if (!isAuthenticated) {
    return <Auth onLoginSuccess={handleLoginSuccess} />;
  }

  // Boards visible in the sidebar / list view, filtered by active context
  // (null => "All contexts" => everything).
  const visibleBoards =
    activeContextId === null
      ? boards
      : boards.filter((b) => b.context_id === activeContextId);

  // If the active board fell out of the current context filter, pick a new one.
  if (activeBoardId !== null && !visibleBoards.some((b) => b.id === activeBoardId)) {
    if (visibleBoards.length > 0) {
      // Defer to avoid setState-during-render warning.
      queueMicrotask(() => setActiveBoardId(visibleBoards[0].id));
    } else {
      queueMicrotask(() => setActiveBoardId(null));
    }
  }

  // Dynamic mobile sidebar style
  const mobileSidebarStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute',
        top: 0,
        left: showSidebar ? 0 : '-300px',
        margin: 0,
        height: '100vh',
        zIndex: 1000,
        width: '280px',
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        backgroundColor: '#0a0c16',
      }
    : {};

  return (
    <div style={styles.appLayout}>
      {/* Mobile Sidebar backdrop */}
      {isMobile && showSidebar && (
        <div style={styles.mobileBackdrop} onClick={() => setShowSidebar(false)} />
      )}

      {/* Mobile menu trigger */}
      {isMobile && (
        <button
          style={styles.mobileMenuBtn}
          onClick={() => setShowSidebar(!showSidebar)}
          title="Abrir menú"
        >
          ☰
        </button>
      )}

      <Sidebar
        contexts={contexts}
        activeContextId={activeContextId}
        onSelectContext={(id) => setActiveContextId(id)}
        onCreateContext={handleCreateContext}
        boards={visibleBoards}
        activeBoardId={activeBoardId}
        onSelectBoard={(id) => setActiveBoardId(id)}
        currentView={currentView}
        onChangeView={(view) => setCurrentView(view)}
        onCreateBoard={handleCreateBoard}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
        userEmail={userEmail}
        style={mobileSidebarStyle}
        onCloseMobileSidebar={isMobile ? () => setShowSidebar(false) : undefined}
      />

      <main style={{
        ...styles.mainContent,
        paddingTop: isMobile ? '60px' : '0px',
      }}>
        {currentView === 'board' && activeBoardId !== null && (
          <KanbanBoard
            key={`${activeBoardId}-${refreshTrigger}`}
            boardId={activeBoardId}
            onStartFocus={handleStartFocus}
          />
        )}
        {currentView === 'stats' && (
          <Statistics key={refreshTrigger} />
        )}
      </main>

      {/* Floating Keyboard Quick Capture tool */}
      <QuickCapture boards={boards} onTaskCaptured={handleTaskCaptured} />

      {/* Floating Pomodoro overlay (only when a task has been selected to focus on) */}
      {activeTask && (
        <FocusTimer
          activeTask={activeTask}
          onClearActiveTask={() => setActiveTask(null)}
          onSessionLogged={handleTaskCaptured}
        />
      )}

      {showSettings && (
        <GoogleSettings
          contexts={contexts}
          onClose={() => setShowSettings(false)}
          onContextsRefresh={reloadContexts}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appLayout: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    position: 'relative',
  },
  mainContent: {
    flex: 1,
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
  },
  mobileMenuBtn: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 900,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--glass-border)',
    borderRadius: '10px',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '20px',
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
    transition: 'var(--transition-smooth)',
  },
  mobileBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 950,
  },
};

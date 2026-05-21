import React, { useState, useEffect, useRef } from 'react';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { FocusTimer } from './components/FocusTimer';
import { Statistics } from './components/Statistics';
import { QuickCapture } from './components/QuickCapture';
import { GoogleSettings } from './components/GoogleSettings';
import { TokensSettings } from './components/TokensSettings';
import { ContactsSettings } from './components/ContactsSettings';
import { ReminderAlerts, type FiredReminder } from './components/ReminderAlerts';
import { ensurePushSubscription } from './services/push';
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
  // PAT (Personal Access Tokens) modal
  const [showTokens, setShowTokens] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Reminder scheduler state
  const [firedReminders, setFiredReminders] = useState<FiredReminder[]>([]);
  const [externalTaskFocus, setExternalTaskFocus] = useState<number | null>(null);
  const scheduledTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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

  const fireReminder = (r: { id: number; task_id: number; task_title: string; remind_at: string }) => {
    setFiredReminders((prev) => {
      if (prev.some((f) => f.reminderId === r.id)) return prev;
      return [
        ...prev,
        {
          reminderId: r.id,
          taskId: r.task_id,
          taskTitle: r.task_title,
          remindAt: r.remind_at,
        },
      ];
    });
    // Chrome notification — only if the user has previously granted it.
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const n = new Notification(r.task_title, {
          body: 'Recordatorio de Alfred',
          icon: '/logo.png',
          tag: `alfred-reminder-${r.id}`,
        });
        n.onclick = () => {
          window.focus();
          setExternalTaskFocus(r.task_id);
          n.close();
        };
      } catch {
        /* ignore */
      }
    }
  };

  const reloadReminders = async () => {
    try {
      const list: Array<{
        id: number;
        task_id: number;
        task_title: string;
        remind_at: string;
      }> = await api.getPendingReminders();

      // Clear any previously-scheduled timers — we'll set fresh ones from
      // the latest list (handles deletes, creates and tab-resume cases).
      for (const t of scheduledTimers.current.values()) clearTimeout(t);
      scheduledTimers.current.clear();

      const now = Date.now();
      for (const r of list) {
        if (firedReminders.some((f) => f.reminderId === r.id)) continue;
        const due = new Date(r.remind_at).getTime();
        if (due <= now) {
          fireReminder(r);
        } else {
          // setTimeout caps at ~2^31 ms (~24.8 days). For anything beyond
          // that we rely on the periodic poll below.
          const delay = Math.min(due - now, 2 ** 31 - 1);
          const t = setTimeout(() => fireReminder(r), delay);
          scheduledTimers.current.set(r.id, t);
        }
      }
    } catch (err) {
      console.error('Error loading reminders:', err);
    }
  };

  // Boot + periodic re-poll + on-focus re-poll so long-running tabs
  // keep firing reminders even if the JS timer drifted while the tab
  // was backgrounded.
  useEffect(() => {
    if (!isAuthenticated) return;
    reloadReminders();
    // If the user already granted Notification permission in a previous
    // session, the SW + push subscription are silently re-established
    // here so server-side push works without any UI prompt.
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      ensurePushSubscription();
    }
    const id = setInterval(reloadReminders, 5 * 60 * 1000); // 5min
    const onFocus = () => reloadReminders();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      for (const t of scheduledTimers.current.values()) clearTimeout(t);
      scheduledTimers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // The service worker postMessages us when the user clicks an OS
  // notification so we can route them to the right task in the SPA.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
      return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'reminder-click' && event.data.taskId) {
        setCurrentView('board');
        setExternalTaskFocus(event.data.taskId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // If we landed via a "cold" notification click (the SW opened a new
  // window with ?focus_task=N because no SPA window was open), pick
  // that up on first auth.
  useEffect(() => {
    if (!isAuthenticated) return;
    const url = new URL(window.location.href);
    const focus = url.searchParams.get('focus_task');
    if (focus) {
      setCurrentView('board');
      setExternalTaskFocus(Number(focus));
      url.searchParams.delete('focus_task');
      window.history.replaceState({}, '', url.toString());
    }
  }, [isAuthenticated]);

  const dismissReminder = async (reminderId: number) => {
    setFiredReminders((prev) => prev.filter((f) => f.reminderId !== reminderId));
    try {
      await api.deleteReminder(reminderId);
    } catch (err) {
      console.error('Error dismissing reminder:', err);
    }
  };

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

  const handleRenameBoard = async (id: number, name: string) => {
    try {
      const updated = await api.updateBoard(id, name);
      setBoards(boards.map((b) => (b.id === id ? { ...b, name: updated.name } : b)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteBoard = async (id: number) => {
    try {
      await api.deleteBoard(id);
      const remaining = boards.filter((b) => b.id !== id);
      setBoards(remaining);
      if (activeBoardId === id) {
        setActiveBoardId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateContext = async (name: string, color?: string) => {
    try {
      const created = await api.createContext(name, color);
      setContexts([...contexts, created]);
      setActiveContextId(created.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateContext = async (
    id: number,
    data: { name?: string; color?: string },
  ) => {
    try {
      const updated = await api.updateContext(id, data);
      setContexts(contexts.map((c) => (c.id === id ? updated : c)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteContext = async (id: number) => {
    try {
      await api.deleteContext(id);
      const remaining = contexts.filter((c) => c.id !== id);
      setContexts(remaining);
      if (activeContextId === id) {
        setActiveContextId(remaining.length > 0 ? remaining[0].id : null);
      }
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
        onUpdateContext={handleUpdateContext}
        onDeleteContext={handleDeleteContext}
        boards={visibleBoards}
        activeBoardId={activeBoardId}
        onSelectBoard={(id) => setActiveBoardId(id)}
        currentView={currentView}
        onChangeView={(view) => setCurrentView(view)}
        onCreateBoard={handleCreateBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        onOpenSettings={() => setShowSettings(true)}
        onOpenTokens={() => setShowTokens(true)}
        onOpenContacts={() => setShowContacts(true)}
        onLogout={handleLogout}
        userEmail={userEmail}
        style={mobileSidebarStyle}
        onCloseMobileSidebar={isMobile ? () => setShowSidebar(false) : undefined}
      />

      <main style={{
        ...styles.mainContent,
        paddingTop: isMobile ? '60px' : '0px',
        ...(activeContextId !== null && (() => {
          const ctx = contexts.find((c) => c.id === activeContextId);
          if (!ctx?.color) return {};
          // Two overlapping radial gradients (top-center + bottom-right)
          // give a more confidently coloured workspace than the previous
          // 15%-alpha single layer that was hard to perceive on dark bg.
          return {
            background: [
              `radial-gradient(ellipse at 50% 0%, ${ctx.color}55 0%, transparent 55%)`,
              `radial-gradient(ellipse at 100% 100%, ${ctx.color}33 0%, transparent 60%)`,
            ].join(','),
            transition: 'background 0.4s ease',
          };
        })()),
      }}>
        {currentView === 'board' && activeBoardId !== null && (
          <KanbanBoard
            key={`${activeBoardId}-${refreshTrigger}`}
            boardId={activeBoardId}
            onStartFocus={handleStartFocus}
            onRemindersChanged={async () => {
              // Ask for Notification permission on the first reminder
              // the user creates per session, in a user-gesture-driven
              // moment (Chrome blocks "on page load" requests anyway).
              if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'default'
              ) {
                try {
                  await Notification.requestPermission();
                } catch {
                  /* ignore */
                }
              }
              if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted'
              ) {
                // Make sure the SW is registered and the backend has
                // our push subscription before the next reminder fires.
                await ensurePushSubscription();
              }
              reloadReminders();
            }}
            externalTaskFocus={externalTaskFocus}
            allBoards={boards}
            onTaskMovedToBoard={(newBoardId) => {
              // Jump to the destination board so the user lands where
              // the task is now living. The KanbanBoard remounts via
              // its key and fetches fresh state.
              setActiveBoardId(newBoardId);
            }}
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

      {showTokens && <TokensSettings onClose={() => setShowTokens(false)} />}

      {showContacts && (
        <ContactsSettings
          onClose={() => setShowContacts(false)}
          onChanged={handleTaskCaptured /* force board refresh */}
        />
      )}

      <ReminderAlerts
        fired={firedReminders}
        onDismiss={dismissReminder}
        onOpenTask={(taskId) => {
          // Make sure we're on the board view so the task modal can mount.
          setCurrentView('board');
          setExternalTaskFocus(taskId);
        }}
      />
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

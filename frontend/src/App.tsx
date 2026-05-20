import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { FocusTimer } from './components/FocusTimer';
import { Statistics } from './components/Statistics';
import { QuickCapture } from './components/QuickCapture';
import { api, getToken } from './services/api';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [boards, setBoards] = useState<any[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<'board' | 'stats'>('board');
  const [activeTask, setActiveTask] = useState<{ id: number; title: string } | null>(null);
  
  // Responsive mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(false);

  // Triggers reload of active components when a task is captured globally
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  const loadBoards = async () => {
    try {
      const boardsData = await api.getBoards();
      setBoards(boardsData);
      
      if (boardsData.length > 0) {
        // Default to first board if none selected
        if (activeBoardId === null) {
          setActiveBoardId(boardsData[0].id);
        }
      } else {
        // Auto-create a default board on first login for smooth onboarding
        const defaultBoard = await api.createBoard('🎯 Mi Primer Tablero', 'Organiza tus tareas aquí.');
        setBoards([defaultBoard]);
        setActiveBoardId(defaultBoard.id);
      }
    } catch (err) {
      console.error('Error loading boards:', err);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsAuthenticated(true);
      parseUserEmail(token);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadBoards();
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
    setBoards([]);
    setActiveBoardId(null);
    setCurrentView('board');
    setActiveTask(null);
  };

  const handleCreateBoard = async (name: string) => {
    try {
      const newBoard = await api.createBoard(name);
      setBoards([...boards, newBoard]);
      setActiveBoardId(newBoard.id);
      setCurrentView('board');
    } catch (err: any) {
      alert(err.message);
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
        boards={boards}
        activeBoardId={activeBoardId}
        onSelectBoard={(id) => setActiveBoardId(id)}
        currentView={currentView}
        onChangeView={(view) => setCurrentView(view)}
        onCreateBoard={handleCreateBoard}
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

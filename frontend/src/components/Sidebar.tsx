import React, { useState } from 'react';

interface Board {
  id: number;
  name: string;
  description?: string;
  context_id: number | null;
}

interface Context {
  id: number;
  name: string;
  color?: string | null;
}

interface SidebarProps {
  contexts: Context[];
  activeContextId: number | null;
  onSelectContext: (id: number | null) => void;
  onCreateContext: (name: string) => Promise<void>;
  boards: Board[];
  activeBoardId: number | null;
  onSelectBoard: (id: number) => void;
  currentView: 'board' | 'stats';
  onChangeView: (view: 'board' | 'stats') => void;
  onCreateBoard: (name: string) => Promise<void>;
  onLogout: () => void;
  userEmail: string;
  style?: React.CSSProperties;
  onCloseMobileSidebar?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  contexts,
  activeContextId,
  onSelectContext,
  onCreateContext,
  boards,
  activeBoardId,
  onSelectBoard,
  currentView,
  onChangeView,
  onCreateBoard,
  onLogout,
  userEmail,
  style,
  onCloseMobileSidebar,
}) => {
  const [newBoardName, setNewBoardName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [showAddContext, setShowAddContext] = useState(false);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    await onCreateBoard(newBoardName);
    setNewBoardName('');
    setShowAddForm(false);
    onCloseMobileSidebar?.();
  };

  const handleCreateContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContextName.trim()) return;
    await onCreateContext(newContextName);
    setNewContextName('');
    setShowAddContext(false);
  };

  return (
    <aside className="glass-panel" style={{ ...styles.sidebar, ...style }}>
      {/* Mobile Close Button */}
      {onCloseMobileSidebar && (
        <button 
          style={styles.closeMobileBtn} 
          onClick={onCloseMobileSidebar}
          title="Cerrar menú"
        >
          ✕
        </button>
      )}

      {/* App Header */}
      <div style={styles.header}>
        <div style={styles.logoBadge}>A</div>
        <h2 style={styles.logoTitle}>Alfred</h2>
      </div>

      {/* Main Views Navigation */}
      <div style={styles.navigation}>
        <h3 style={styles.navLabel}>General</h3>
        <button
          className="glass-button-secondary"
          style={{
            ...styles.navBtn,
            ...(currentView === 'stats' ? styles.activeNavBtn : {}),
          }}
          onClick={() => {
            onChangeView('stats');
            onCloseMobileSidebar?.();
          }}
        >
          <span style={styles.navIcon}>📊</span>
          <span>Estadísticas</span>
        </button>
      </div>

      {/* Contexts Section */}
      <div style={styles.contextsContainer}>
        <div style={styles.boardsHeader}>
          <h3 style={styles.navLabel}>Contextos</h3>
          <button
            style={styles.addBoardBtn}
            onClick={() => setShowAddContext(!showAddContext)}
            title="Nuevo contexto"
          >
            {showAddContext ? '✕' : '＋'}
          </button>
        </div>

        {showAddContext && (
          <form
            onSubmit={handleCreateContext}
            style={styles.addForm}
            className="animate-fade-in"
          >
            <input
              type="text"
              className="glass-input"
              style={styles.addInput}
              value={newContextName}
              onChange={(e) => setNewContextName(e.target.value)}
              placeholder="Ej. Trabajo, Familia..."
              autoFocus
              required
            />
            <button type="submit" className="glass-button" style={styles.addSubmit}>
              Crear
            </button>
          </form>
        )}

        <div style={styles.contextPills}>
          <button
            className="glass-button-secondary"
            style={{
              ...styles.contextPill,
              ...(activeContextId === null ? styles.activeContextPill : {}),
            }}
            onClick={() => onSelectContext(null)}
          >
            Todos
          </button>
          {contexts.map((ctx) => (
            <button
              key={ctx.id}
              className="glass-button-secondary"
              style={{
                ...styles.contextPill,
                ...(activeContextId === ctx.id ? styles.activeContextPill : {}),
                ...(ctx.color ? { borderColor: ctx.color } : {}),
              }}
              onClick={() => onSelectContext(ctx.id)}
              title={ctx.name}
            >
              {ctx.name}
            </button>
          ))}
        </div>
      </div>

      {/* Boards Section */}
      <div style={styles.boardsContainer}>
        <div style={styles.boardsHeader}>
          <h3 style={styles.navLabel}>Mis Tableros</h3>
          <button
            style={styles.addBoardBtn}
            onClick={() => setShowAddForm(!showAddForm)}
            title="Nuevo Tablero"
          >
            {showAddForm ? '✕' : '＋'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleCreateBoard} style={styles.addForm} className="animate-fade-in">
            <input
              type="text"
              className="glass-input"
              style={styles.addInput}
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Nombre..."
              autoFocus
              required
            />
            <button type="submit" className="glass-button" style={styles.addSubmit}>
              Crear
            </button>
          </form>
        )}

        <div style={styles.boardList}>
          {boards.map((board) => {
            const isActive = currentView === 'board' && activeBoardId === board.id;
            return (
              <button
                key={board.id}
                className="glass-button-secondary"
                style={{
                  ...styles.boardBtn,
                  ...(isActive ? styles.activeBoardBtn : {}),
                }}
                onClick={() => {
                  onSelectBoard(board.id);
                  onChangeView('board');
                  onCloseMobileSidebar?.();
                }}
              >
                <span style={styles.boardIcon}>📁</span>
                <span style={styles.boardName}>{board.name}</span>
              </button>
            );
          })}
          {boards.length === 0 && (
            <p style={styles.emptyText}>No tienes tableros aún.</p>
          )}
        </div>
      </div>

      {/* User Session Area */}
      <div style={styles.userFooter}>
        <div style={styles.userInfo}>
          <div style={styles.avatar}>👤</div>
          <div style={styles.userDetails}>
            <span style={styles.userEmail} title={userEmail}>
              {userEmail.split('@')[0]}
            </span>
          </div>
        </div>
        <button
          className="glass-button glass-button-danger"
          style={styles.logoutBtn}
          onClick={() => {
            onLogout();
            onCloseMobileSidebar?.();
          }}
        >
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '280px',
    height: 'calc(100vh - 40px)',
    margin: '20px 0 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
  },
  logoBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '18px',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
  },
  logoTitle: {
    fontSize: '20px',
    fontWeight: 600,
    letterSpacing: '-0.5px',
  },
  navigation: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '28px',
  },
  navLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--text-muted)',
    fontWeight: 600,
    marginBottom: '8px',
    paddingLeft: '8px',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 16px',
    justifyContent: 'flex-start',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
  },
  activeNavBtn: {
    background: 'rgba(99, 102, 241, 0.15)',
    borderColor: 'rgba(99, 102, 241, 0.4)',
    color: '#ffffff',
  },
  navIcon: {
    fontSize: '16px',
  },
  contextsContainer: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '20px',
  },
  contextPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  contextPill: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '999px',
    cursor: 'pointer',
  },
  activeContextPill: {
    background: 'rgba(99, 102, 241, 0.18)',
    borderColor: 'rgba(99, 102, 241, 0.45)',
    color: '#ffffff',
  },
  boardsContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '200px',
  },
  boardsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  addBoardBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '16px',
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    transition: 'var(--transition-smooth)',
  },
  addForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  addInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
  },
  addSubmit: {
    padding: '8px 12px',
    fontSize: '13px',
  },
  boardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    flex: 1,
    maxHeight: '320px',
  },
  boardBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '10px 14px',
    justifyContent: 'flex-start',
    border: 'none',
    fontSize: '13px',
    textAlign: 'left',
  },
  activeBoardBtn: {
    background: 'rgba(168, 85, 247, 0.15)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
    color: '#ffffff',
  },
  boardIcon: {
    fontSize: '14px',
  },
  boardName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    marginTop: '20px',
  },
  userFooter: {
    marginTop: 'auto',
    paddingTop: '20px',
    borderTop: '1px solid var(--glass-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  userEmail: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textTransform: 'capitalize',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '13px',
    fontWeight: 500,
  },
  closeMobileBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '18px',
  },
};

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

// Palette of preset colors the user can pick for a context. Picked to
// stay readable against the dark glassmorphic background.
export const CONTEXT_COLORS = [
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#14b8a6', // teal
  '#3b82f6', // blue
];

interface SidebarProps {
  contexts: Context[];
  activeContextId: number | null;
  onSelectContext: (id: number | null) => void;
  onCreateContext: (name: string, color?: string) => Promise<void>;
  onUpdateContext: (id: number, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteContext: (id: number) => Promise<void>;
  boards: Board[];
  activeBoardId: number | null;
  onSelectBoard: (id: number) => void;
  currentView: 'board' | 'stats';
  onChangeView: (view: 'board' | 'stats') => void;
  onCreateBoard: (name: string) => Promise<void>;
  onRenameBoard: (id: number, name: string) => Promise<void>;
  onDeleteBoard: (id: number) => Promise<void>;
  onOpenSettings: () => void;
  onOpenTokens: () => void;
  onOpenContacts: () => void;
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
  onUpdateContext,
  onDeleteContext,
  boards,
  activeBoardId,
  onSelectBoard,
  currentView,
  onChangeView,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onOpenSettings,
  onOpenTokens,
  onOpenContacts,
  onLogout,
  userEmail,
  style,
  onCloseMobileSidebar,
}) => {
  const [newBoardName, setNewBoardName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [newContextColor, setNewContextColor] = useState<string | null>(null);
  const [showAddContext, setShowAddContext] = useState(false);
  const [editingContextId, setEditingContextId] = useState<number | null>(null);
  const [editingContextName, setEditingContextName] = useState('');
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editingBoardName, setEditingBoardName] = useState('');

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
    await onCreateContext(newContextName, newContextColor ?? undefined);
    setNewContextName('');
    setNewContextColor(null);
    setShowAddContext(false);
  };

  const startEditContext = (ctx: Context) => {
    setEditingContextId(ctx.id);
    setEditingContextName(ctx.name);
  };

  const cancelEditContext = () => {
    setEditingContextId(null);
    setEditingContextName('');
  };

  const commitEditContext = async () => {
    if (editingContextId === null) return;
    const name = editingContextName.trim();
    if (!name) {
      cancelEditContext();
      return;
    }
    await onUpdateContext(editingContextId, { name });
    cancelEditContext();
  };

  const handleSetContextColor = async (id: number, color: string) => {
    await onUpdateContext(id, { color });
  };

  const handleDeleteContextClick = async (id: number, name: string) => {
    if (!confirm(`¿Borrar el contexto "${name}"? Sus tableros se quedarán sin contexto asignado.`)) return;
    await onDeleteContext(id);
  };

  const startEditBoard = (id: number, current: string) => {
    setEditingBoardId(id);
    setEditingBoardName(current);
  };

  const cancelEditBoard = () => {
    setEditingBoardId(null);
    setEditingBoardName('');
  };

  const commitEditBoard = async () => {
    if (editingBoardId === null) return;
    const name = editingBoardName.trim();
    if (!name) {
      cancelEditBoard();
      return;
    }
    await onRenameBoard(editingBoardId, name);
    cancelEditBoard();
  };

  const handleDeleteBoardClick = async (id: number, name: string) => {
    if (!confirm(`¿Borrar el tablero "${name}"? Se perderán sus columnas y tareas.`)) return;
    await onDeleteBoard(id);
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
        <img src="/logo.png" alt="Alfred" style={styles.logoBadge} />
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
            style={styles.addContextForm}
            className="animate-fade-in"
          >
            <div style={styles.addForm}>
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
            </div>
            <div style={styles.swatchRow}>
              {CONTEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewContextColor(c)}
                  style={{
                    ...styles.swatch,
                    backgroundColor: c,
                    ...(newContextColor === c ? styles.swatchActive : {}),
                  }}
                  title={c}
                />
              ))}
            </div>
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
          {contexts.map((ctx) => {
            const active = activeContextId === ctx.id;
            const accent = ctx.color || 'rgba(255,255,255,0.18)';
            return (
              <button
                key={ctx.id}
                className="glass-button-secondary"
                style={{
                  ...styles.contextPill,
                  borderColor: accent,
                  ...(active
                    ? {
                        background: `${accent}30`,
                        borderColor: accent,
                        color: '#ffffff',
                      }
                    : {}),
                }}
                onClick={() => onSelectContext(ctx.id)}
                title={ctx.name}
              >
                <span
                  style={{
                    ...styles.contextDot,
                    backgroundColor: ctx.color || 'transparent',
                    borderColor: accent,
                  }}
                />
                {ctx.name}
              </button>
            );
          })}
        </div>

        {/* Controls for the active context (rename, color, delete). */}
        {activeContextId !== null && (() => {
          const ctx = contexts.find((c) => c.id === activeContextId);
          if (!ctx) return null;
          const isEditing = editingContextId === ctx.id;
          return (
            <div style={styles.contextControls} className="animate-fade-in">
              {isEditing ? (
                <input
                  type="text"
                  className="glass-input"
                  style={styles.contextRenameInput}
                  value={editingContextName}
                  onChange={(e) => setEditingContextName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitEditContext();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditContext();
                    }
                  }}
                  onBlur={commitEditContext}
                  autoFocus
                />
              ) : (
                <>
                  <button
                    type="button"
                    style={styles.contextControlBtn}
                    onClick={() => startEditContext(ctx)}
                    title="Renombrar contexto"
                  >
                    ✏️
                  </button>
                  <div style={styles.swatchRowInline}>
                    {CONTEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleSetContextColor(ctx.id, c)}
                        style={{
                          ...styles.swatch,
                          backgroundColor: c,
                          ...(ctx.color === c ? styles.swatchActive : {}),
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    style={styles.contextControlBtn}
                    onClick={() => handleDeleteContextClick(ctx.id, ctx.name)}
                    title="Borrar contexto"
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          );
        })()}
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
            const isEditing = editingBoardId === board.id;
            return (
              <div
                key={board.id}
                className="glass-button-secondary"
                style={{
                  ...styles.boardBtn,
                  ...(isActive ? styles.activeBoardBtn : {}),
                  cursor: isEditing ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (isEditing) return;
                  onSelectBoard(board.id);
                  onChangeView('board');
                  onCloseMobileSidebar?.();
                }}
              >
                <span style={styles.boardIcon}>📁</span>
                {isEditing ? (
                  <input
                    type="text"
                    className="glass-input"
                    style={styles.boardRenameInput}
                    value={editingBoardName}
                    onChange={(e) => setEditingBoardName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEditBoard();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditBoard();
                      }
                    }}
                    onBlur={commitEditBoard}
                    autoFocus
                  />
                ) : (
                  <>
                    <span style={styles.boardName}>{board.name}</span>
                    <span style={styles.boardActions}>
                      <button
                        type="button"
                        style={styles.boardActionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditBoard(board.id, board.name);
                        }}
                        title="Renombrar"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        style={styles.boardActionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBoardClick(board.id, board.name);
                        }}
                        title="Borrar"
                      >
                        🗑️
                      </button>
                    </span>
                  </>
                )}
              </div>
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
          className="glass-button-secondary"
          style={styles.settingsBtn}
          onClick={() => {
            onOpenSettings();
            onCloseMobileSidebar?.();
          }}
        >
          ⚙️ Cuentas Google
        </button>
        <button
          className="glass-button-secondary"
          style={styles.settingsBtn}
          onClick={() => {
            onOpenContacts();
            onCloseMobileSidebar?.();
          }}
        >
          👥 Contactos
        </button>
        <button
          className="glass-button-secondary"
          style={styles.settingsBtn}
          onClick={() => {
            onOpenTokens();
            onCloseMobileSidebar?.();
          }}
        >
          🔑 Tokens API
        </button>
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
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    objectFit: 'cover',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  contextDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: '1px solid',
    flexShrink: 0,
  },
  activeContextPill: {
    background: 'rgba(99, 102, 241, 0.18)',
    borderColor: 'rgba(99, 102, 241, 0.45)',
    color: '#ffffff',
  },
  addContextForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  swatchRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  swatchRowInline: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    flex: 1,
  },
  swatch: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
    padding: 0,
  },
  swatchActive: {
    border: '2px solid #ffffff',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
  },
  contextControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    padding: '6px 4px',
  },
  contextControlBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '4px 6px',
    borderRadius: '6px',
  },
  contextRenameInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '12px',
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
  boardActions: {
    display: 'flex',
    gap: '4px',
    marginLeft: '8px',
    opacity: 0.6,
  },
  boardActionBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: '4px',
    lineHeight: 1,
  },
  boardRenameInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '13px',
    background: 'rgba(255,255,255,0.06)',
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
  settingsBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '13px',
    fontWeight: 500,
    justifyContent: 'center',
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

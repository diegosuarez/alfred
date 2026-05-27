import React, { useEffect, useRef, useState } from 'react';
import type { Contact } from './ContactPicker';

interface ColumnLite {
  id: number;
  name: string;
}

interface BoardLite {
  id: number;
  name: string;
}

interface TaskContextMenuProps {
  anchor: { x: number; y: number };
  taskTitle: string;
  taskPriority: string;
  assigneeIds: number[];
  columns: ColumnLite[]; // columns of the current board
  currentColumnId: number;
  boards: BoardLite[]; // move-to-board candidates (same context)
  contacts: Contact[];
  onMoveColumn: (columnId: number) => void;
  onMoveBoard: (boardId: number) => void;
  onSetPriority: (priority: string) => void;
  onToggleAssignee: (contactId: number) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

type Sub = 'column' | 'board' | 'priority' | 'assignees' | null;

const MENU_WIDTH = 230;

export const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
  anchor,
  taskTitle,
  taskPriority,
  assigneeIds,
  columns,
  currentColumnId,
  boards,
  contacts,
  onMoveColumn,
  onMoveBoard,
  onSetPriority,
  onToggleAssignee,
  onArchive,
  onDelete,
  onClose,
}) => {
  const [openSub, setOpenSub] = useState<Sub>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on any outside click / Escape / scroll.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp the menu inside the viewport.
  const left = Math.min(anchor.x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(anchor.y, window.innerHeight - 320);
  // Flyouts open to the left when there's no room on the right.
  const flyoutLeft = left + MENU_WIDTH * 2 + 12 > window.innerWidth;

  const otherColumns = columns.filter((c) => c.id !== currentColumnId);

  const subStyle: React.CSSProperties = {
    ...styles.submenu,
    ...(flyoutLeft ? { right: '100%', marginRight: 4 } : { left: '100%', marginLeft: 4 }),
  };

  const priorities: { value: string; label: string }[] = [
    { value: 'low', label: 'Baja' },
    { value: 'medium', label: 'Media' },
    { value: 'high', label: 'Alta' },
  ];

  // Favorites and the self-contact bubble to the top of the assignee list.
  const sortedContacts = [...contacts].sort((a, b) => {
    const score = (c: Contact) => (c.is_self ? 2 : 0) + (c.is_favorite ? 1 : 0);
    const d = score(b) - score(a);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  return (
    <div
      ref={rootRef}
      className="glass-panel"
      style={{ ...styles.menu, left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={styles.menuTitle} title={taskTitle}>
        {taskTitle}
      </div>

      {/* Mover de columna */}
      {otherColumns.length > 0 && (
        <div
          className="ctx-item"
          style={styles.item}
          onMouseEnter={() => setOpenSub('column')}
        >
          <span>↔ Mover a columna</span>
          <span style={styles.chevron}>▸</span>
          {openSub === 'column' && (
            <div className="glass-panel" style={subStyle}>
              {otherColumns.map((c) => (
                <div
                  key={c.id}
                  className="ctx-item"
          style={styles.item}
                  onClick={() => onMoveColumn(c.id)}
                >
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mover de tablero */}
      {boards.length > 0 && (
        <div className="ctx-item" style={styles.item} onMouseEnter={() => setOpenSub('board')}>
          <span>➡ Mover a tablero</span>
          <span style={styles.chevron}>▸</span>
          {openSub === 'board' && (
            <div className="glass-panel" style={{ ...subStyle, maxHeight: 280, overflowY: 'auto' }}>
              {boards.map((b) => (
                <div
                  key={b.id}
                  className="ctx-item"
          style={styles.item}
                  onClick={() => onMoveBoard(b.id)}
                >
                  {b.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prioridad */}
      <div className="ctx-item" style={styles.item} onMouseEnter={() => setOpenSub('priority')}>
        <span>🏳 Prioridad</span>
        <span style={styles.chevron}>▸</span>
        {openSub === 'priority' && (
          <div className="glass-panel" style={subStyle}>
            {priorities.map((p) => (
              <div
                key={p.value}
                className="ctx-item"
          style={styles.item}
                onClick={() => onSetPriority(p.value)}
              >
                <span>{p.label}</span>
                {taskPriority === p.value && <span style={styles.check}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Asignados — stays open while toggling */}
      <div className="ctx-item" style={styles.item} onMouseEnter={() => setOpenSub('assignees')}>
        <span>👤 Asignados</span>
        <span style={styles.chevron}>▸</span>
        {openSub === 'assignees' && (
          <div
            className="glass-panel"
            style={{ ...subStyle, maxHeight: 300, overflowY: 'auto', minWidth: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            {sortedContacts.length === 0 && (
              <div style={styles.empty}>Sin contactos</div>
            )}
            {sortedContacts.map((c) => {
              const on = assigneeIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className="ctx-item"
          style={styles.item}
                  onClick={() => onToggleAssignee(c.id)}
                >
                  <span style={styles.assigneeName}>
                    {c.is_favorite || c.is_self ? '★ ' : ''}
                    {c.name}
                  </span>
                  {on && <span style={styles.check}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.divider} />

      <div
        className="ctx-item"
        style={styles.item}
        onMouseEnter={() => setOpenSub(null)}
        onClick={onArchive}
      >
        📦 Archivar
      </div>
      <div
        className="ctx-item"
        style={{ ...styles.item, ...styles.danger }}
        onMouseEnter={() => setOpenSub(null)}
        onClick={onDelete}
      >
        🗑️ Eliminar
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 2000,
    width: MENU_WIDTH,
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  menuTitle: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    padding: '4px 10px 6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    marginBottom: '4px',
  },
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  chevron: {
    color: 'var(--text-muted)',
    fontSize: '10px',
  },
  check: {
    color: 'var(--accent-primary, #818cf8)',
    fontSize: '12px',
  },
  submenu: {
    position: 'absolute',
    top: 0,
    minWidth: 170,
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    zIndex: 2001,
  },
  assigneeName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 150,
  },
  empty: {
    padding: '8px 10px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.08)',
    margin: '4px 0',
  },
  danger: {
    color: '#f87171',
  },
};

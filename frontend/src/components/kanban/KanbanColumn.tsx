import React from 'react';
import { api } from '../../services/api';
import type { CardMenuState, Column, Task } from './types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  col: Column;
  passesFilters: (task: Task) => boolean;
  dropHint: { columnId: number; index: number } | null;
  handleDragOver: (e: React.DragEvent) => void;
  handleColumnDrop: (e: React.DragEvent, targetColId: number) => Promise<void>;
  handleColumnDragStart: (e: React.DragEvent, colId: number) => void;
  handleColumnTailDragOver: (e: React.DragEvent, columnId: number) => void;
  draggingTaskId: number | null;
  handleDragStart: (e: React.DragEvent, taskId: number) => void;
  handleDragEnd: () => void;
  handleCardDragOver: (
    e: React.DragEvent,
    columnId: number,
    visibleIndex: number,
  ) => void;
  handleTaskDrop: (
    e: React.DragEvent,
    targetColId: number,
    visibleIndex: number,
    targetTaskId: number,
  ) => Promise<void>;
  setSelectedTask: (task: Task) => void;
  setCardMenu: (menu: CardMenuState) => void;
  onStartFocus: (task: { id: number; title: string }) => void;
  editingColId: number | null;
  setEditingColId: (id: number | null) => void;
  editingColName: string;
  setEditingColName: (name: string) => void;
  columnMenuOpenId: number | null;
  setColumnMenuOpenId: (id: number | null) => void;
  setArchiveModalColumn: (col: { id: number; name: string }) => void;
  fetchBoardDetails: () => Promise<void>;
  /** Inline new-task form (or its trigger), rendered below the task list. */
  addTaskArea: React.ReactNode;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  col,
  passesFilters,
  dropHint,
  handleDragOver,
  handleColumnDrop,
  handleColumnDragStart,
  handleColumnTailDragOver,
  draggingTaskId,
  handleDragStart,
  handleDragEnd,
  handleCardDragOver,
  handleTaskDrop,
  setSelectedTask,
  setCardMenu,
  onStartFocus,
  editingColId,
  setEditingColId,
  editingColName,
  setEditingColName,
  columnMenuOpenId,
  setColumnMenuOpenId,
  setArchiveModalColumn,
  fetchBoardDetails,
  addTaskArea,
}) => {
  const startEditColumn = (col: Column) => {
    setEditingColId(col.id);
    setEditingColName(col.name);
  };

  const commitColumnName = async (colId: number, original: string) => {
    const next = editingColName.trim();
    setEditingColId(null);
    if (!next || next === original) return;
    try {
      await api.updateColumn(colId, next);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteColumn = async (colId: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta columna y todas sus tareas?')) return;
    try {
      await api.deleteColumn(colId);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchiveAllInColumn = async (colId: number, colName: string) => {
    if (
      !confirm(
        `¿Archivar todas las tareas de "${colName}"? Las podrás recuperar desde "Ver archivadas".`,
      )
    )
      return;
    try {
      const result = await api.archiveAllInColumn(colId);
      setColumnMenuOpenId(null);
      fetchBoardDetails();
      if (result.archived === 0) {
        alert('No hay tareas activas que archivar en esta lista.');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Wiring shared by every card (parent and child) in this column.
  const cardProps = {
    draggingTaskId,
    handleDragStart,
    handleDragEnd,
    handleCardDragOver,
    handleTaskDrop,
    setSelectedTask,
    setCardMenu,
    onStartFocus,
  };

  return (
    <div
      className="glass-panel"
      style={styles.column}
      onDragOver={handleDragOver}
      onDrop={(e) => handleColumnDrop(e, col.id)}
    >
      {/* Column Header */}
      <div style={styles.columnHeader}>
        <h3 style={styles.columnTitle}>
          <span
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col.id)}
            style={styles.colDragHandle}
            title="Arrastrar para reordenar lista"
          >
            ⋮⋮
          </span>
          {editingColId === col.id ? (
            <input
              type="text"
              className="glass-input"
              style={styles.colTitleInput}
              value={editingColName}
              autoFocus
              onChange={(e) => setEditingColName(e.target.value)}
              onBlur={() => commitColumnName(col.id, col.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setEditingColId(null);
                }
              }}
            />
          ) : (
            <span
              onClick={() => startEditColumn(col)}
              style={styles.colTitleText}
              title="Click para renombrar"
            >
              {col.name}
            </span>
          )}{' '}
          <span style={styles.taskCount}>{col.tasks.length}</span>
        </h3>
        <div style={styles.colHeaderActions}>
          <div style={styles.colMenuWrapper}>
            <button
              style={styles.colDeleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                setColumnMenuOpenId(columnMenuOpenId === col.id ? null : col.id);
              }}
              title="Opciones de la lista"
            >
              ⋯
            </button>
            {columnMenuOpenId === col.id && (
              <div
                className="glass-panel"
                style={styles.colMenu}
                // The outside-click closer listens on `mousedown` (so
                // it fires before the button's onClick). Without
                // stopping mousedown here, the menu unmounts before
                // the click reaches our buttons and the handlers
                // never run.
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  style={styles.colMenuItem}
                  onClick={() => handleArchiveAllInColumn(col.id, col.name)}
                >
                  📦 Archivar todas
                </button>
                <button
                  style={styles.colMenuItem}
                  onClick={() => {
                    setColumnMenuOpenId(null);
                    setArchiveModalColumn({ id: col.id, name: col.name });
                  }}
                >
                  🗂️ Ver archivadas
                </button>
              </div>
            )}
          </div>
          <button style={styles.colDeleteBtn} onClick={() => handleDeleteColumn(col.id)} title="Borrar lista">
            ✕
          </button>
        </div>
      </div>

      {/* Task list container */}
      <div style={styles.taskList}>
        {(() => {
          const visible = col.tasks.filter(passesFilters);
          const hintHere =
            dropHint && dropHint.columnId === col.id ? dropHint.index : -1;
          return (
            <>
              {visible.map((task, vi) => {
                const children = task.children ?? [];
                return (
                  <React.Fragment key={task.id}>
                    {hintHere === vi && <div style={styles.dropPlaceholder} />}
                    <div style={styles.taskGroup}>
                      <TaskCard
                        task={task}
                        columnId={col.id}
                        // dropIndex now carries the *visible* slot,
                        // used by the Trello-style drop indicator.
                        dropIndex={vi}
                        {...cardProps}
                      />
                      {children.length > 0 && (
                        <div style={styles.childrenContainer}>
                          {children.map((child) => (
                            <div key={child.id} style={styles.childWrapper}>
                              <span style={styles.connectorH} />
                              <TaskCard
                                task={child}
                                columnId={col.id}
                                dropIndex={null}
                                isChild
                                {...cardProps}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {hintHere >= visible.length && (
                <div style={styles.dropPlaceholder} />
              )}
              {/* Tail zone: hovering here (empty space / below the
                  last card) points the indicator at the end. Grows
                  to fill the column so the whole lower area counts. */}
              <div
                style={styles.dropTailZone}
                onDragOver={(e) => handleColumnTailDragOver(e, col.id)}
              >
                {visible.length === 0 && (
                  <div style={styles.emptyColText}>Arrastra aquí tareas</div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* Add Task Area */}
      {addTaskArea}

      <button
        style={styles.archivedLink}
        onClick={() => setArchiveModalColumn({ id: col.id, name: col.name })}
        title="Ver tareas archivadas de esta lista"
      >
        Ver archivadas
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  column: {
    // Stretchy column: grows up to 2x the legacy 320px when the board
    // has few lists and there's spare horizontal room; never shrinks
    // below 320px so wide boards scroll horizontally instead of
    // crushing their cards.
    flex: '1 0 320px',
    minWidth: '320px',
    maxWidth: '640px',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
  },
  columnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  columnTitle: {
    fontSize: '16px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  taskCount: {
    fontSize: '12px',
    background: 'rgba(255, 255, 255, 0.08)',
    padding: '2px 8px',
    borderRadius: '10px',
    color: 'var(--text-secondary)',
  },
  colDeleteBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'var(--transition-smooth)',
  },
  taskList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px',
    marginBottom: '16px',
    minHeight: '80px',
  },
  dropPlaceholder: {
    height: '52px',
    borderRadius: 'var(--border-radius-sm, 8px)',
    border: '2px dashed rgba(129, 140, 248, 0.7)',
    background: 'rgba(129, 140, 248, 0.12)',
    // The gap from taskList already spaces it; a tiny margin keeps the
    // dashed box from kissing the neighbouring cards.
    margin: '0',
    flexShrink: 0,
    transition: 'all 0.12s ease',
  },
  dropTailZone: {
    flex: 1,
    minHeight: '40px',
  },
  emptyColText: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
    padding: '24px 0',
    border: '1px dashed rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  // Container holding a parent card + (optionally) its children stacked
  // and connected by an L-shaped line on the left.
  taskGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  childrenContainer: {
    position: 'relative',
    marginLeft: '20px',
    paddingLeft: '20px',
    paddingTop: '6px',
    marginTop: '6px',
    borderLeft: '2px solid rgba(99,102,241,0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  childWrapper: {
    position: 'relative',
  },
  // Short horizontal line bridging the vertical container border to the
  // left edge of the child card.
  connectorH: {
    position: 'absolute',
    top: '22px',
    left: '-20px',
    width: '20px',
    borderTop: '2px solid rgba(99,102,241,0.35)',
  },
  colHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  colDragHandle: {
    cursor: 'grab',
    color: 'var(--text-muted)',
    fontSize: '14px',
    userSelect: 'none',
    letterSpacing: '-2px',
    padding: '0 2px',
  },
  colTitleText: {
    cursor: 'text',
    padding: '2px 4px',
    borderRadius: '4px',
  },
  colTitleInput: {
    fontSize: '16px',
    fontWeight: 600,
    padding: '4px 8px',
    minWidth: '0',
    flex: 1,
  },
  colMenuWrapper: {
    position: 'relative',
  },
  colMenu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 50,
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: '180px',
  },
  colMenuItem: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    borderRadius: 'var(--border-radius-sm)',
  },
  archivedLink: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '6px 0 0 0',
    textAlign: 'center',
    width: '100%',
    fontStyle: 'italic',
    textDecoration: 'underline dotted',
    textDecorationColor: 'rgba(255,255,255,0.15)',
    textUnderlineOffset: '3px',
  },
};

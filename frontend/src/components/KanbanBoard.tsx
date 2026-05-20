import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  due_date?: string;
  position: number;
  column_id: number;
  board_id: number;
  total_focus_time: number;
}

interface Column {
  id: number;
  name: string;
  position: number;
  board_id: number;
  tasks: Task[];
}

interface BoardDetail {
  id: number;
  name: string;
  description?: string;
  columns: Column[];
}

interface KanbanBoardProps {
  boardId: number;
  onStartFocus: (task: { id: number; title: string }) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ boardId, onStartFocus }) => {
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Inline forms state
  const [newColName, setNewColName] = useState('');
  const [showAddCol, setShowAddCol] = useState(false);

  const [activeNewTaskCol, setActiveNewTaskCol] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  // Task detailed view modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fetchBoardDetails = async () => {
    try {
      setLoading(true);
      const data = await api.getBoardDetail(boardId);
      setBoard(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el tablero.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoardDetails();
  }, [boardId]);

  // Column Actions
  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    try {
      await api.createColumn(boardId, newColName);
      setNewColName('');
      setShowAddCol(false);
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

  // Task Actions
  const handleAddTask = async (columnId: number) => {
    if (!newTaskTitle.trim()) return;
    try {
      await api.createTask(columnId, {
        title: newTaskTitle,
        description: newTaskDesc || undefined,
        priority: newTaskPriority,
        due_date: newTaskDueDate || undefined,
      });
      // Clear forms
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskPriority('medium');
      setNewTaskDueDate('');
      setActiveNewTaskCol(null);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateTaskDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    try {
      await api.updateTask(selectedTask.id, {
        title: selectedTask.title,
        description: selectedTask.description || '',
        priority: selectedTask.priority,
        due_date: selectedTask.due_date || null,
      });
      setSelectedTask(null);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('¿Seguro que quieres borrar esta tarea?')) return;
    try {
      await api.deleteTask(taskId);
      setSelectedTask(null);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // HTML5 Drag & Drop. Drops on a column append; drops on a task
  // insert at that task's position so intra-column order survives.
  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('text/plain', taskId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const moveTask = async (taskId: number, targetColId: number, targetIndex?: number) => {
    if (!board) return;

    let sourceColId: number | null = null;
    let draggedTask: Task | null = null;
    for (const col of board.columns) {
      const found = col.tasks.find((t) => t.id === taskId);
      if (found) {
        sourceColId = col.id;
        draggedTask = found;
        break;
      }
    }
    if (!draggedTask || sourceColId === null) return;

    // Build the next state: remove from source, insert into target.
    const updatedColumns = board.columns.map((col) => {
      if (col.id !== sourceColId && col.id !== targetColId) return col;

      let tasks = col.tasks.filter((t) => t.id !== taskId);
      if (col.id === targetColId) {
        const insertAt = targetIndex === undefined ? tasks.length : Math.min(targetIndex, tasks.length);
        tasks = [
          ...tasks.slice(0, insertAt),
          { ...draggedTask!, column_id: targetColId },
          ...tasks.slice(insertAt),
        ];
      }
      return { ...col, tasks };
    });

    setBoard({ ...board, columns: updatedColumns });

    const newOrder = updatedColumns
      .find((c) => c.id === targetColId)
      ?.tasks.map((t) => t.id) ?? [];

    try {
      await api.reorderTasks(targetColId, newOrder);
    } catch (err: any) {
      alert(err.message);
      fetchBoardDetails();
    }
  };

  const handleColumnDrop = async (e: React.DragEvent, targetColId: number) => {
    e.preventDefault();
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (!taskIdStr) return;
    await moveTask(parseInt(taskIdStr), targetColId);
  };

  const handleTaskDrop = async (e: React.DragEvent, targetColId: number, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (!taskIdStr) return;
    await moveTask(parseInt(taskIdStr), targetColId, targetIndex);
  };

  // Helpers
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'var(--priority-low)';
      case 'high': return 'var(--priority-high)';
      default: return 'var(--priority-medium)';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low': return 'Baja';
      case 'high': return 'Alta';
      default: return 'Media';
    }
  };

  const formatFocusTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  if (loading && !board) {
    return <div style={styles.centered}>Cargando Alfred...</div>;
  }

  if (error) {
    return <div style={styles.centeredError}>{error}</div>;
  }

  if (!board) {
    return <div style={styles.centered}>Selecciona un tablero para comenzar.</div>;
  }

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Board Header */}
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>{board.name}</h2>
          <p style={styles.subtitle}>{board.description || 'Sin descripción'}</p>
        </div>
        <button
          className="glass-button glass-button-secondary"
          onClick={() => setShowAddCol(!showAddCol)}
        >
          {showAddCol ? 'Cancelar' : '＋ Añadir Lista'}
        </button>
      </header>

      {/* Add Column Inline Form */}
      {showAddCol && (
        <form onSubmit={handleAddColumn} style={styles.addColForm} className="animate-fade-in">
          <input
            type="text"
            className="glass-input"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Nueva lista (ej. Ideas, En Espera)..."
            autoFocus
            required
          />
          <button type="submit" className="glass-button">Crear</button>
        </form>
      )}

      {/* Columns Workspace */}
      <div style={styles.workspace}>
        {board.columns.map((col) => (
          <div
            key={col.id}
            className="glass-panel"
            style={styles.column}
            onDragOver={handleDragOver}
            onDrop={(e) => handleColumnDrop(e, col.id)}
          >
            {/* Column Header */}
            <div style={styles.columnHeader}>
              <h3 style={styles.columnTitle}>
                {col.name} <span style={styles.taskCount}>{col.tasks.length}</span>
              </h3>
              <button style={styles.colDeleteBtn} onClick={() => handleDeleteColumn(col.id)}>
                ✕
              </button>
            </div>

            {/* Task list container */}
            <div style={styles.taskList}>
              {col.tasks.map((task, taskIndex) => (
                <div
                  key={task.id}
                  className="glass-card"
                  style={styles.taskCard}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleTaskDrop(e, col.id, taskIndex)}
                  onClick={() => setSelectedTask(task)}
                >
                  <div style={styles.taskCardHeader}>
                    <span
                      style={{
                        ...styles.priorityBadge,
                        backgroundColor: getPriorityColor(task.priority),
                      }}
                    >
                      {getPriorityLabel(task.priority)}
                    </span>
                    {task.total_focus_time > 0 && (
                      <span style={styles.focusTimeBadge}>
                        ⏱️ {formatFocusTime(task.total_focus_time)}
                      </span>
                    )}
                  </div>
                  <h4 style={styles.taskTitle}>{task.title}</h4>
                  {task.description && (
                    <p style={styles.taskDesc}>{task.description}</p>
                  )}
                  <div style={styles.taskFooter}>
                    {task.due_date ? (
                      <span style={styles.dueDate}>
                        📅 {new Date(task.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : <span />}
                    <button
                      className="glass-button"
                      style={styles.focusTaskBtn}
                      onClick={(e) => {
                        e.stopPropagation(); // Avoid opening the detailed modal
                        onStartFocus({ id: task.id, title: task.title });
                      }}
                      title="Empezar a concentrarse"
                    >
                      ⏱️
                    </button>
                  </div>
                </div>
              ))}

              {col.tasks.length === 0 && (
                <div style={styles.emptyColText}>Arrastra aquí tareas</div>
              )}
            </div>

            {/* Add Task Area */}
            {activeNewTaskCol === col.id ? (
              <div style={styles.taskForm} className="animate-fade-in">
                <input
                  type="text"
                  className="glass-input"
                  style={styles.taskFormInput}
                  placeholder="Título de la tarea..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  autoFocus
                  required
                />
                <textarea
                  className="glass-input"
                  style={{ ...styles.taskFormInput, height: '60px', resize: 'none' }}
                  placeholder="Descripción (opcional)..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                />
                <div style={styles.taskFormRow}>
                  <select
                    className="glass-input"
                    style={styles.taskFormSelect}
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                  <input
                    type="date"
                    className="glass-input"
                    style={styles.taskFormSelect}
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                  />
                </div>
                <div style={styles.taskFormActions}>
                  <button className="glass-button" onClick={() => handleAddTask(col.id)}>
                    Guardar
                  </button>
                  <button
                    className="glass-button glass-button-secondary"
                    onClick={() => setActiveNewTaskCol(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                style={styles.addTaskTrigger}
                onClick={() => setActiveNewTaskCol(col.id)}
              >
                ＋ Añadir Tarea
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Task detailed View / Edit Modal */}
      {selectedTask && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTask(null)}>
          <div
            className="glass-panel animate-fade-in"
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <h3>Editar Tarea</h3>
              <button style={styles.modalClose} onClick={() => setSelectedTask(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTaskDetails} style={styles.modalForm}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Título</label>
                <input
                  type="text"
                  className="glass-input"
                  value={selectedTask.title}
                  onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Descripción</label>
                <textarea
                  className="glass-input"
                  style={{ height: '120px', resize: 'vertical' }}
                  value={selectedTask.description || ''}
                  onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                />
              </div>

              <div style={styles.modalRow}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>Prioridad</label>
                  <select
                    className="glass-input"
                    value={selectedTask.priority}
                    onChange={(e) => setSelectedTask({ ...selectedTask, priority: e.target.value })}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>

                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>Fecha Límite</label>
                  <input
                    type="date"
                    className="glass-input"
                    value={selectedTask.due_date ? selectedTask.due_date.split('T')[0] : ''}
                    onChange={(e) => setSelectedTask({ 
                      ...selectedTask, 
                      due_date: e.target.value ? new Date(e.target.value).toISOString() : undefined 
                    })}
                  />
                </div>
              </div>

              {selectedTask.total_focus_time > 0 && (
                <div style={styles.focusAccumulated}>
                  ⏱️ <strong>Tiempo enfocado acumulado:</strong> {formatFocusTime(selectedTask.total_focus_time)}
                </div>
              )}

              <div style={styles.modalActions}>
                <button type="submit" className="glass-button">
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  className="glass-button glass-button-danger"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                >
                  Eliminar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    padding: '40px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: 300,
  },
  addColForm: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    maxWidth: '450px',
  },
  workspace: {
    flex: 1,
    display: 'flex',
    gap: '24px',
    overflowX: 'auto',
    alignItems: 'flex-start',
    paddingBottom: '16px',
  },
  column: {
    width: '320px',
    minWidth: '320px',
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
  taskCard: {
    padding: '16px',
    cursor: 'pointer',
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  priorityBadge: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#ffffff',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  focusTimeBadge: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '6px',
    lineHeight: 1.4,
  },
  taskDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '12px',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  taskFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueDate: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  focusTaskBtn: {
    padding: '4px 8px',
    fontSize: '12px',
    boxShadow: 'none',
  },
  emptyColText: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
    padding: '24px 0',
    border: '1px dashed rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  addTaskTrigger: {
    width: '100%',
    background: 'transparent',
    border: '1px dashed rgba(255, 255, 255, 0.08)',
    color: 'var(--text-secondary)',
    padding: '10px',
    borderRadius: 'var(--border-radius-sm)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'var(--transition-smooth)',
  },
  taskForm: {
    background: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.05)',
    padding: '12px',
    borderRadius: 'var(--border-radius-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  taskFormInput: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
  },
  taskFormRow: {
    display: 'flex',
    gap: '8px',
  },
  taskFormSelect: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '11px',
  },
  taskFormActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  centered: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: 'var(--text-secondary)',
  },
  centeredError: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: 'var(--accent-danger)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    padding: '30px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  modalClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '16px',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  modalRow: {
    display: 'flex',
    gap: '16px',
  },
  focusAccumulated: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--glass-border)',
    padding: '12px 16px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '10px',
  },
};

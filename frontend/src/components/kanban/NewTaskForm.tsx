import React from 'react';
import { api } from '../../services/api';
import { ContactPicker, type Contact } from '../ContactPicker';

interface NewTaskFormProps {
  columnId: number;
  activeNewTaskCol: number | null;
  setActiveNewTaskCol: (columnId: number | null) => void;
  newTaskTitle: string;
  setNewTaskTitle: (title: string) => void;
  newTaskDesc: string;
  setNewTaskDesc: (desc: string) => void;
  newTaskPriority: string;
  setNewTaskPriority: (priority: string) => void;
  newTaskDueDate: string;
  setNewTaskDueDate: (date: string) => void;
  newTaskAssigneeIds: number[];
  setNewTaskAssigneeIds: (ids: number[]) => void;
  allContacts: Contact[];
  fetchBoardDetails: () => Promise<void>;
}

/** Inline new-task form for a column, or the trigger that opens it. The
 * form state lives in KanbanBoard so only one column has it open. */
export const NewTaskForm: React.FC<NewTaskFormProps> = ({
  columnId,
  activeNewTaskCol,
  setActiveNewTaskCol,
  newTaskTitle,
  setNewTaskTitle,
  newTaskDesc,
  setNewTaskDesc,
  newTaskPriority,
  setNewTaskPriority,
  newTaskDueDate,
  setNewTaskDueDate,
  newTaskAssigneeIds,
  setNewTaskAssigneeIds,
  allContacts,
  fetchBoardDetails,
}) => {
  const handleAddTask = async (columnId: number) => {
    if (!newTaskTitle.trim()) return;
    try {
      await api.createTask(columnId, {
        title: newTaskTitle,
        description: newTaskDesc || undefined,
        priority: newTaskPriority,
        due_date: newTaskDueDate || undefined,
        // Explicit assignment overrides the backend's default-to-self.
        assignee_ids: newTaskAssigneeIds,
      });
      // Clear forms
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskPriority('medium');
      setNewTaskDueDate('');
      setNewTaskAssigneeIds([]);
      setActiveNewTaskCol(null);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Open the inline new-task form on a column, pre-selecting the 'Yo
  // mismo' contact so the assignee picker mirrors what the backend would
  // default to anyway.
  const openNewTaskForm = (columnId: number) => {
    const selfId = allContacts.find((c) => c.is_self)?.id;
    setNewTaskAssigneeIds(selfId ? [selfId] : []);
    setActiveNewTaskCol(columnId);
  };

  return activeNewTaskCol === columnId ? (
    <div style={styles.taskForm} className="animate-fade-in">
      <input
        type="text"
        className="glass-input"
        style={styles.taskFormInput}
        placeholder="Título de la tarea..."
        value={newTaskTitle}
        onChange={(e) => setNewTaskTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleAddTask(columnId);
          }
        }}
        autoFocus
        required
      />
      <textarea
        className="glass-input"
        style={{ ...styles.taskFormInput, height: '60px', resize: 'none' }}
        placeholder="Descripción (opcional)..."
        value={newTaskDesc}
        onChange={(e) => setNewTaskDesc(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleAddTask(columnId);
          }
        }}
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
      <div>
        <label style={styles.newTaskLabel}>Asignado a</label>
        <ContactPicker
          multi
          contacts={allContacts}
          value={newTaskAssigneeIds}
          onChange={(ids) => setNewTaskAssigneeIds(ids)}
          placeholder="Nadie"
        />
      </div>
      <div style={styles.taskFormActions}>
        <button className="glass-button" onClick={() => handleAddTask(columnId)}>
          Guardar
        </button>
        <button
          className="glass-button glass-button-secondary"
          onClick={() => {
            setActiveNewTaskCol(null);
            setNewTaskAssigneeIds([]);
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : (
    <button
      style={styles.addTaskTrigger}
      onClick={() => openNewTaskForm(columnId)}
    >
      ＋ Añadir Tarea
    </button>
  );
};

const styles: Record<string, React.CSSProperties> = {
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
  newTaskLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
};

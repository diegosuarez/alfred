import React from 'react';
import { api } from '../../services/api';
import type { Tag, Task } from './types';
import { getPriorityColor } from './utils';
import { styles } from './taskModalStyles';

interface ParentPickerSectionProps {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  allBoardTasks: () => Task[];
  ineligibleParentIds: (taskId: number) => Set<number>;
  nestTaskUnder: (sourceId: number, targetId: number) => Promise<void>;
  refreshSelectedTask: (taskId: number) => Promise<void>;
  fetchBoardDetails: () => Promise<void>;
}

export const ParentPickerSection: React.FC<ParentPickerSectionProps> = ({
  selectedTask,
  setSelectedTask,
  allBoardTasks,
  ineligibleParentIds,
  nestTaskUnder,
  refreshSelectedTask,
  fetchBoardDetails,
}) => {
  const detachFromParent = async (taskId: number) => {
    try {
      // 0 is the backend's "detach" sentinel for parent_task_id.
      await api.updateTask(taskId, { parent_task_id: 0 });
      if (selectedTask?.id === taskId) {
        await refreshSelectedTask(taskId);
      }
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>Subtarea de</label>
      {(() => {
        const parent =
          selectedTask.parent_task_id != null
            ? allBoardTasks().find(
                (t) => t.id === selectedTask.parent_task_id,
              )
            : null;
        const blocked = ineligibleParentIds(selectedTask.id);
        const candidates = allBoardTasks().filter(
          (t) => !blocked.has(t.id),
        );
        if (parent) {
          return (
            <div style={styles.parentRow}>
              <button
                type="button"
                style={styles.parentLink}
                onClick={() => setSelectedTask(parent)}
                title="Abrir la tarea padre"
              >
                ↑ {parent.title}
              </button>
              <button
                type="button"
                style={styles.parentDetach}
                onClick={() => detachFromParent(selectedTask.id)}
                title="Desligar de la tarea padre"
              >
                ✕
              </button>
            </div>
          );
        }
        return (
          <select
            className="glass-input"
            value=""
            onChange={(e) => {
              const id = parseInt(e.target.value);
              if (id) nestTaskUnder(selectedTask.id, id);
            }}
          >
            <option value="">Ninguna — convertir en subtarea de…</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        );
      })()}
    </div>
  );
};

interface SubtasksSectionProps {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  newSubtaskTitle: string;
  setNewSubtaskTitle: (title: string) => void;
  refreshSelectedTask: (taskId: number) => Promise<void>;
  fetchBoardDetails: () => Promise<void>;
}

export const SubtasksSection: React.FC<SubtasksSectionProps> = ({
  selectedTask,
  setSelectedTask,
  newSubtaskTitle,
  setNewSubtaskTitle,
  refreshSelectedTask,
  fetchBoardDetails,
}) => {
  const handleAddSubtask = async () => {
    if (!selectedTask || !newSubtaskTitle.trim()) return;
    try {
      await api.createSubtask(selectedTask.id, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      await refreshSelectedTask(selectedTask.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleSubtask = async (child: Task) => {
    try {
      await api.updateTask(child.id, { completed: !child.completed });
      const parentId = child.parent_task_id ?? null;
      if (selectedTask && parentId === selectedTask.id) {
        await refreshSelectedTask(selectedTask.id);
      } else {
        await fetchBoardDetails();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSubtask = async (childId: number) => {
    if (!selectedTask) return;
    if (!confirm('¿Borrar esta subtarea?')) return;
    try {
      await api.deleteTask(childId);
      await refreshSelectedTask(selectedTask.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>
        Subtareas{' '}
        {(selectedTask.children ?? []).length > 0 && (
          <span style={styles.subtaskLabelCount}>
            ({(selectedTask.children ?? []).filter((s) => s.completed).length}
            /{(selectedTask.children ?? []).length})
          </span>
        )}
      </label>
      {(selectedTask.children ?? []).length > 0 && (
        <ul style={styles.subtaskList}>
          {(selectedTask.children ?? []).map((sub) => (
            <li key={sub.id} style={styles.subtaskItem}>
              <input
                type="checkbox"
                checked={sub.completed}
                onChange={() => handleToggleSubtask(sub)}
                style={styles.subtaskCheckbox}
              />
              <span
                style={{
                  ...styles.subtaskTitle,
                  ...(sub.completed ? styles.subtaskTitleDone : {}),
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedTask(sub)}
                title="Abrir subtarea como tarea completa"
              >
                <span
                  style={{
                    ...styles.subtaskPriorityDot,
                    backgroundColor: getPriorityColor(sub.priority),
                  }}
                />
                {sub.title}
                {sub.due_date && (
                  <span style={styles.subtaskDueDate}>
                    · 📅 {new Date(sub.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {sub.tags.length > 0 && (
                  <span style={styles.subtaskTagHint}>
                    · {sub.tags.map((t) => t.name).join(', ')}
                  </span>
                )}
              </span>
              <button
                type="button"
                style={styles.subtaskDelete}
                onClick={() => handleDeleteSubtask(sub.id)}
                title="Eliminar subtarea"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        style={styles.subtaskForm}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="glass-input"
          style={styles.subtaskInput}
          placeholder="Añadir subtarea..."
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddSubtask();
            }
          }}
        />
        <button
          type="button"
          className="glass-button-secondary"
          style={styles.subtaskAddBtn}
          onClick={handleAddSubtask}
        >
          Añadir
        </button>
      </div>
    </div>
  );
};

interface TagsSectionProps {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  allTags: Tag[];
  newTagName: string;
  setNewTagName: (name: string) => void;
  fetchTags: () => Promise<void>;
  fetchBoardDetails: () => Promise<void>;
}

export const TagsSection: React.FC<TagsSectionProps> = ({
  selectedTask,
  setSelectedTask,
  allTags,
  newTagName,
  setNewTagName,
  fetchTags,
  fetchBoardDetails,
}) => {
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await api.createTag(newTagName.trim());
      setNewTagName('');
      await fetchTags();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleTaskTag = async (task: Task, tagId: number) => {
    const has = task.tags.some((t) => t.id === tagId);
    const nextIds = has
      ? task.tags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...task.tags.map((t) => t.id), tagId];
    try {
      const updated = await api.updateTask(task.id, { tag_ids: nextIds });
      // Sync local state so the modal + card reflect immediately.
      setSelectedTask(updated);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>Etiquetas</label>
      <div style={styles.tagPickerRow}>
        {allTags.length === 0 ? (
          <span style={styles.tagPickerEmpty}>
            Aún no tienes etiquetas. Crea una abajo.
          </span>
        ) : (
          allTags.map((tag) => {
            const active = selectedTask.tags.some((t) => t.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className="glass-button-secondary"
                style={{
                  ...styles.tagPickerChip,
                  ...(active ? styles.tagPickerChipActive : {}),
                  ...(tag.color && !active
                    ? { borderColor: tag.color }
                    : {}),
                }}
                onClick={() => handleToggleTaskTag(selectedTask, tag.id)}
              >
                {tag.name}
              </button>
            );
          })
        )}
      </div>
      <div
        style={styles.tagCreateForm}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="glass-input"
          style={styles.tagCreateInput}
          placeholder="Crear nueva etiqueta..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreateTag();
            }
          }}
        />
        <button
          type="button"
          className="glass-button-secondary"
          style={styles.tagCreateBtn}
          onClick={handleCreateTag}
        >
          Añadir
        </button>
      </div>
    </div>
  );
};

interface RemindersSectionProps {
  selectedTask: Task;
  refreshSelectedTask: (taskId: number) => Promise<void>;
  onRemindersChanged?: () => void;
  setShowReminderPicker: (show: boolean) => void;
}

export const RemindersSection: React.FC<RemindersSectionProps> = ({
  selectedTask,
  refreshSelectedTask,
  onRemindersChanged,
  setShowReminderPicker,
}) => {
  const handleDeleteReminder = async (reminderId: number) => {
    if (!selectedTask) return;
    try {
      await api.deleteReminder(reminderId);
      await refreshSelectedTask(selectedTask.id);
      onRemindersChanged?.();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.inputGroup}>
      <label style={styles.label}>
        Recordatorios{' '}
        {(selectedTask.reminders ?? []).length > 0 && (
          <span style={styles.subtaskLabelCount}>
            ({(selectedTask.reminders ?? []).length})
          </span>
        )}
      </label>
      {(selectedTask.reminders ?? []).length > 0 && (
        <ul style={styles.reminderList}>
          {(selectedTask.reminders ?? []).map((r) => {
            const when = new Date(r.remind_at);
            const past = when.getTime() < Date.now();
            return (
              <li key={r.id} style={styles.reminderItem}>
                <span style={styles.reminderBell}>🔔</span>
                <span
                  style={{
                    ...styles.reminderWhen,
                    ...(past ? styles.reminderPast : {}),
                  }}
                >
                  {when.toLocaleString('es-ES', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {past && (
                    <span style={styles.reminderPastTag}>
                      pendiente
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  style={styles.subtaskDelete}
                  onClick={() => handleDeleteReminder(r.id)}
                  title="Eliminar recordatorio"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="glass-button-secondary"
        style={styles.addReminderBtn}
        onClick={() => setShowReminderPicker(true)}
      >
        ＋ Añadir recordatorio
      </button>
    </div>
  );
};

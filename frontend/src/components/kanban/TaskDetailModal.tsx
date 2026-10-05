import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ContactPicker, type Contact } from '../ContactPicker';
import { AttachmentsSection } from '../AttachmentsSection';
import { MarkdownView } from '../MarkdownView';
import type { BoardSummary, Column, Tag, Task } from './types';
import { formatFocusTime } from './utils';
import {
  ParentPickerSection,
  RemindersSection,
  SubtasksSection,
  TagsSection,
} from './TaskDetailSections';
import { styles } from './taskModalStyles';

interface TaskDetailModalProps {
  selectedTask: Task;
  setSelectedTask: (task: Task | null) => void;
  allTags: Tag[];
  allContacts: Contact[];
  moveCandidates: BoardSummary[];
  allBoardTasks: () => Task[];
  ineligibleParentIds: (taskId: number) => Set<number>;
  nestTaskUnder: (sourceId: number, targetId: number) => Promise<void>;
  refreshSelectedTask: (taskId: number) => Promise<void>;
  fetchBoardDetails: () => Promise<void>;
  fetchTags: () => Promise<void>;
  onRemindersChanged?: () => void;
  setShowReminderPicker: (show: boolean) => void;
  newSubtaskTitle: string;
  setNewSubtaskTitle: (title: string) => void;
  newTagName: string;
  setNewTagName: (name: string) => void;
}

/** Task detail view / edit modal. Every field auto-saves. */
export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  selectedTask,
  setSelectedTask,
  allTags,
  allContacts,
  moveCandidates,
  allBoardTasks,
  ineligibleParentIds,
  nestTaskUnder,
  refreshSelectedTask,
  fetchBoardDetails,
  fetchTags,
  onRemindersChanged,
  setShowReminderPicker,
  newSubtaskTitle,
  setNewSubtaskTitle,
  newTagName,
  setNewTagName,
}) => {
  // The description renders as markdown by default and flips to a
  // textarea only when the user clicks "edit", to keep the modal calm.
  const [editingDescription, setEditingDescription] = useState(false);
  // Drop the description-editing flag whenever the modal changes target
  // so the new task always opens in the rendered (read) state.
  useEffect(() => {
    setEditingDescription(false);
  }, [selectedTask?.id]);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveTargetBoardId, setMoveTargetBoardId] = useState<number | null>(null);
  const [moveTargetColumns, setMoveTargetColumns] = useState<Column[]>([]);
  const [moveTargetColumnId, setMoveTargetColumnId] = useState<number | null>(null);

  /** Auto-save a single field of the task currently open in the modal.
   * Compares against the LAST COMMITTED value (snapshotted when the
   * modal opens and refreshed after each successful save), not
   * selectedTask — which the input's onChange has already mutated. */
  const lastCommittedRef = React.useRef<Record<string, any> | null>(null);
  const lastCommittedTaskIdRef = React.useRef<number | null>(null);
  const commitField = async (
    field: 'title' | 'description' | 'priority' | 'due_date',
    value: string | null,
  ) => {
    if (!selectedTask) return;
    const committed = lastCommittedRef.current ?? {};
    const previous = committed[field];
    if (previous === value || (previous == null && value == null)) return;
    try {
      const updated = await api.updateTask(selectedTask.id, { [field]: value } as any);
      setSelectedTask(updated);
      lastCommittedRef.current = { ...committed, [field]: value };
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Snapshot the committed values whenever the modal opens with a new
  // task. Without this the optimistic onChange mutations would be read
  // as "current value" and commitField would short-circuit on every blur.
  useEffect(() => {
    if (!selectedTask) {
      lastCommittedRef.current = null;
      lastCommittedTaskIdRef.current = null;
      return;
    }
    if (lastCommittedTaskIdRef.current !== selectedTask.id) {
      lastCommittedRef.current = {
        title: selectedTask.title,
        description: selectedTask.description,
        priority: selectedTask.priority,
        due_date: selectedTask.due_date,
      };
      lastCommittedTaskIdRef.current = selectedTask.id;
    }
  }, [selectedTask?.id]);

  const handleRequesterChange = async (contactId: number | null) => {
    if (!selectedTask) return;
    try {
      // The backend uses 0 as the "detach" sentinel for requester_id.
      const updated = await api.updateTask(selectedTask.id, {
        requester_id: contactId === null ? 0 : contactId,
      });
      setSelectedTask(updated);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssigneesChange = async (contactIds: number[]) => {
    if (!selectedTask) return;
    try {
      const updated = await api.updateTask(selectedTask.id, {
        assignee_ids: contactIds,
      });
      setSelectedTask(updated);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePickMoveBoard = async (id: number | null) => {
    setMoveTargetBoardId(id);
    setMoveTargetColumnId(null);
    setMoveTargetColumns([]);
    if (id === null) return;
    try {
      const detail = await api.getBoardDetail(id);
      setMoveTargetColumns(detail.columns || []);
      if (detail.columns?.length) {
        setMoveTargetColumnId(detail.columns[0].id);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMoveTask = async () => {
    if (!selectedTask || moveTargetBoardId === null || moveTargetColumnId === null)
      return;
    try {
      await api.moveTaskToBoard(
        selectedTask.id,
        moveTargetBoardId,
        moveTargetColumnId,
      );
      setSelectedTask(null);
      setShowMovePicker(false);
      setMoveTargetBoardId(null);
      setMoveTargetColumnId(null);
      setMoveTargetColumns([]);
      // Stay on the current board — refresh so the moved card disappears.
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Reset the move-picker every time the modal opens on a fresh task.
  useEffect(() => {
    setShowMovePicker(false);
    setMoveTargetBoardId(null);
    setMoveTargetColumnId(null);
    setMoveTargetColumns([]);
  }, [selectedTask?.id]);

  const handleArchiveTask = async () => {
    if (!selectedTask) return;
    try {
      await api.updateTask(selectedTask.id, { archived: true });
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

  return (
    <div style={styles.modalOverlay} onClick={() => setSelectedTask(null)}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <div>
            <h3>Editar Tarea</h3>
            <div style={styles.modalCreatedHint}>
              Creada el{' '}
              {new Date(selectedTask.created_at).toLocaleString('es-ES', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
          <button style={styles.modalClose} onClick={() => setSelectedTask(null)}>
            ✕
          </button>
        </div>

        <div style={styles.modalForm}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Título</label>
            <input
              type="text"
              className="glass-input"
              value={selectedTask.title}
              onChange={(e) =>
                setSelectedTask({ ...selectedTask, title: e.target.value })
              }
              onBlur={(e) => commitField('title', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                  if (e.ctrlKey || e.metaKey) setSelectedTask(null);
                }
              }}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Descripción{' '}
              <span style={styles.markdownHint}>
                (soporta Markdown)
              </span>
            </label>
            {editingDescription ? (
              <textarea
                className="glass-input"
                style={{ height: '180px', resize: 'vertical' }}
                value={selectedTask.description || ''}
                autoFocus
                onChange={(e) =>
                  setSelectedTask({ ...selectedTask, description: e.target.value })
                }
                onBlur={(e) => {
                  commitField('description', e.target.value);
                  setEditingDescription(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                    setSelectedTask(null);
                  }
                }}
              />
            ) : (
              <div
                style={styles.descriptionView}
                onClick={() => setEditingDescription(true)}
                title="Click para editar"
              >
                {selectedTask.description ? (
                  <MarkdownView source={selectedTask.description} />
                ) : (
                  <span style={styles.descriptionEmpty}>
                    Sin descripción — click para añadir
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={styles.modalRow}>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.label}>Prioridad</label>
              <select
                className="glass-input"
                value={selectedTask.priority}
                onChange={(e) => {
                  setSelectedTask({ ...selectedTask, priority: e.target.value });
                  commitField('priority', e.target.value);
                }}
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
                onChange={(e) => {
                  const iso = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null;
                  setSelectedTask({
                    ...selectedTask,
                    due_date: iso ?? undefined,
                  });
                  commitField('due_date', iso);
                }}
              />
            </div>
          </div>

          <div style={styles.modalRow}>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.label}>Encargada por</label>
              <ContactPicker
                contacts={allContacts}
                value={selectedTask.requester ? selectedTask.requester.id : null}
                onChange={handleRequesterChange}
                placeholder="Nadie en particular"
              />
            </div>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.label}>Asignado a</label>
              <ContactPicker
                multi
                contacts={allContacts}
                value={selectedTask.assignees.map((c) => c.id)}
                onChange={handleAssigneesChange}
                placeholder="Nadie"
              />
            </div>
          </div>

          {/* Attachments — drop zone, paste handler, listing. */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Adjuntos</label>
            <AttachmentsSection
              taskId={selectedTask.id}
              attachments={selectedTask.attachments ?? []}
              onChanged={async () => {
                await refreshSelectedTask(selectedTask.id);
                fetchBoardDetails();
              }}
            />
          </div>

          {/* Parent picker — lets the user nest this task under an
              existing one (or detach it). Excludes self + descendants
              to avoid cycles. */}
          <ParentPickerSection
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            allBoardTasks={allBoardTasks}
            ineligibleParentIds={ineligibleParentIds}
            nestTaskUnder={nestTaskUnder}
            refreshSelectedTask={refreshSelectedTask}
            fetchBoardDetails={fetchBoardDetails}
          />

          <SubtasksSection
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            newSubtaskTitle={newSubtaskTitle}
            setNewSubtaskTitle={setNewSubtaskTitle}
            refreshSelectedTask={refreshSelectedTask}
            fetchBoardDetails={fetchBoardDetails}
          />

          <TagsSection
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            allTags={allTags}
            newTagName={newTagName}
            setNewTagName={setNewTagName}
            fetchTags={fetchTags}
            fetchBoardDetails={fetchBoardDetails}
          />

          <RemindersSection
            selectedTask={selectedTask}
            refreshSelectedTask={refreshSelectedTask}
            onRemindersChanged={onRemindersChanged}
            setShowReminderPicker={setShowReminderPicker}
          />

          {selectedTask.total_focus_time > 0 && (
            <div style={styles.focusAccumulated}>
              ⏱️ <strong>Tiempo enfocado acumulado:</strong> {formatFocusTime(selectedTask.total_focus_time)}
            </div>
          )}

          {showMovePicker && (
            <div style={styles.movePickerBox} className="animate-fade-in">
              <label style={styles.label}>Mover a otro tablero</label>
              {moveCandidates.length === 0 ? (
                <span style={styles.movePickerEmpty}>
                  No hay otros tableros en este contexto.
                </span>
              ) : (
                <div style={styles.movePickerRow}>
                  <select
                    className="glass-input"
                    style={styles.movePickerSelect}
                    value={moveTargetBoardId ?? ''}
                    onChange={(e) =>
                      handlePickMoveBoard(
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">Tablero...</option>
                    {moveCandidates.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="glass-input"
                    style={styles.movePickerSelect}
                    value={moveTargetColumnId ?? ''}
                    disabled={moveTargetColumns.length === 0}
                    onChange={(e) =>
                      setMoveTargetColumnId(
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">Columna...</option>
                    {moveTargetColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="glass-button"
                    style={styles.movePickerSubmit}
                    onClick={handleMoveTask}
                    disabled={
                      moveTargetBoardId === null ||
                      moveTargetColumnId === null
                    }
                  >
                    Mover
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={styles.modalActions}>
            <span style={styles.autosaveHint}>Los cambios se guardan automáticamente</span>
            <div style={styles.modalDangerGroup}>
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={() => setShowMovePicker((s) => !s)}
                title="Mover a otro tablero"
              >
                {showMovePicker ? '✕ Cancelar mover' : '📂 Mover'}
              </button>
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={handleArchiveTask}
                title="Archivar tarea"
              >
                📦 Archivar
              </button>
              <button
                type="button"
                className="glass-button glass-button-danger"
                onClick={() => handleDeleteTask(selectedTask.id)}
              >
                Eliminar Tarea
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Avatar } from './Avatar';
import { ContactPicker, type Contact } from './ContactPicker';
import { ArchivedTasksModal } from './ArchivedTasksModal';
import { ReminderPicker } from './ReminderPicker';
import { FilterModal, EMPTY_FILTERS, type Filters } from './FilterModal';

interface Tag {
  id: number;
  name: string;
  color?: string | null;
}

interface Reminder {
  id: number;
  task_id: number;
  remind_at: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  due_date?: string;
  position: number;
  column_id: number;
  board_id: number;
  parent_task_id?: number | null;
  completed: boolean;
  created_at: string;
  total_focus_time: number;
  tags: Tag[];
  requester?: Contact | null;
  assignees: Contact[];
  reminders: Reminder[];
  children: Task[];
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
  context_id?: number | null;
  columns: Column[];
}

interface BoardSummary {
  id: number;
  name: string;
  context_id?: number | null;
}

interface KanbanBoardProps {
  boardId: number;
  onStartFocus: (task: { id: number; title: string }) => void;
  onRemindersChanged?: () => void;
  /** When App.tsx wants the modal to open a specific task (e.g. from
   * clicking a fired reminder), it bumps this id. */
  externalTaskFocus?: number | null;
  /** Every board the user owns, so the task modal can offer a
   * "move to another board" picker filtered by the current context. */
  allBoards?: BoardSummary[];
  onTaskMovedToBoard?: (newBoardId: number) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  onStartFocus,
  onRemindersChanged,
  externalTaskFocus,
  allBoards = [],
  onTaskMovedToBoard,
}) => {
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

  // Tag state (user-scoped, loaded once per board mount). The filter is
  // an inclusive OR — a task with any selected tag stays visible.
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [archiveModalColumn, setArchiveModalColumn] = useState<{ id: number; name: string } | null>(null);
  const [columnMenuOpenId, setColumnMenuOpenId] = useState<number | null>(null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveTargetBoardId, setMoveTargetBoardId] = useState<number | null>(null);
  const [moveTargetColumns, setMoveTargetColumns] = useState<Column[]>([]);
  const [moveTargetColumnId, setMoveTargetColumnId] = useState<number | null>(null);

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

  const fetchTags = async () => {
    try {
      const data = await api.getTags();
      setAllTags(data);
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  };

  const fetchContacts = async (contextId?: number | null) => {
    try {
      const data = await api.getContacts(contextId ?? undefined);
      setAllContacts(data);
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  };

  useEffect(() => {
    fetchBoardDetails();
    fetchTags();
  }, [boardId]);

  // Re-scope the contact picker to this board's context whenever the
  // board (re)loads. Contacts are partitioned by Google account, so
  // the same picker shows different rows on Trabajo vs Personal.
  useEffect(() => {
    if (board) {
      fetchContacts(board.context_id ?? null);
    }
  }, [board?.context_id]);

  // Close any open column kebab menu on any document click that isn't
  // inside the menu itself.
  useEffect(() => {
    if (columnMenuOpenId === null) return;
    const close = () => setColumnMenuOpenId(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [columnMenuOpenId]);

  // Apply all current filters to a task. Title query is case-insensitive
  // substring; tag/assignee multi-filters are OR within, AND across
  // categories.
  const passesFilters = (task: Task): boolean => {
    const q = filters.query.trim().toLowerCase();
    if (q && !(task.title.toLowerCase().includes(q) || (task.description ?? '').toLowerCase().includes(q))) {
      return false;
    }
    if (filters.tagIds.length > 0 && !task.tags.some((t) => filters.tagIds.includes(t.id))) {
      return false;
    }
    if (filters.requesterId !== null && task.requester?.id !== filters.requesterId) {
      return false;
    }
    if (
      filters.assigneeIds.length > 0 &&
      !task.assignees.some((a) => filters.assigneeIds.includes(a.id))
    ) {
      return false;
    }
    if (filters.createdFrom || filters.createdTo) {
      const created = new Date(task.created_at).getTime();
      if (filters.createdFrom && created < new Date(filters.createdFrom + 'T00:00:00').getTime()) {
        return false;
      }
      if (filters.createdTo && created > new Date(filters.createdTo + 'T23:59:59').getTime()) {
        return false;
      }
    }
    if (filters.dueFrom || filters.dueTo) {
      if (!task.due_date) return false;
      const due = new Date(task.due_date).getTime();
      if (filters.dueFrom && due < new Date(filters.dueFrom + 'T00:00:00').getTime()) {
        return false;
      }
      if (filters.dueTo && due > new Date(filters.dueTo + 'T23:59:59').getTime()) {
        return false;
      }
    }
    return true;
  };

  // Human-readable list of active filter chips. Each chip carries the
  // setter that removes it from the live filter set.
  const activeFilterChips = (): { key: string; label: string; clear: () => void }[] => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    for (const tid of filters.tagIds) {
      const t = allTags.find((x) => x.id === tid);
      chips.push({
        key: `tag-${tid}`,
        label: `etiqueta: ${t?.name ?? tid}`,
        clear: () =>
          setFilters((f) => ({ ...f, tagIds: f.tagIds.filter((x) => x !== tid) })),
      });
    }
    if (filters.requesterId !== null) {
      const c = allContacts.find((x) => x.id === filters.requesterId);
      chips.push({
        key: 'requester',
        label: `encargada por: ${c?.name ?? filters.requesterId}`,
        clear: () => setFilters((f) => ({ ...f, requesterId: null })),
      });
    }
    for (const aid of filters.assigneeIds) {
      const c = allContacts.find((x) => x.id === aid);
      chips.push({
        key: `assignee-${aid}`,
        label: `delegada en: ${c?.name ?? aid}`,
        clear: () =>
          setFilters((f) => ({
            ...f,
            assigneeIds: f.assigneeIds.filter((x) => x !== aid),
          })),
      });
    }
    if (filters.createdFrom) {
      chips.push({
        key: 'createdFrom',
        label: `creada ≥ ${filters.createdFrom}`,
        clear: () => setFilters((f) => ({ ...f, createdFrom: null })),
      });
    }
    if (filters.createdTo) {
      chips.push({
        key: 'createdTo',
        label: `creada ≤ ${filters.createdTo}`,
        clear: () => setFilters((f) => ({ ...f, createdTo: null })),
      });
    }
    if (filters.dueFrom) {
      chips.push({
        key: 'dueFrom',
        label: `vence ≥ ${filters.dueFrom}`,
        clear: () => setFilters((f) => ({ ...f, dueFrom: null })),
      });
    }
    if (filters.dueTo) {
      chips.push({
        key: 'dueTo',
        label: `vence ≤ ${filters.dueTo}`,
        clear: () => setFilters((f) => ({ ...f, dueTo: null })),
      });
    }
    return chips;
  };

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

  const refreshSelectedTask = async (taskId: number) => {
    try {
      const data = await api.getBoardDetail(boardId);
      setBoard(data);
      for (const col of data.columns) {
        const found = col.tasks.find((t: Task) => t.id === taskId);
        if (found) {
          setSelectedTask(found);
          return;
        }
      }
    } catch (err) {
      console.error('Error refreshing task:', err);
    }
  };

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

  /** Auto-save a single field of the task currently open in the modal.
   * Skips the network round-trip if the value didn't actually change. */
  const commitField = async (
    field: 'title' | 'description' | 'priority' | 'due_date',
    value: string | null,
  ) => {
    if (!selectedTask) return;
    const previous = (selectedTask as any)[field];
    if (previous === value || (previous == null && value == null)) return;
    try {
      const updated = await api.updateTask(selectedTask.id, { [field]: value } as any);
      setSelectedTask(updated);
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

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

  // Boards available as a move destination: same context as current,
  // excluding the current board.
  const moveCandidates = (() => {
    if (!board) return [] as BoardSummary[];
    return allBoards.filter(
      (b) => b.id !== board.id && b.context_id === board.context_id,
    );
  })();

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
      const targetId = moveTargetBoardId;
      setSelectedTask(null);
      setShowMovePicker(false);
      setMoveTargetBoardId(null);
      setMoveTargetColumnId(null);
      setMoveTargetColumns([]);
      if (onTaskMovedToBoard) onTaskMovedToBoard(targetId);
      else fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateReminder = async (remindAtIso: string) => {
    if (!selectedTask) return;
    await api.createReminder(selectedTask.id, remindAtIso);
    await refreshSelectedTask(selectedTask.id);
    onRemindersChanged?.();
  };

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

  // Reset the move-picker every time the modal opens on a fresh task.
  useEffect(() => {
    setShowMovePicker(false);
    setMoveTargetBoardId(null);
    setMoveTargetColumnId(null);
    setMoveTargetColumns([]);
  }, [selectedTask?.id]);

  // App may ask us to open a specific task (e.g. from a reminder click).
  useEffect(() => {
    if (externalTaskFocus == null || !board) return;
    for (const col of board.columns) {
      for (const t of col.tasks) {
        if (t.id === externalTaskFocus) {
          setSelectedTask(t);
          return;
        }
        const child = t.children?.find((c) => c.id === externalTaskFocus);
        if (child) {
          setSelectedTask(child as Task);
          return;
        }
      }
    }
  }, [externalTaskFocus, board]);

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

  /** Render a single task card. `dropIndex` is null for non-draggable
   * subtask cards (the column-level drop handler does its own indexing). */
  const renderCard = (
    task: Task,
    opts: {
      columnId: number;
      dropIndex: number | null;
      isChild?: boolean;
    },
  ) => {
    const draggable = opts.dropIndex !== null;
    // Priority drives the card border colour. Medium stays default.
    const priorityBorder =
      task.priority === 'high'
        ? 'rgba(239, 68, 68, 0.65)'
        : task.priority === 'low'
        ? 'rgba(59, 130, 246, 0.55)'
        : undefined;
    return (
      <div
        className="glass-card"
        style={{
          ...styles.taskCard,
          ...(opts.isChild ? styles.childTaskCard : {}),
          ...(task.completed ? styles.completedTaskCard : {}),
          ...(priorityBorder ? { borderColor: priorityBorder } : {}),
        }}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, task.id) : undefined}
        onDragOver={draggable ? handleDragOver : undefined}
        onDrop={
          draggable
            ? (e) => handleTaskDrop(e, opts.columnId, opts.dropIndex as number)
            : undefined
        }
        onClick={() => setSelectedTask(task)}
        title={`Prioridad: ${getPriorityLabel(task.priority)}`}
      >
        <div style={styles.taskCardHeader}>
          {/* Tags take the header slot the priority badge used to occupy. */}
          {(task.tags ?? []).length > 0 ? (
            <div style={styles.headerTags}>
              {(task.tags ?? []).map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    ...styles.tagChip,
                    ...(tag.color
                      ? { borderColor: tag.color, color: tag.color }
                      : {}),
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div style={styles.headerBadges}>
            {task.total_focus_time > 0 && (
              <span style={styles.focusTimeBadge}>
                ⏱️ {formatFocusTime(task.total_focus_time)}
              </span>
            )}
            {(task.children ?? []).length > 0 && (
              <span style={styles.subtaskCounter}>
                ☑ {(task.children ?? []).filter((s) => s.completed).length}/
                {(task.children ?? []).length}
              </span>
            )}
            {(task.reminders ?? []).length > 0 && (
              <span
                style={styles.reminderBadge}
                title={`${(task.reminders ?? []).length} recordatorio${
                  (task.reminders ?? []).length === 1 ? '' : 's'
                }`}
              >
                🔔 {(task.reminders ?? []).length}
              </span>
            )}
          </div>
        </div>
        <h4
          style={{
            ...styles.taskTitle,
            ...(task.completed ? styles.taskTitleDone : {}),
          }}
        >
          {task.title}
        </h4>
        {task.description && <p style={styles.taskDesc}>{task.description}</p>}
        {(task.requester || task.assignees.length > 0) && (
          <div style={styles.peopleRow}>
            {task.requester && (
              <span
                style={styles.peopleGroup}
                title={`Encargada por ${task.requester.name}`}
              >
                <span style={styles.peopleLabel}>de</span>
                <Avatar
                  name={task.requester.name}
                  imageUrl={task.requester.image_url}
                  size={20}
                />
              </span>
            )}
            {task.assignees.length > 0 && (
              <span
                style={styles.peopleGroup}
                title={`Delegada en ${task.assignees.map((c) => c.name).join(', ')}`}
              >
                <span style={styles.peopleLabel}>→</span>
                <div style={styles.assigneeStack}>
                  {task.assignees.slice(0, 3).map((c) => (
                    <span key={c.id} style={styles.assigneeAvatar}>
                      <Avatar name={c.name} imageUrl={c.image_url} size={20} />
                    </span>
                  ))}
                  {task.assignees.length > 3 && (
                    <span style={styles.assigneeMore}>
                      +{task.assignees.length - 3}
                    </span>
                  )}
                </div>
              </span>
            )}
          </div>
        )}
        <div style={styles.taskFooter}>
          <div style={styles.footerMeta}>
            {task.due_date && (
              <span style={styles.dueDate}>
                📅 {new Date(task.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            )}
            <span
              style={styles.createdHint}
              title={`Creada el ${new Date(task.created_at).toLocaleString('es-ES')}`}
            >
              {relativeCreated(task.created_at)}
            </span>
          </div>
          <button
            className="glass-button"
            style={styles.focusTaskBtn}
            onClick={(e) => {
              e.stopPropagation();
              onStartFocus({ id: task.id, title: task.title });
            }}
            title="Empezar a concentrarse"
          >
            ⏱️
          </button>
        </div>
      </div>
    );
  };

  function relativeCreated(iso: string): string {
    const created = new Date(iso).getTime();
    const days = Math.floor((Date.now() - created) / 86_400_000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} d`;
    if (days < 30) return `hace ${Math.floor(days / 7)} sem`;
    if (days < 365) return `hace ${Math.floor(days / 30)} m`;
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  }

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

      {/* Search + filter modal trigger + active-filter chip bar */}
      <div style={styles.filterBar}>
        <div style={styles.searchRow}>
          <input
            type="text"
            className="glass-input"
            style={styles.searchInput}
            placeholder="🔍 Buscar tareas..."
            value={filters.query}
            onChange={(e) =>
              setFilters((f) => ({ ...f, query: e.target.value }))
            }
          />
          <button
            type="button"
            className="glass-button-secondary"
            style={styles.filterTriggerBtn}
            onClick={() => setShowFilterModal(true)}
            title="Más filtros"
          >
            🎛 Filtros
          </button>
        </div>
        {(() => {
          const chips = activeFilterChips();
          if (chips.length === 0) return null;
          return (
            <div style={styles.activeFilterChips}>
              {chips.map((c) => (
                <span key={c.key} style={styles.activeFilterChip}>
                  {c.label}
                  <button
                    type="button"
                    style={styles.activeFilterChipClose}
                    onClick={c.clear}
                    title="Quitar filtro"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                type="button"
                style={styles.activeFilterClearAll}
                onClick={() => setFilters({ ...EMPTY_FILTERS, query: filters.query })}
                title="Limpiar todos"
              >
                Limpiar
              </button>
            </div>
          );
        })()}
      </div>

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
              {col.tasks
                .filter(passesFilters)
                .map((task) => {
                  // Drop index targets the original (unfiltered) position so
                  // reordering still makes sense when a tag filter is active.
                  const originalIndex = col.tasks.findIndex((t) => t.id === task.id);
                  const children = task.children ?? [];
                  return (
                    <div key={task.id} style={styles.taskGroup}>
                      {renderCard(task, {
                        columnId: col.id,
                        dropIndex: originalIndex,
                      })}
                      {children.length > 0 && (
                        <div style={styles.childrenContainer}>
                          {children.map((child) => (
                            <div key={child.id} style={styles.childWrapper}>
                              <span style={styles.connectorH} />
                              {renderCard(child, {
                                columnId: col.id,
                                dropIndex: null,
                                isChild: true,
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

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

            <button
              style={styles.archivedLink}
              onClick={() => setArchiveModalColumn({ id: col.id, name: col.name })}
              title="Ver tareas archivadas de esta lista"
            >
              Ver archivadas
            </button>
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
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Descripción</label>
                <textarea
                  className="glass-input"
                  style={{ height: '120px', resize: 'vertical' }}
                  value={selectedTask.description || ''}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, description: e.target.value })
                  }
                  onBlur={(e) => commitField('description', e.target.value)}
                />
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
                  <label style={styles.label}>Delegada en</label>
                  <ContactPicker
                    multi
                    contacts={allContacts}
                    value={selectedTask.assignees.map((c) => c.id)}
                    onChange={handleAssigneesChange}
                    placeholder="Nadie"
                  />
                </div>
              </div>

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
      )}

      {archiveModalColumn && (
        <ArchivedTasksModal
          columnId={archiveModalColumn.id}
          columnName={archiveModalColumn.name}
          onClose={() => setArchiveModalColumn(null)}
          onChanged={fetchBoardDetails}
        />
      )}

      {showReminderPicker && (
        <ReminderPicker
          onClose={() => setShowReminderPicker(false)}
          onPick={handleCreateReminder}
        />
      )}

      {showFilterModal && (
        <FilterModal
          filters={filters}
          tags={allTags}
          contacts={allContacts}
          onClose={() => setShowFilterModal(false)}
          onApply={setFilters}
        />
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
  headerTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  headerBadges: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexShrink: 0,
  },
  footerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  createdHint: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  modalCreatedHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
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
    alignItems: 'center',
    marginTop: '10px',
  },
  autosaveHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  tagChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '8px',
  },
  tagChip: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.03)',
    letterSpacing: '0.3px',
  },
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  searchRow: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
  },
  filterTriggerBtn: {
    padding: '8px 14px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  activeFilterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  activeFilterChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 4px 4px 10px',
    background: 'rgba(99,102,241,0.14)',
    border: '1px solid rgba(99,102,241,0.40)',
    borderRadius: '999px',
    fontSize: '11px',
    color: '#ffffff',
  },
  activeFilterChipClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '50%',
  },
  activeFilterClearAll: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    fontStyle: 'italic',
    marginLeft: '4px',
    textDecoration: 'underline dotted',
  },
  tagPickerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tagPickerChip: {
    padding: '4px 10px',
    fontSize: '12px',
    borderRadius: '999px',
    cursor: 'pointer',
  },
  tagPickerChipActive: {
    background: 'rgba(99,102,241,0.18)',
    borderColor: 'rgba(99,102,241,0.45)',
    color: '#ffffff',
  },
  tagPickerEmpty: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  tagCreateForm: {
    display: 'flex',
    gap: '6px',
    marginTop: '10px',
  },
  tagCreateInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '12px',
  },
  tagCreateBtn: {
    padding: '6px 12px',
    fontSize: '12px',
  },
  subtaskCounter: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--glass-border)',
    borderRadius: '999px',
    padding: '2px 8px',
    letterSpacing: '0.3px',
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
  childTaskCard: {
    // Slightly smaller so a child reads as "related to" the parent
    // without losing the full task-card identity.
    padding: '12px 14px',
  },
  completedTaskCard: {
    opacity: 0.6,
  },
  taskTitleDone: {
    textDecoration: 'line-through',
    color: 'var(--text-muted)',
  },
  colHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
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
  modalDangerGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  movePickerBox: {
    padding: '12px 14px',
    marginTop: '6px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  movePickerRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  movePickerSelect: {
    flex: 1,
    minWidth: '140px',
    padding: '8px 10px',
    fontSize: '13px',
  },
  movePickerSubmit: {
    padding: '8px 16px',
    fontSize: '13px',
  },
  movePickerEmpty: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  reminderBadge: {
    fontSize: '10px',
    color: 'var(--accent-warning)',
    background: 'rgba(245,158,11,0.12)',
    border: '1px solid rgba(245,158,11,0.45)',
    borderRadius: '999px',
    padding: '2px 8px',
  },
  reminderList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 10px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  reminderItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(245,158,11,0.06)',
    border: '1px solid rgba(245,158,11,0.30)',
    borderRadius: 'var(--border-radius-sm)',
  },
  reminderBell: { fontSize: '14px' },
  reminderWhen: {
    fontSize: '13px',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  reminderPast: { color: 'var(--accent-warning)' },
  reminderPastTag: {
    fontSize: '10px',
    background: 'rgba(245,158,11,0.18)',
    color: 'var(--accent-warning)',
    padding: '1px 6px',
    borderRadius: '999px',
    border: '1px solid rgba(245,158,11,0.45)',
  },
  addReminderBtn: {
    width: '100%',
    padding: '8px',
    fontSize: '12px',
  },
  peopleRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginTop: '8px',
    marginBottom: '4px',
    flexWrap: 'wrap',
  },
  peopleGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  peopleLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  assigneeStack: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  assigneeAvatar: {
    marginLeft: '-4px',
    border: '1.5px solid var(--glass-bg)',
    borderRadius: '50%',
    display: 'inline-flex',
  },
  assigneeMore: {
    marginLeft: '4px',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  subtaskLabelCount: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 400,
  },
  subtaskList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 10px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  subtaskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  subtaskCheckbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: 'var(--accent-primary)',
  },
  subtaskTitle: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  subtaskTitleDone: {
    color: 'var(--text-muted)',
    textDecoration: 'line-through',
  },
  subtaskPriorityDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '6px',
    verticalAlign: 'middle',
    flexShrink: 0,
  },
  subtaskDueDate: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginLeft: '8px',
  },
  subtaskTagHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginLeft: '4px',
    fontStyle: 'italic',
  },
  subtaskDelete: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  subtaskForm: {
    display: 'flex',
    gap: '6px',
  },
  subtaskInput: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
  },
  subtaskAddBtn: {
    padding: '8px 14px',
    fontSize: '12px',
  },
};

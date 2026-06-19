import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Avatar } from './Avatar';
import { ContactPicker, type Contact } from './ContactPicker';
import { ArchivedTasksModal } from './ArchivedTasksModal';
import { ReminderPicker } from './ReminderPicker';
import { FilterModal, EMPTY_FILTERS, type Filters } from './FilterModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { AttachmentsSection, type Attachment } from './AttachmentsSection';
import { TaskContextMenu } from './TaskContextMenu';
import { useAuthedImage } from '../hooks/useAuthedImage';
import { MarkdownView } from './MarkdownView';

const CardCoverImage: React.FC<{ url: string; alt: string }> = ({ url, alt }) => {
  const src = useAuthedImage(url);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: 'calc(100% + 32px)',
        marginLeft: '-16px',
        marginRight: '-16px',
        marginTop: '8px',
        marginBottom: '8px',
        height: '120px',
        objectFit: 'cover',
        display: 'block',
        borderRadius: '4px',
      }}
    />
  );
};

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
  attachments: Attachment[];
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
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  onStartFocus,
  onRemindersChanged,
  externalTaskFocus,
  allBoards = [],
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
  // Pre-seeded with the 'Yo mismo' contact when the form opens so the
  // default assignee matches what the backend would set anyway.
  const [newTaskAssigneeIds, setNewTaskAssigneeIds] = useState<number[]>([]);

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
  const [editingColId, setEditingColId] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState('');
  // The description renders as markdown by default and flips to a
  // textarea only when the user clicks "edit", to keep the modal calm.
  const [editingDescription, setEditingDescription] = useState(false);
  // Escape closes the task detail modal regardless of focus, matching the
  // app-wide convention. Only active when a task is selected.
  useEscapeKey(() => setSelectedTask(null), selectedTask !== null);
  // Drop the description-editing flag whenever the modal changes target
  // so the new task always opens in the rendered (read) state.
  useEffect(() => {
    setEditingDescription(false);
  }, [selectedTask?.id]);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveTargetBoardId, setMoveTargetBoardId] = useState<number | null>(null);
  // Right-click context menu on a task card: which task + where.
  const [cardMenu, setCardMenu] = useState<{ task: Task; x: number; y: number } | null>(null);
  // Trello-style drop indicator: which column + visible slot the dragged
  // card will land in. Index is in *visible* space (post-filter).
  const [dropHint, setDropHint] = useState<{ columnId: number; index: number } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
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
    if (q) {
      const haystacks: string[] = [
        task.title,
        task.description ?? '',
        task.requester?.name ?? '',
        ...task.assignees.map((a) => a.name),
      ];
      if (!haystacks.some((h) => h.toLowerCase().includes(q))) {
        return false;
      }
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
        label: `asignado a: ${c?.name ?? aid}`,
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

  // Task Actions
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

  // ---- Context-menu actions (operate on an arbitrary task id, not the
  // modal's selectedTask) ----------------------------------------------------
  const ctxMoveColumn = async (taskId: number, columnId: number) => {
    setCardMenu(null);
    await moveTask(taskId, columnId);
  };

  const ctxMoveBoard = async (taskId: number, boardId: number) => {
    setCardMenu(null);
    try {
      const detail = await api.getBoardDetail(boardId);
      const firstCol = detail.columns?.[0];
      if (!firstCol) {
        alert('El tablero destino no tiene columnas.');
        return;
      }
      await api.moveTaskToBoard(taskId, boardId, firstCol.id);
      // Stay put — just refresh the current board.
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const ctxSetPriority = async (taskId: number, priority: string) => {
    setCardMenu(null);
    try {
      await api.updateTask(taskId, { priority });
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Toggle a single assignee; keep the menu open so several can be set
  // in one pass. Optimistically reflect on the open menu's task copy.
  const ctxToggleAssignee = async (taskId: number, contactId: number) => {
    const flat = allBoardTasks();
    const task = flat.find((t) => t.id === taskId);
    if (!task) return;
    const current = task.assignees.map((a) => a.id);
    const next = current.includes(contactId)
      ? current.filter((id) => id !== contactId)
      : [...current, contactId];
    try {
      const updated = await api.updateTask(taskId, { assignee_ids: next });
      // Keep the menu's snapshot in sync so the checkmarks update live.
      setCardMenu((m) =>
        m && m.task.id === taskId ? { ...m, task: updated } : m,
      );
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const ctxArchive = async (taskId: number) => {
    setCardMenu(null);
    try {
      await api.updateTask(taskId, { archived: true });
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const ctxDelete = async (taskId: number) => {
    setCardMenu(null);
    if (
      !confirm(
        '¿Borrar esta tarea? Se eliminarán sus subtareas, recordatorios y adjuntos.',
      )
    )
      return;
    try {
      await api.deleteTask(taskId);
      if (selectedTask?.id === taskId) setSelectedTask(null);
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
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Clear the drop indicator once the gesture finishes (drop or cancel).
  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDropHint(null);
  };

  // Set the indicator from a card under the cursor: before it when the
  // pointer is in the top half, after it when in the bottom half.
  const handleCardDragOver = (
    e: React.DragEvent,
    columnId: number,
    visibleIndex: number,
  ) => {
    if (draggingTaskId == null) return; // a column drag, not a card
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const index = after ? visibleIndex + 1 : visibleIndex;
    setDropHint((prev) =>
      prev && prev.columnId === columnId && prev.index === index
        ? prev
        : { columnId, index },
    );
  };

  // Hovering the empty area below the last card → drop at the end.
  const handleColumnTailDragOver = (e: React.DragEvent, columnId: number) => {
    if (draggingTaskId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const visibleCount =
      board?.columns.find((c) => c.id === columnId)?.tasks.filter(passesFilters)
        .length ?? 0;
    setDropHint((prev) =>
      prev && prev.columnId === columnId && prev.index === visibleCount
        ? prev
        : { columnId, index: visibleCount },
    );
  };

  /** Translate a visible-space slot index to the unfiltered position the
   *  reorder API expects, then delegate to moveTask. */
  const dropTaskAtVisibleIndex = async (
    sourceId: number,
    columnId: number,
    visibleIndex: number,
  ) => {
    const col = board?.columns.find((c) => c.id === columnId);
    if (!col) return;
    const visible = col.tasks.filter(passesFilters);
    let targetOriginalIndex: number;
    if (visibleIndex >= visible.length) {
      targetOriginalIndex = col.tasks.length;
    } else {
      const targetTask = visible[visibleIndex];
      targetOriginalIndex = col.tasks.findIndex((t) => t.id === targetTask.id);
    }
    await moveTask(sourceId, columnId, targetOriginalIndex);
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

    // For an intra-column move, the target index was measured in the
    // list that still contained the dragged card. After we splice it out
    // the slots above the insertion point shift down by one, so we
    // decrement to keep the card where the user aimed.
    const sourceOriginalIndex =
      board.columns.find((c) => c.id === sourceColId)?.tasks.findIndex(
        (t) => t.id === taskId,
      ) ?? -1;

    // Build the next state: remove from source, insert into target.
    const updatedColumns = board.columns.map((col) => {
      if (col.id !== sourceColId && col.id !== targetColId) return col;

      let tasks = col.tasks.filter((t) => t.id !== taskId);
      if (col.id === targetColId) {
        let insertAt =
          targetIndex === undefined ? tasks.length : targetIndex;
        if (
          sourceColId === targetColId &&
          sourceOriginalIndex !== -1 &&
          sourceOriginalIndex < insertAt
        ) {
          insertAt -= 1;
        }
        insertAt = Math.max(0, Math.min(insertAt, tasks.length));
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

  const handleColumnDragStart = (e: React.DragEvent, colId: number) => {
    e.dataTransfer.setData('application/x-column-id', colId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  // Move the dragged column into the target column's slot; subsequent
  // columns shift right. Same source+target is a no-op.
  const reorderColumnTo = async (sourceColId: number, targetColId: number) => {
    if (!board || sourceColId === targetColId) return;
    const ids = board.columns.map((c) => c.id);
    const fromIdx = ids.indexOf(sourceColId);
    const toIdx = ids.indexOf(targetColId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, sourceColId);
    const byId = new Map(board.columns.map((c) => [c.id, c]));
    setBoard({ ...board, columns: reordered.map((id) => byId.get(id)!) });
    try {
      await api.reorderColumns(boardId, reordered);
    } catch (err: any) {
      alert(err.message);
      fetchBoardDetails();
    }
  };

  const handleColumnDrop = async (e: React.DragEvent, targetColId: number) => {
    e.preventDefault();
    const hint = dropHint;
    setDropHint(null);
    setDraggingTaskId(null);
    const colIdStr = e.dataTransfer.getData('application/x-column-id');
    if (colIdStr) {
      await reorderColumnTo(parseInt(colIdStr), targetColId);
      return;
    }
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (!taskIdStr) return;
    // Honour the indicator if it points at this column; otherwise append.
    if (hint && hint.columnId === targetColId) {
      await dropTaskAtVisibleIndex(parseInt(taskIdStr), targetColId, hint.index);
    } else {
      await moveTask(parseInt(taskIdStr), targetColId);
    }
  };

  const handleTaskDrop = async (
    e: React.DragEvent,
    targetColId: number,
    visibleIndex: number,
    targetTaskId: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const hint = dropHint;
    setDropHint(null);
    setDraggingTaskId(null);
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (!taskIdStr) return;
    const sourceId = parseInt(taskIdStr);
    // Shift+drop nests the source under the target instead of reordering.
    if (e.shiftKey) {
      await nestTaskUnder(sourceId, targetTaskId);
      return;
    }
    // Prefer the live indicator (accounts for top/bottom-half); fall back
    // to this card's own slot if the hint is stale or in another column.
    const idx =
      hint && hint.columnId === targetColId ? hint.index : visibleIndex;
    await dropTaskAtVisibleIndex(sourceId, targetColId, idx);
  };

  // Reparent `sourceId` under `targetId` via the existing update endpoint.
  // The board state is refetched on success so the children appear inline.
  const nestTaskUnder = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;
    try {
      await api.updateTask(sourceId, { parent_task_id: targetId });
      if (selectedTask?.id === sourceId) {
        await refreshSelectedTask(sourceId);
      }
      fetchBoardDetails();
    } catch (err: any) {
      alert(err.message);
    }
  };

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

  /** All tasks on the current board, flattened. Used by the parent picker
   * in the modal so the user can nest the current task under an existing
   * one without leaving the dialog. */
  const allBoardTasks = (): Task[] => {
    if (!board) return [];
    const out: Task[] = [];
    for (const col of board.columns) {
      for (const t of col.tasks) {
        out.push(t);
        for (const child of t.children ?? []) {
          out.push(child as Task);
        }
      }
    }
    return out;
  };

  /** Ids the user is not allowed to set as parent of `taskId`: itself plus
   * every descendant (would create a cycle). */
  const ineligibleParentIds = (taskId: number): Set<number> => {
    const blocked = new Set<number>([taskId]);
    const flat = allBoardTasks();
    let frontier = [taskId];
    while (frontier.length) {
      const next: number[] = [];
      for (const t of flat) {
        if (t.parent_task_id && frontier.includes(t.parent_task_id)) {
          if (!blocked.has(t.id)) {
            blocked.add(t.id);
            next.push(t.id);
          }
        }
      }
      frontier = next;
    }
    return blocked;
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
    // Priority drives the card background tint. Medium keeps the default
    // glass surface; high gets a soft red, low gets a soft blue.
    const priorityBackground =
      task.priority === 'high'
        ? 'rgba(239, 68, 68, 0.15)'
        : task.priority === 'low'
        ? 'rgba(59, 130, 246, 0.13)'
        : undefined;
    return (
      <div
        className="glass-card"
        style={{
          ...styles.taskCard,
          ...(opts.isChild ? styles.childTaskCard : {}),
          ...(task.completed ? styles.completedTaskCard : {}),
          ...(priorityBackground ? { background: priorityBackground } : {}),
          ...(draggingTaskId === task.id ? styles.draggingCard : {}),
        }}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, task.id) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        onDragOver={
          draggable
            ? (e) => handleCardDragOver(e, opts.columnId, opts.dropIndex as number)
            : undefined
        }
        onDrop={
          draggable
            ? (e) =>
                handleTaskDrop(
                  e,
                  opts.columnId,
                  opts.dropIndex as number,
                  task.id,
                )
            : undefined
        }
        onClick={() => setSelectedTask(task)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCardMenu({ task, x: e.clientX, y: e.clientY });
        }}
        title={`Prioridad: ${getPriorityLabel(task.priority)} · Shift+arrastrar para anidar · clic derecho para acciones`}
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
            {(task.attachments ?? []).length > 0 &&
              !(task.attachments ?? []).some((a) => a.is_image) && (
                <span
                  style={styles.attachmentBadge}
                  title={`${(task.attachments ?? []).length} adjunto${
                    (task.attachments ?? []).length === 1 ? '' : 's'
                  }`}
                >
                  📎 {(task.attachments ?? []).length}
                </span>
              )}
          </div>
        </div>
        {/* Cover image: first image attachment renders as a thumbnail
            strip across the top of the card body. */}
        {(() => {
          const cover = (task.attachments ?? []).find((a) => a.is_image);
          if (!cover) return null;
          return <CardCoverImage url={cover.url} alt={cover.filename} />;
        })()}
        <h4
          style={{
            ...styles.taskTitle,
            ...(task.completed ? styles.taskTitleDone : {}),
          }}
        >
          {task.title}
        </h4>
        {task.description && (
          <div style={styles.taskDesc}>
            <MarkdownView source={task.description} compact />
          </div>
        )}
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
                title={`Asignado a ${task.assignees.map((c) => c.name).join(', ')}`}
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
                            {renderCard(task, {
                              columnId: col.id,
                              // dropIndex now carries the *visible* slot,
                              // used by the Trello-style drop indicator.
                              dropIndex: vi,
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
            {activeNewTaskCol === col.id ? (
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
                      handleAddTask(col.id);
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
                      handleAddTask(col.id);
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
                  <button className="glass-button" onClick={() => handleAddTask(col.id)}>
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
                onClick={() => openNewTaskForm(col.id)}
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

      {cardMenu && board && (
        <TaskContextMenu
          anchor={{ x: cardMenu.x, y: cardMenu.y }}
          taskTitle={cardMenu.task.title}
          taskPriority={cardMenu.task.priority}
          assigneeIds={cardMenu.task.assignees.map((a) => a.id)}
          columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
          currentColumnId={cardMenu.task.column_id}
          boards={moveCandidates.map((b) => ({ id: b.id, name: b.name }))}
          contacts={allContacts}
          onMoveColumn={(columnId) => ctxMoveColumn(cardMenu.task.id, columnId)}
          onMoveBoard={(boardId) => ctxMoveBoard(cardMenu.task.id, boardId)}
          onSetPriority={(priority) => ctxSetPriority(cardMenu.task.id, priority)}
          onToggleAssignee={(contactId) =>
            ctxToggleAssignee(cardMenu.task.id, contactId)
          }
          onArchive={() => ctxArchive(cardMenu.task.id)}
          onDelete={() => ctxDelete(cardMenu.task.id)}
          onClose={() => setCardMenu(null)}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    // See App.mainContent: prevents the container from auto-stretching to
    // its column-set's intrinsic width and breaking horizontal scroll.
    minWidth: 0,
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
    // Same flex-quirk fix as above: without min-width: 0 the workspace
    // grows to fit all columns and overflowX: auto never kicks in.
    minWidth: 0,
    display: 'flex',
    gap: '24px',
    overflowX: 'auto',
    alignItems: 'flex-start',
    paddingBottom: '16px',
  },
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
  taskCard: {
    padding: '16px',
    cursor: 'pointer',
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
  draggingCard: {
    opacity: 0.4,
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
    // Inner MarkdownView (compact) handles the 2-line clamp; this wrapper
    // just owns the spacing around the snippet.
    marginBottom: '12px',
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
  newTaskLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
  parentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  parentLink: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '13px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  parentDetach: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 10px',
    borderRadius: '6px',
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
    // Doubled from 500 → 1000 to host the markdown description and
    // attachment grid without the form feeling cramped. Caps at the
    // viewport width on smaller screens via the responsive max calc.
    maxWidth: 'min(1000px, 95vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '30px',
  },
  markdownHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontWeight: 400,
    marginLeft: '6px',
  },
  descriptionView: {
    minHeight: '60px',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '6px',
    cursor: 'text',
  },
  descriptionEmpty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
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
  attachmentBadge: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
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

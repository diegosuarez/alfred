import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Contact } from './ContactPicker';
import { ArchivedTasksModal } from './ArchivedTasksModal';
import { ReminderPicker } from './ReminderPicker';
import { FilterModal, EMPTY_FILTERS, type Filters } from './FilterModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type {
  BoardDetail,
  BoardSummary,
  CardMenuState,
  Tag,
  Task,
} from './kanban/types';
import {
  findIneligibleParentIds,
  flattenBoardTasks,
  taskPassesFilters,
} from './kanban/utils';
import { useBoardDragDrop } from './kanban/useBoardDragDrop';
import { FilterBar } from './kanban/FilterBar';
import { KanbanColumn } from './kanban/KanbanColumn';
import { NewTaskForm } from './kanban/NewTaskForm';
import { TaskDetailModal } from './kanban/TaskDetailModal';
import { CardMenu } from './kanban/CardMenu';

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
  // Escape closes the task detail modal regardless of focus, matching the
  // app-wide convention. Only active when a task is selected.
  useEscapeKey(() => setSelectedTask(null), selectedTask !== null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  // Right-click context menu on a task card: which task + where.
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);

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

  // Apply all current filters to a task (see taskPassesFilters).
  const passesFilters = (task: Task): boolean => taskPassesFilters(task, filters);

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

  const {
    dropHint,
    draggingTaskId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleCardDragOver,
    handleColumnTailDragOver,
    handleColumnDragStart,
    handleColumnDrop,
    handleTaskDrop,
    moveTask,
  } = useBoardDragDrop({
    boardId,
    board,
    setBoard,
    passesFilters,
    fetchBoardDetails,
    nestTaskUnder,
  });

  // Boards available as a move destination: same context as current,
  // excluding the current board.
  const moveCandidates = (() => {
    if (!board) return [] as BoardSummary[];
    return allBoards.filter(
      (b) => b.id !== board.id && b.context_id === board.context_id,
    );
  })();

  const handleCreateReminder = async (remindAtIso: string) => {
    if (!selectedTask) return;
    await api.createReminder(selectedTask.id, remindAtIso);
    await refreshSelectedTask(selectedTask.id);
    onRemindersChanged?.();
  };

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

  /** All tasks on the current board, flattened. Used by the parent picker
   * in the modal so the user can nest the current task under an existing
   * one without leaving the dialog. */
  const allBoardTasks = (): Task[] => flattenBoardTasks(board);

  /** Ids the user is not allowed to set as parent of `taskId`: itself plus
   * every descendant (would create a cycle). */
  const ineligibleParentIds = (taskId: number): Set<number> =>
    findIneligibleParentIds(board, taskId);

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
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        allTags={allTags}
        allContacts={allContacts}
        setShowFilterModal={setShowFilterModal}
      />

      {/* Columns Workspace */}
      <div style={styles.workspace}>
        {board.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            passesFilters={passesFilters}
            dropHint={dropHint}
            handleDragOver={handleDragOver}
            handleColumnDrop={handleColumnDrop}
            handleColumnDragStart={handleColumnDragStart}
            handleColumnTailDragOver={handleColumnTailDragOver}
            draggingTaskId={draggingTaskId}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleCardDragOver={handleCardDragOver}
            handleTaskDrop={handleTaskDrop}
            setSelectedTask={setSelectedTask}
            setCardMenu={setCardMenu}
            onStartFocus={onStartFocus}
            editingColId={editingColId}
            setEditingColId={setEditingColId}
            editingColName={editingColName}
            setEditingColName={setEditingColName}
            columnMenuOpenId={columnMenuOpenId}
            setColumnMenuOpenId={setColumnMenuOpenId}
            setArchiveModalColumn={setArchiveModalColumn}
            fetchBoardDetails={fetchBoardDetails}
            addTaskArea={
              <NewTaskForm
                columnId={col.id}
                activeNewTaskCol={activeNewTaskCol}
                setActiveNewTaskCol={setActiveNewTaskCol}
                newTaskTitle={newTaskTitle}
                setNewTaskTitle={setNewTaskTitle}
                newTaskDesc={newTaskDesc}
                setNewTaskDesc={setNewTaskDesc}
                newTaskPriority={newTaskPriority}
                setNewTaskPriority={setNewTaskPriority}
                newTaskDueDate={newTaskDueDate}
                setNewTaskDueDate={setNewTaskDueDate}
                newTaskAssigneeIds={newTaskAssigneeIds}
                setNewTaskAssigneeIds={setNewTaskAssigneeIds}
                allContacts={allContacts}
                fetchBoardDetails={fetchBoardDetails}
              />
            }
          />
        ))}
      </div>

      {/* Task detailed View / Edit Modal */}
      {selectedTask && (
        <TaskDetailModal
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          allTags={allTags}
          allContacts={allContacts}
          moveCandidates={moveCandidates}
          allBoardTasks={allBoardTasks}
          ineligibleParentIds={ineligibleParentIds}
          nestTaskUnder={nestTaskUnder}
          refreshSelectedTask={refreshSelectedTask}
          fetchBoardDetails={fetchBoardDetails}
          fetchTags={fetchTags}
          onRemindersChanged={onRemindersChanged}
          setShowReminderPicker={setShowReminderPicker}
          newSubtaskTitle={newSubtaskTitle}
          setNewSubtaskTitle={setNewSubtaskTitle}
          newTagName={newTagName}
          setNewTagName={setNewTagName}
        />
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
        <CardMenu
          cardMenu={cardMenu}
          setCardMenu={setCardMenu}
          board={board}
          moveCandidates={moveCandidates}
          allContacts={allContacts}
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          moveTask={moveTask}
          allBoardTasks={allBoardTasks}
          fetchBoardDetails={fetchBoardDetails}
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
};

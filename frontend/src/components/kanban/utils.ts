import type { Filters } from '../FilterModal';
import type { BoardDetail, Task } from './types';

// Apply all current filters to a task. Title query is case-insensitive
// substring; tag/assignee multi-filters are OR within, AND across
// categories.
export const taskPassesFilters = (task: Task, filters: Filters): boolean => {
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

/** All tasks on the current board, flattened. Used by the parent picker
 * in the modal so the user can nest the current task under an existing
 * one without leaving the dialog. */
export const flattenBoardTasks = (board: BoardDetail | null): Task[] => {
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
export const findIneligibleParentIds = (
  board: BoardDetail | null,
  taskId: number,
): Set<number> => {
  const blocked = new Set<number>([taskId]);
  const flat = flattenBoardTasks(board);
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

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low': return 'var(--priority-low)';
    case 'high': return 'var(--priority-high)';
    default: return 'var(--priority-medium)';
  }
};

export const getPriorityLabel = (priority: string) => {
  switch (priority) {
    case 'low': return 'Baja';
    case 'high': return 'Alta';
    default: return 'Media';
  }
};

export const formatFocusTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
};

export function relativeCreated(iso: string): string {
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

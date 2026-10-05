import React from 'react';
import { api } from '../../services/api';
import type { Contact } from '../ContactPicker';
import { TaskContextMenu } from '../TaskContextMenu';
import type { BoardDetail, BoardSummary, CardMenuState, Task } from './types';

interface CardMenuProps {
  cardMenu: CardMenuState;
  setCardMenu: React.Dispatch<React.SetStateAction<CardMenuState | null>>;
  board: BoardDetail;
  moveCandidates: BoardSummary[];
  allContacts: Contact[];
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  moveTask: (taskId: number, targetColId: number, targetIndex?: number) => Promise<void>;
  allBoardTasks: () => Task[];
  fetchBoardDetails: () => Promise<void>;
}

/** Right-click menu on a task card, wired to the board-level actions. */
export const CardMenu: React.FC<CardMenuProps> = ({
  cardMenu,
  setCardMenu,
  board,
  moveCandidates,
  allContacts,
  selectedTask,
  setSelectedTask,
  moveTask,
  allBoardTasks,
  fetchBoardDetails,
}) => {
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

  return (
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
  );
};

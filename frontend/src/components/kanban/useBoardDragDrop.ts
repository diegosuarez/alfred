import React, { useState } from 'react';
import { api } from '../../services/api';
import type { BoardDetail, Task } from './types';

interface UseBoardDragDropArgs {
  boardId: number;
  board: BoardDetail | null;
  setBoard: (board: BoardDetail) => void;
  passesFilters: (task: Task) => boolean;
  fetchBoardDetails: () => Promise<void>;
  nestTaskUnder: (sourceId: number, targetId: number) => Promise<void>;
}

/** Card + column drag & drop for the board, including the optimistic
 * reorder (`moveTask`) that the card context menu also uses. */
export function useBoardDragDrop({
  boardId,
  board,
  setBoard,
  passesFilters,
  fetchBoardDetails,
  nestTaskUnder,
}: UseBoardDragDropArgs) {
  // Trello-style drop indicator: which column + visible slot the dragged
  // card will land in. Index is in *visible* space (post-filter).
  const [dropHint, setDropHint] = useState<{ columnId: number; index: number } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

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

  return {
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
  };
}

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.board import Board
from app.models.column import Column
from app.models.tag import Tag
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, TaskReorder

router = APIRouter(prefix="", tags=["tasks"])


async def _fetch_caller_tags(
    db: AsyncSession, user_id: int, tag_ids: List[int]
) -> List[Tag]:
    """Resolve a list of tag ids into Tag rows, rejecting ids that don't
    belong to the caller. Returns the rows in the order requested."""
    if not tag_ids:
        return []
    unique_ids = list(dict.fromkeys(tag_ids))
    result = await db.execute(
        select(Tag).filter(Tag.id.in_(unique_ids), Tag.user_id == user_id)
    )
    by_id = {t.id: t for t in result.scalars().all()}
    if len(by_id) != len(unique_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more tag_ids are invalid",
        )
    return [by_id[i] for i in unique_ids]

@router.post("/columns/{column_id}/tasks", response_model=TaskResponse)
async def create_task(
    column_id: int,
    task_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify column ownership via its parent board
    col_result = await db.execute(
        select(Column).join(Board).filter(Column.id == column_id, Board.user_id == current_user.id)
    )
    col = col_result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
        
    # Get last task position in column to append
    pos_result = await db.execute(
        select(Task.position).filter(Task.column_id == column_id).order_by(Task.position.desc())
    )
    last_position = pos_result.scalars().first()
    next_position = (last_position + 1) if last_position is not None else 0
    
    tags = await _fetch_caller_tags(db, current_user.id, task_in.tag_ids)

    task = Task(
        title=task_in.title,
        description=task_in.description,
        priority=task_in.priority,
        due_date=task_in.due_date,
        position=next_position,
        column_id=column_id,
        board_id=col.board_id,
    )
    if tags:
        task.tags = tags
    db.add(task)
    await db.commit()
    # Re-fetch with tags eagerly loaded so the response serializes them
    # without triggering a lazy SQL load under the async session.
    refreshed = await db.execute(
        select(Task)
        .options(selectinload(Task.tags), selectinload(Task.subtasks))
        .filter(Task.id == task.id)
    )
    return refreshed.scalars().first()

@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_in: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify task ownership and load dynamic relationships
    task_result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id == task_id, Board.user_id == current_user.id)
        .options(
            selectinload(Task.focus_sessions),
            selectinload(Task.tags),
            selectinload(Task.subtasks),
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
        
    if task_in.title is not None:
        task.title = task_in.title
    if task_in.description is not None:
        task.description = task_in.description
    if task_in.priority is not None:
        task.priority = task_in.priority
    if task_in.due_date is not None:
        task.due_date = task_in.due_date
    if task_in.position is not None:
        task.position = task_in.position
        
    if task_in.column_id is not None:
        # Check that target column belongs to current user's boards
        col_result = await db.execute(
            select(Column).join(Board).filter(Column.id == task_in.column_id, Board.user_id == current_user.id)
        )
        col = col_result.scalars().first()
        if not col:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid target column"
            )
        task.column_id = task_in.column_id

    if task_in.tag_ids is not None:
        task.tags = await _fetch_caller_tags(db, current_user.id, task_in.tag_ids)

    await db.commit()
    await db.refresh(task)
    return task

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Task).join(Board).filter(Task.id == task_id, Board.user_id == current_user.id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
        
    await db.delete(task)
    await db.commit()
    return None

@router.post("/columns/{column_id}/tasks/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_tasks(
    column_id: int,
    reorder: TaskReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if reorder.column_id != column_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_id in body must match URL"
        )

    # Verify target column ownership
    col_result = await db.execute(
        select(Column).join(Board).filter(Column.id == column_id, Board.user_id == current_user.id)
    )
    col = col_result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )

    if not reorder.task_ids:
        return None

    # Fetch every referenced task in one query, scoped to caller-owned boards.
    # This supports cross-column moves: a task currently in another column
    # of the same user becomes part of the target column at the given index.
    tasks_result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id.in_(reorder.task_ids), Board.user_id == current_user.id)
    )
    tasks_by_id = {t.id: t for t in tasks_result.scalars().all()}
    if len(tasks_by_id) != len(set(reorder.task_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more tasks not found"
        )

    for idx, t_id in enumerate(reorder.task_ids):
        task = tasks_by_id[t_id]
        task.position = idx
        task.column_id = column_id

    await db.commit()
    return None

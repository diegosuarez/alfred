from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.board import Board
from app.models.column import Column
from app.models.tag import Tag
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskReorder, TaskResponse, TaskUpdate

router = APIRouter(prefix="", tags=["tasks"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Eager-load chain re-used by every endpoint that returns a TaskResponse so
# Pydantic can serialize tags + children + nested grandchildren without
# triggering lazy SQL emits in the async session.
_TASK_LOAD_OPTIONS = [
    selectinload(Task.tags),
    selectinload(Task.focus_sessions),
    selectinload(Task.children).selectinload(Task.tags),
    selectinload(Task.children).selectinload(Task.focus_sessions),
]


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


async def _owned_task(db: AsyncSession, user_id: int, task_id: int) -> Task:
    result = await db.execute(
        select(Task).join(Board).filter(
            Task.id == task_id, Board.user_id == user_id
        )
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )
    return task


async def _hydrated_task(db: AsyncSession, task_id: int) -> Task:
    """Return a Task with the standard eager loads applied."""
    result = await db.execute(
        select(Task).options(*_TASK_LOAD_OPTIONS).filter(Task.id == task_id)
    )
    return result.scalars().first()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/columns/{column_id}/tasks", response_model=TaskResponse)
async def create_task(
    column_id: int,
    task_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify column ownership via its parent board
    col_result = await db.execute(
        select(Column).join(Board).filter(
            Column.id == column_id, Board.user_id == current_user.id
        )
    )
    col = col_result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Column not found"
        )

    parent_id = task_in.parent_task_id
    if parent_id is not None:
        parent = await _owned_task(db, current_user.id, parent_id)
        if parent.board_id != col.board_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent task lives in a different board",
            )

    # Append at the end of the column.
    pos_result = await db.execute(
        select(Task.position)
        .filter(Task.column_id == column_id)
        .order_by(Task.position.desc())
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
        parent_task_id=parent_id,
    )
    if tags:
        task.tags = tags
    db.add(task)
    await db.commit()
    return await _hydrated_task(db, task.id)


@router.post("/tasks/{parent_id}/subtasks", response_model=TaskResponse)
async def create_subtask(
    parent_id: int,
    task_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Convenience: create a child task under `parent_id` inheriting its
    column. Equivalent to POST /columns/{parent.column_id}/tasks with
    parent_task_id set, but lets the SPA omit knowledge of the column.
    """
    parent = await _owned_task(db, current_user.id, parent_id)

    pos_result = await db.execute(
        select(Task.position)
        .filter(Task.column_id == parent.column_id)
        .order_by(Task.position.desc())
    )
    last_position = pos_result.scalars().first()
    next_position = (last_position + 1) if last_position is not None else 0

    tags = await _fetch_caller_tags(db, current_user.id, task_in.tag_ids)

    task = Task(
        title=task_in.title,
        description=task_in.description,
        priority=task_in.priority or "medium",
        due_date=task_in.due_date,
        position=next_position,
        column_id=parent.column_id,
        board_id=parent.board_id,
        parent_task_id=parent.id,
    )
    if tags:
        task.tags = tags
    db.add(task)
    await db.commit()
    return await _hydrated_task(db, task.id)


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_in: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Eager-load tags so assigning task.tags = ... can diff the M2M
    # without lazy-loading inside the async session.
    result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id == task_id, Board.user_id == current_user.id)
        .options(selectinload(Task.tags))
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
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
    if task_in.completed is not None:
        task.completed = task_in.completed

    if task_in.column_id is not None:
        col_result = await db.execute(
            select(Column).join(Board).filter(
                Column.id == task_in.column_id, Board.user_id == current_user.id
            )
        )
        col = col_result.scalars().first()
        if not col:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid target column",
            )
        task.column_id = task_in.column_id

    if task_in.parent_task_id is not None:
        if task_in.parent_task_id == 0:
            task.parent_task_id = None  # 0 means detach
        else:
            if task_in.parent_task_id == task.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A task cannot be its own parent",
                )
            parent = await _owned_task(db, current_user.id, task_in.parent_task_id)
            if parent.board_id != task.board_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Parent task lives in a different board",
                )
            task.parent_task_id = parent.id

    if task_in.tag_ids is not None:
        task.tags = await _fetch_caller_tags(db, current_user.id, task_in.tag_ids)

    await db.commit()
    return await _hydrated_task(db, task.id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _owned_task(db, current_user.id, task_id)
    await db.delete(task)
    await db.commit()
    return None


@router.post(
    "/columns/{column_id}/tasks/reorder", status_code=status.HTTP_204_NO_CONTENT
)
async def reorder_tasks(
    column_id: int,
    reorder: TaskReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if reorder.column_id != column_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_id in body must match URL",
        )

    col_result = await db.execute(
        select(Column).join(Board).filter(
            Column.id == column_id, Board.user_id == current_user.id
        )
    )
    col = col_result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Column not found"
        )

    if not reorder.task_ids:
        return None

    tasks_result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id.in_(reorder.task_ids), Board.user_id == current_user.id)
    )
    tasks_by_id = {t.id: t for t in tasks_result.scalars().all()}
    if len(tasks_by_id) != len(set(reorder.task_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more tasks not found",
        )

    for idx, t_id in enumerate(reorder.task_ids):
        task = tasks_by_id[t_id]
        task.position = idx
        task.column_id = column_id

    await db.commit()
    return None

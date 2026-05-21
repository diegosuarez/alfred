from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.time import utcnow

from app.api.deps import get_current_user
from app.database import get_db
from app.models.board import Board
from app.models.column import Column
from app.models.contact import Contact
from app.models.tag import Tag
from app.models.task import Task
from app.models.user import User
from app.schemas.task import (
    ArchiveResultResponse,
    TaskCreate,
    TaskReorder,
    TaskResponse,
    TaskUpdate,
)

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
    selectinload(Task.requester),
    selectinload(Task.assignees),
    selectinload(Task.children).selectinload(Task.tags),
    selectinload(Task.children).selectinload(Task.focus_sessions),
    selectinload(Task.children).selectinload(Task.requester),
    selectinload(Task.children).selectinload(Task.assignees),
]


async def _fetch_caller_contact(
    db: AsyncSession, user_id: int, contact_id: int
) -> Contact:
    """Return the contact if it belongs to the caller, otherwise 400."""
    result = await db.execute(
        select(Contact).filter(
            Contact.id == contact_id, Contact.user_id == user_id
        )
    )
    contact = result.scalars().first()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid contact id",
        )
    return contact


async def _fetch_caller_contacts(
    db: AsyncSession, user_id: int, contact_ids: List[int]
) -> List[Contact]:
    """Resolve a list of contact ids to rows, rejecting any that don't
    belong to the caller. Returns them in the requested order."""
    if not contact_ids:
        return []
    unique = list(dict.fromkeys(contact_ids))
    result = await db.execute(
        select(Contact).filter(
            Contact.id.in_(unique), Contact.user_id == user_id
        )
    )
    by_id = {c.id: c for c in result.scalars().all()}
    if len(by_id) != len(unique):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more assignee_ids are invalid",
        )
    return [by_id[i] for i in unique]


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


async def _collect_descendant_ids(
    db: AsyncSession, root_ids: List[int]
) -> List[int]:
    """Return root_ids plus every descendant id, by level. SQLAlchemy
    doesn't have a portable recursive-CTE API, so we just BFS the tree
    in Python — fine at the depths we expect in practice."""
    all_ids: List[int] = list(root_ids)
    frontier: List[int] = list(root_ids)
    while frontier:
        result = await db.execute(
            select(Task.id).filter(Task.parent_task_id.in_(frontier))
        )
        next_level = [r[0] for r in result.all()]
        if not next_level:
            break
        all_ids.extend(next_level)
        frontier = next_level
    return all_ids


async def _set_archived(
    db: AsyncSession, root_ids: List[int], archived: bool
) -> int:
    """Flip archived_at on the given roots and every descendant. Returns
    the number of rows actually updated (i.e. that flipped state)."""
    if not root_ids:
        return 0
    ids = await _collect_descendant_ids(db, root_ids)
    new_value = utcnow().replace(tzinfo=None) if archived else None
    # Only touch rows whose archived state would actually change so the
    # "archived" counter reported back to the SPA is accurate.
    if archived:
        condition = Task.archived_at.is_(None)
    else:
        condition = Task.archived_at.is_not(None)
    result = await db.execute(
        sql_update(Task)
        .where(Task.id.in_(ids), condition)
        .values(archived_at=new_value)
    )
    return result.rowcount or 0


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
    assignees = await _fetch_caller_contacts(
        db, current_user.id, task_in.assignee_ids
    )
    requester = None
    if task_in.requester_id:
        requester = await _fetch_caller_contact(
            db, current_user.id, task_in.requester_id
        )

    task = Task(
        title=task_in.title,
        description=task_in.description,
        priority=task_in.priority,
        due_date=task_in.due_date,
        position=next_position,
        column_id=column_id,
        board_id=col.board_id,
        parent_task_id=parent_id,
        requester_id=requester.id if requester else None,
    )
    if tags:
        task.tags = tags
    if assignees:
        task.assignees = assignees
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
    assignees = await _fetch_caller_contacts(
        db, current_user.id, task_in.assignee_ids
    )
    requester = None
    if task_in.requester_id:
        requester = await _fetch_caller_contact(
            db, current_user.id, task_in.requester_id
        )

    task = Task(
        title=task_in.title,
        description=task_in.description,
        priority=task_in.priority or "medium",
        due_date=task_in.due_date,
        position=next_position,
        column_id=parent.column_id,
        board_id=parent.board_id,
        parent_task_id=parent.id,
        requester_id=requester.id if requester else None,
    )
    if tags:
        task.tags = tags
    if assignees:
        task.assignees = assignees
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
    # Eager-load tags / assignees so assigning either of them can diff
    # the M2M without lazy-loading inside the async session.
    result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id == task_id, Board.user_id == current_user.id)
        .options(selectinload(Task.tags), selectinload(Task.assignees))
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

    if task_in.archived is not None:
        await _set_archived(db, [task.id], task_in.archived)

    if task_in.requester_id is not None:
        if task_in.requester_id == 0:
            task.requester_id = None
        else:
            contact = await _fetch_caller_contact(
                db, current_user.id, task_in.requester_id
            )
            task.requester_id = contact.id

    if task_in.assignee_ids is not None:
        task.assignees = await _fetch_caller_contacts(
            db, current_user.id, task_in.assignee_ids
        )

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

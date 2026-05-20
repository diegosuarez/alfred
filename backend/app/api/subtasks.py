from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.database import get_db
from app.models.board import Board
from app.models.subtask import SubTask
from app.models.task import Task
from app.models.user import User
from app.schemas.subtask import SubTaskCreate, SubTaskResponse, SubTaskUpdate

router = APIRouter(prefix="", tags=["subtasks"])


async def _owned_task(db: AsyncSession, user_id: int, task_id: int) -> Task:
    """Return a task that belongs to the caller, or raise 404."""
    result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id == task_id, Board.user_id == user_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )
    return task


async def _owned_subtask(
    db: AsyncSession, user_id: int, subtask_id: int
) -> SubTask:
    result = await db.execute(
        select(SubTask)
        .join(Task, SubTask.task_id == Task.id)
        .join(Board, Task.board_id == Board.id)
        .filter(SubTask.id == subtask_id, Board.user_id == user_id)
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found"
        )
    return sub


@router.post("/tasks/{task_id}/subtasks", response_model=SubTaskResponse)
async def create_subtask(
    task_id: int,
    body: SubTaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_task(db, current_user.id, task_id)

    # Append at the end.
    pos_result = await db.execute(
        select(SubTask.position)
        .filter(SubTask.task_id == task_id)
        .order_by(SubTask.position.desc())
    )
    last = pos_result.scalars().first()
    next_position = (last + 1) if last is not None else 0

    sub = SubTask(task_id=task_id, title=body.title, position=next_position)
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.put("/subtasks/{subtask_id}", response_model=SubTaskResponse)
async def update_subtask(
    subtask_id: int,
    body: SubTaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sub = await _owned_subtask(db, current_user.id, subtask_id)

    if body.title is not None:
        sub.title = body.title
    if body.completed is not None:
        sub.completed = body.completed
    if body.position is not None:
        sub.position = body.position

    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    subtask_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sub = await _owned_subtask(db, current_user.id, subtask_id)
    await db.delete(sub)
    await db.commit()
    return None

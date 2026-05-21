from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.database import get_db
from app.models.board import Board
from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User
from app.schemas.reminder import ReminderCreate, ReminderResponse

router = APIRouter(prefix="", tags=["reminders"])


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


async def _owned_reminder(
    db: AsyncSession, user_id: int, reminder_id: int
) -> Reminder:
    result = await db.execute(
        select(Reminder)
        .join(Task, Reminder.task_id == Task.id)
        .join(Board, Task.board_id == Board.id)
        .filter(Reminder.id == reminder_id, Board.user_id == user_id)
    )
    rem = result.scalars().first()
    if not rem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found"
        )
    return rem


@router.post("/tasks/{task_id}/reminders", response_model=ReminderResponse)
async def create_reminder(
    task_id: int,
    body: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_task(db, current_user.id, task_id)
    # Strip the tz so it lines up with the rest of our naive-UTC schema
    # (SQLite drops tz on store anyway).
    naive = body.remind_at.replace(tzinfo=None)
    rem = Reminder(task_id=task_id, remind_at=naive)
    db.add(rem)
    await db.commit()
    await db.refresh(rem)
    return rem


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rem = await _owned_reminder(db, current_user.id, reminder_id)
    await db.delete(rem)
    await db.commit()
    return None


@router.get("/reminders/pending", response_model=List[ReminderResponse])
async def list_pending_reminders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Every reminder for the caller whose owning task is still live
    (i.e. not archived). Past-due ones are included so the SPA can fire
    them immediately when the user comes back online."""
    result = await db.execute(
        select(Reminder)
        .join(Task, Reminder.task_id == Task.id)
        .join(Board, Task.board_id == Board.id)
        .filter(
            Board.user_id == current_user.id,
            Task.archived_at.is_(None),
        )
        .order_by(Reminder.remind_at)
    )
    return result.scalars().all()

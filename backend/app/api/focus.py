from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.board import Board
from app.models.task import Task
from app.models.focus import FocusSession
from app.schemas.focus import FocusSessionCreate, FocusSessionResponse, FocusStatsResponse, DailyFocusStats

router = APIRouter(prefix="/focus", tags=["focus"])

@router.post("", response_model=FocusSessionResponse)
async def create_focus_session(
    session_in: FocusSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify that the task belongs to a board owned by this user
    task_result = await db.execute(
        select(Task).join(Board).filter(Task.id == session_in.task_id, Board.user_id == current_user.id)
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
        
    focus_session = FocusSession(
        task_id=session_in.task_id,
        duration=session_in.duration
    )
    db.add(focus_session)
    await db.commit()
    await db.refresh(focus_session)
    return focus_session

@router.get("/stats", response_model=FocusStatsResponse)
async def get_focus_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve all task IDs belonging to the user's boards
    tasks_result = await db.execute(
        select(Task.id).join(Board).filter(Board.user_id == current_user.id)
    )
    task_ids = tasks_result.scalars().all()
    
    if not task_ids:
        # Return empty stats if user has no tasks
        return {
            "total_focus_time": 0,
            "sessions_completed": 0,
            "daily_stats": [
                DailyFocusStats(
                    date=(datetime.utcnow() - timedelta(days=6-i)).strftime('%Y-%m-%d'),
                    total_seconds=0
                ) for i in range(7)
            ]
        }
        
    # Total focus time in seconds
    total_time_result = await db.execute(
        select(func.sum(FocusSession.duration)).filter(FocusSession.task_id.in_(task_ids))
    )
    total_focus_time = total_time_result.scalars().first() or 0
    
    # Total sessions count
    sessions_count_result = await db.execute(
        select(func.count(FocusSession.id)).filter(FocusSession.task_id.in_(task_ids))
    )
    sessions_completed = sessions_count_result.scalars().first() or 0
    
    # 7 Days Daily focus aggregation (SQLite specific format)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    date_format = func.strftime('%Y-%m-%d', FocusSession.created_at)
    
    daily_result = await db.execute(
        select(
            date_format.label("date"),
            func.sum(FocusSession.duration).label("duration")
        )
        .filter(FocusSession.task_id.in_(task_ids), FocusSession.created_at >= seven_days_ago)
        .group_by("date")
        .order_by("date")
    )
    
    rows = daily_result.all()
    stats_dict = {row.date: row.duration for row in rows}
    
    # Fill in missing dates to create a continuous 7-day series for the UI charts
    daily_stats = []
    for i in range(7):
        date_str = (datetime.utcnow() - timedelta(days=6-i)).strftime('%Y-%m-%d')
        daily_stats.append(
            DailyFocusStats(
                date=date_str,
                total_seconds=stats_dict.get(date_str, 0)
            )
        )
        
    return {
        "total_focus_time": total_focus_time,
        "sessions_completed": sessions_completed,
        "daily_stats": daily_stats
    }

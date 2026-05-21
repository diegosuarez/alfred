from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db
from app.api.deps import get_current_user
from app.api.tasks import _set_archived
from app.models.user import User
from app.models.board import Board
from app.models.column import Column
from app.models.task import Task
from app.schemas.column import ColumnCreate, ColumnUpdate, ColumnResponse, ColumnReorder
from app.schemas.task import ArchiveResultResponse, TaskResponse

router = APIRouter(prefix="", tags=["columns"])

@router.post("/boards/{board_id}/columns", response_model=ColumnResponse)
async def create_column(
    board_id: int,
    column_in: ColumnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify board ownership
    board_result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = board_result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found"
        )
        
    # Find next increment position
    pos_result = await db.execute(
        select(Column.position).filter(Column.board_id == board_id).order_by(Column.position.desc())
    )
    last_position = pos_result.scalars().first()
    next_position = (last_position + 1) if last_position is not None else 0
    
    col = Column(
        name=column_in.name,
        position=next_position,
        board_id=board_id
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return col

@router.put("/columns/{column_id}", response_model=ColumnResponse)
async def update_column(
    column_id: int,
    column_in: ColumnUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify column board ownership
    result = await db.execute(
        select(Column).join(Board).filter(Column.id == column_id, Board.user_id == current_user.id)
    )
    col = result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
        
    if column_in.name is not None:
        col.name = column_in.name
    if column_in.position is not None:
        col.position = column_in.position
        
    await db.commit()
    await db.refresh(col)
    return col

@router.delete("/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(
    column_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Column).join(Board).filter(Column.id == column_id, Board.user_id == current_user.id)
    )
    col = result.scalars().first()
    if not col:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
        
    await db.delete(col)
    await db.commit()
    return None

@router.post(
    "/columns/{column_id}/archive-all", response_model=ArchiveResultResponse
)
async def archive_all_in_column(
    column_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive every live top-level task in this column. Children get
    archived too via _set_archived's recursive walk."""
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

    roots_result = await db.execute(
        select(Task.id).filter(
            Task.column_id == column_id,
            Task.parent_task_id.is_(None),
            Task.archived_at.is_(None),
        )
    )
    root_ids = [r[0] for r in roots_result.all()]
    archived = await _set_archived(db, root_ids, True)
    await db.commit()
    return ArchiveResultResponse(archived=archived)


@router.get(
    "/columns/{column_id}/archived-tasks",
    response_model=List[TaskResponse],
)
async def list_archived_in_column(
    column_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    result = await db.execute(
        select(Task)
        .filter(
            Task.column_id == column_id,
            Task.parent_task_id.is_(None),
            Task.archived_at.is_not(None),
        )
        .options(
            selectinload(Task.tags),
            selectinload(Task.focus_sessions),
            selectinload(Task.requester),
            selectinload(Task.assignees),
            selectinload(Task.reminders),
            selectinload(Task.children).selectinload(Task.tags),
            selectinload(Task.children).selectinload(Task.focus_sessions),
            selectinload(Task.children).selectinload(Task.requester),
            selectinload(Task.children).selectinload(Task.assignees),
            selectinload(Task.children).selectinload(Task.reminders),
        )
        .order_by(Task.archived_at.desc())
    )
    return result.scalars().all()


@router.post("/boards/{board_id}/columns/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_columns(
    board_id: int,
    reorder: ColumnReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if board belongs to user
    board_result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = board_result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found"
        )
        
    # Bulk update column indices
    for idx, col_id in enumerate(reorder.column_ids):
        col_result = await db.execute(
            select(Column).filter(Column.id == col_id, Column.board_id == board_id)
        )
        col = col_result.scalars().first()
        if col:
            col.position = idx
            
    await db.commit()
    return None

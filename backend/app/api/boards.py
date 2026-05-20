from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.board import Board
from app.models.column import Column
from app.models.context import Context
from app.models.task import Task
from app.schemas.board import BoardCreate, BoardUpdate, BoardResponse, BoardDetailedResponse

router = APIRouter(prefix="/boards", tags=["boards"])

DEFAULT_CONTEXT_NAME = "General"


async def _ensure_default_context(db: AsyncSession, user_id: int) -> Context:
    """Return the user's default context, creating it on first use."""
    result = await db.execute(
        select(Context).filter(
            Context.user_id == user_id, Context.name == DEFAULT_CONTEXT_NAME
        )
    )
    ctx = result.scalars().first()
    if ctx:
        return ctx
    ctx = Context(user_id=user_id, name=DEFAULT_CONTEXT_NAME)
    db.add(ctx)
    await db.flush()
    return ctx


async def _resolve_context(
    db: AsyncSession, user_id: int, context_id: Optional[int]
) -> Context:
    if context_id is None:
        return await _ensure_default_context(db, user_id)
    result = await db.execute(
        select(Context).filter(Context.id == context_id, Context.user_id == user_id)
    )
    ctx = result.scalars().first()
    if not ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid context_id",
        )
    return ctx


@router.get("", response_model=List[BoardResponse])
async def get_boards(
    context_id: Optional[int] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Board).filter(Board.user_id == current_user.id)
    if context_id is not None:
        stmt = stmt.filter(Board.context_id == context_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=BoardResponse)
async def create_board(
    board_in: BoardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ctx = await _resolve_context(db, current_user.id, board_in.context_id)

    board = Board(
        name=board_in.name,
        description=board_in.description,
        user_id=current_user.id,
        context_id=ctx.id,
    )
    db.add(board)
    await db.flush()

    # Automatically initialize default workflow columns
    default_columns = ["Pendiente", "En Proceso", "Completado"]
    for idx, col_name in enumerate(default_columns):
        col = Column(name=col_name, position=idx, board_id=board.id)
        db.add(col)

    await db.commit()
    await db.refresh(board)
    return board


@router.get("/{board_id}", response_model=BoardDetailedResponse)
async def get_board_detail(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Board)
        .filter(Board.id == board_id, Board.user_id == current_user.id)
        .options(
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.focus_sessions)
        )
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found"
        )
    return board


@router.put("/{board_id}", response_model=BoardResponse)
async def update_board(
    board_id: int,
    board_in: BoardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found"
        )

    if board_in.name is not None:
        board.name = board_in.name
    if board_in.description is not None:
        board.description = board_in.description
    if board_in.context_id is not None:
        ctx = await _resolve_context(db, current_user.id, board_in.context_id)
        board.context_id = ctx.id

    await db.commit()
    await db.refresh(board)
    return board


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found"
        )

    await db.delete(board)
    await db.commit()
    return None

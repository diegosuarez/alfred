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
from app.schemas.column import ColumnDetailedResponse
from app.schemas.task import TaskResponse

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
        icon=board_in.icon,
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
            .selectinload(Task.focus_sessions),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.tags),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.requester),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.assignees),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.reminders),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.attachments),
            # Eager-load children + their relationships so the nested
            # rendering on the kanban card has everything it needs.
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.tags),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.focus_sessions),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.requester),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.assignees),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.reminders),
            selectinload(Board.columns)
            .selectinload(Column.tasks)
            .selectinload(Task.children)
            .selectinload(Task.attachments),
        )
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Board not found"
        )

    # Build the response manually so we can filter child tasks out of
    # the top-level Column.tasks list WITHOUT mutating the ORM
    # relationship. Mutating col.tasks here would orphan the children
    # and the cascade="all, delete-orphan" on Column.tasks would
    # silently delete them when get_db commits the session.
    def _live(task: Task) -> bool:
        return task.parent_task_id is None and task.archived_at is None

    def _to_response(task: Task) -> TaskResponse:
        # Strip archived children out of the nested list before Pydantic
        # walks them, so the kanban view never shows archived rows.
        live_children = [c for c in task.children if c.archived_at is None]
        # Temporarily swap the attribute on a transient copy so we don't
        # touch the ORM-managed collection (delete-orphan would fire on
        # commit otherwise).
        from sqlalchemy.orm.attributes import set_committed_value

        set_committed_value(task, "children", live_children)
        return TaskResponse.model_validate(task)

    return BoardDetailedResponse(
        id=board.id,
        name=board.name,
        description=board.description,
        user_id=board.user_id,
        context_id=board.context_id,
        created_at=board.created_at,
        updated_at=board.updated_at,
        columns=[
            ColumnDetailedResponse(
                id=col.id,
                name=col.name,
                position=col.position,
                board_id=col.board_id,
                created_at=col.created_at,
                updated_at=col.updated_at,
                tasks=[_to_response(t) for t in col.tasks if _live(t)],
            )
            for col in board.columns
        ],
    )


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
    if board_in.icon is not None:
        # Empty string means "clear back to the default folder fallback".
        board.icon = board_in.icon or None

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

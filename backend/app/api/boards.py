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
from app.schemas.board import BoardCreate, BoardUpdate, BoardResponse, BoardDetailedResponse

router = APIRouter(prefix="/boards", tags=["boards"])

@router.get("", response_model=List[BoardResponse])
async def get_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch all boards belonging to the logged-in user
    result = await db.execute(
        select(Board).filter(Board.user_id == current_user.id)
    )
    return result.scalars().all()

@router.post("", response_model=BoardResponse)
async def create_board(
    board_in: BoardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Create the board
    board = Board(
        name=board_in.name,
        description=board_in.description,
        user_id=current_user.id
    )
    db.add(board)
    await db.flush()  # Extract the board.id before committing

    # Automatically initialize default workflow columns
    default_columns = ["Pendiente", "En Proceso", "Completado"]
    for idx, col_name in enumerate(default_columns):
        col = Column(
            name=col_name,
            position=idx,
            board_id=board.id
        )
        db.add(col)

    await db.commit()
    await db.refresh(board)
    return board

@router.get("/{board_id}", response_model=BoardDetailedResponse)
async def get_board_detail(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Load Board along with its columns and their tasks recursively
    result = await db.execute(
        select(Board)
        .filter(Board.id == board_id, Board.user_id == current_user.id)
        .options(
            selectinload(Board.columns).selectinload(Column.tasks)
        )
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found"
        )
    return board

@router.put("/{board_id}", response_model=BoardResponse)
async def update_board(
    board_id: int,
    board_in: BoardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found"
        )
    
    if board_in.name is not None:
        board.name = board_in.name
    if board_in.description is not None:
        board.description = board_in.description
        
    await db.commit()
    await db.refresh(board)
    return board

@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Board).filter(Board.id == board_id, Board.user_id == current_user.id)
    )
    board = result.scalars().first()
    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found"
        )
    
    await db.delete(board)
    await db.commit()
    return None

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select
from typing import List

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.context import Context
from app.schemas.context import ContextCreate, ContextUpdate, ContextResponse

router = APIRouter(prefix="/contexts", tags=["contexts"])


@router.get("", response_model=List[ContextResponse])
async def list_contexts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Context).filter(Context.user_id == current_user.id).order_by(Context.id)
    )
    return result.scalars().all()


@router.post("", response_model=ContextResponse)
async def create_context(
    ctx_in: ContextCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ctx = Context(
        name=ctx_in.name,
        color=ctx_in.color,
        user_id=current_user.id,
    )
    db.add(ctx)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A context with that name already exists",
        )
    await db.refresh(ctx)
    return ctx


@router.put("/{context_id}", response_model=ContextResponse)
async def update_context(
    context_id: int,
    ctx_in: ContextUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Context).filter(Context.id == context_id, Context.user_id == current_user.id)
    )
    ctx = result.scalars().first()
    if not ctx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Context not found",
        )

    if ctx_in.name is not None:
        ctx.name = ctx_in.name
    if ctx_in.color is not None:
        ctx.color = ctx_in.color

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A context with that name already exists",
        )
    await db.refresh(ctx)
    return ctx


@router.delete("/{context_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_context(
    context_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Context).filter(Context.id == context_id, Context.user_id == current_user.id)
    )
    ctx = result.scalars().first()
    if not ctx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Context not found",
        )

    # Refuse to drop the last remaining context — boards have nowhere to land.
    count_result = await db.execute(
        select(Context).filter(Context.user_id == current_user.id)
    )
    if len(count_result.scalars().all()) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the only context",
        )

    await db.delete(ctx)
    await db.commit()
    return None

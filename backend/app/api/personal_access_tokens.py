from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.core.pat import mint_token
from app.core.time import utcnow
from app.database import get_db
from app.models.personal_access_token import PersonalAccessToken
from app.models.user import User
from app.schemas.personal_access_token import (
    PATCreate,
    PATCreateResponse,
    PATResponse,
)

router = APIRouter(prefix="/pats", tags=["personal-access-tokens"])


@router.get("", response_model=List[PATResponse])
async def list_pats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PersonalAccessToken)
        .filter(PersonalAccessToken.user_id == current_user.id)
        .order_by(PersonalAccessToken.id)
    )
    return result.scalars().all()


@router.post("", response_model=PATCreateResponse)
async def create_pat(
    body: PATCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    full_token, lookup_prefix, token_hash = mint_token()
    pat = PersonalAccessToken(
        user_id=current_user.id,
        name=body.name,
        prefix=lookup_prefix,
        token_hash=token_hash,
        expires_at=body.expires_at,
    )
    db.add(pat)
    await db.commit()
    await db.refresh(pat)

    # The plaintext token is returned exactly once.
    return PATCreateResponse(
        id=pat.id,
        name=pat.name,
        prefix=pat.prefix,
        created_at=pat.created_at,
        last_used_at=pat.last_used_at,
        expires_at=pat.expires_at,
        revoked_at=pat.revoked_at,
        token=full_token,
    )


@router.delete("/{pat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_pat(
    pat_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PersonalAccessToken).filter(
            PersonalAccessToken.id == pat_id,
            PersonalAccessToken.user_id == current_user.id,
        )
    )
    pat = result.scalars().first()
    if not pat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
        )

    # Soft delete so audit trails (last_used_at, history) survive.
    pat.revoked_at = utcnow()
    await db.commit()
    return None

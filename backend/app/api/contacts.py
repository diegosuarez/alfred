from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.database import get_db
from app.models.contact import Contact
from app.models.user import User
from app.schemas.contact import ContactCreate, ContactResponse, ContactUpdate

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=List[ContactResponse])
async def list_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Favorites first, then alphabetically by name — matches the order the
    # contact picker on the SPA will render.
    result = await db.execute(
        select(Contact)
        .filter(Contact.user_id == current_user.id)
        .order_by(Contact.is_favorite.desc(), Contact.name)
    )
    return result.scalars().all()


@router.post("", response_model=ContactResponse)
async def create_contact(
    body: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    contact = Contact(
        user_id=current_user.id,
        name=body.name,
        email=body.email,
        image_url=body.image_url,
        is_favorite=body.is_favorite,
    )
    db.add(contact)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A contact with that email already exists",
        )
    await db.refresh(contact)
    return contact


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    body: ContactUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).filter(
            Contact.id == contact_id, Contact.user_id == current_user.id
        )
    )
    contact = result.scalars().first()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )

    if body.name is not None:
        contact.name = body.name
    if body.email is not None:
        contact.email = body.email
    if body.image_url is not None:
        contact.image_url = body.image_url
    if body.is_favorite is not None:
        contact.is_favorite = body.is_favorite

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A contact with that email already exists",
        )
    await db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).filter(
            Contact.id == contact_id, Contact.user_id == current_user.id
        )
    )
    contact = result.scalars().first()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )
    # FK rules: task.requester_id → SET NULL, task_assignees rows →
    # CASCADE delete via the M2M table. The tasks survive.
    await db.delete(contact)
    await db.commit()
    return None

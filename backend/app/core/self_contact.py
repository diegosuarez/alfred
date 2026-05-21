"""The 'Yo mismo' contact — a synthetic Contact representing the user.

Created once per user (on first register / Google login / lifespan backfill)
and used as the default assignee for new tasks. It is exempted from
context scoping in the listing endpoint and cannot be deleted.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.contact import Contact
from app.models.user import User

SELF_CONTACT_NAME = "Yo mismo"


async def get_self_contact(db: AsyncSession, user_id: int) -> Contact | None:
    result = await db.execute(
        select(Contact).filter(
            Contact.user_id == user_id, Contact.is_self.is_(True)
        )
    )
    return result.scalars().first()


async def ensure_self_contact(db: AsyncSession, user: User) -> Contact:
    """Idempotent: return the user's self-contact, creating it if missing.
    Caller is responsible for committing the surrounding transaction."""
    existing = await get_self_contact(db, user.id)
    if existing:
        return existing
    contact = Contact(
        user_id=user.id,
        name=SELF_CONTACT_NAME,
        email=user.email,
        is_self=True,
    )
    db.add(contact)
    await db.flush()
    return contact

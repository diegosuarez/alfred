from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.core import push as push_helper
from app.core.push import get_vapid_keys
from app.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push import (
    PushSubscribeRequest,
    PushSubscribeResponse,
    VapidPublicKeyResponse,
)

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key():
    """The browser needs this to call PushManager.subscribe with the
    right applicationServerKey. Public, no auth needed."""
    return VapidPublicKeyResponse(public_key=get_vapid_keys().public_b64url)


@router.post("/subscribe", response_model=PushSubscribeResponse)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a browser's PushManager subscription. If the same
    endpoint was previously registered (any user), the row is rebound
    to the current caller — a tab logging in as someone else replaces
    the prior owner."""
    result = await db.execute(
        select(PushSubscription).filter(PushSubscription.endpoint == body.endpoint)
    )
    existing = result.scalars().first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        await db.commit()
        await db.refresh(existing)
        return PushSubscribeResponse(id=existing.id)

    sub = PushSubscription(
        user_id=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return PushSubscribeResponse(id=sub.id)


@router.post("/test")
async def test_push(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a one-off test notification to every push subscription the
    caller has registered. Useful for verifying the SW + VAPID chain
    without having to wait for a real reminder. Returns per-subscription
    delivery status so the SPA can show the user what happened."""
    result = await db.execute(
        select(PushSubscription).filter(PushSubscription.user_id == current_user.id)
    )
    subs = result.scalars().all()
    if not subs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No push subscriptions found for this user. "
                "Open the app and accept the notification prompt first."
            ),
        )

    outcomes = []
    for sub in subs:
        ok, status_code = push_helper.send_push(
            sub.endpoint,
            sub.p256dh,
            sub.auth,
            {
                "title": "Alfred — prueba",
                "body": "Si ves esto, las notificaciones funcionan ✅",
                "tag": "alfred-test",
            },
        )
        outcomes.append(
            {"endpoint": sub.endpoint[:60] + "…", "ok": ok, "status_code": status_code}
        )
    return {"sent": outcomes}


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Drop a subscription. Body only needs `endpoint`; keys are ignored
    so the SPA can reuse PushSubscribeRequest as its payload shape."""
    result = await db.execute(
        select(PushSubscription).filter(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found",
        )
    await db.delete(sub)
    await db.commit()
    return None

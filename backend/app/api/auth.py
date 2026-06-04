import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import google_oauth
from app.core.config import settings
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.core.self_contact import ensure_self_contact
from app.database import get_db
from app.models.google_account import GoogleAccount
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookie carries the same signed blob we send as `state` to Google, so
# we can verify a redirect is the response to a request *we* started.
_STATE_COOKIE = "alfred_oauth_state"
_STATE_MAX_AGE_SECONDS = 600  # 10 minutes is plenty for a redirect roundtrip
_STATE_COOKIE_PATH = "/api/auth/google"
_state_signer = URLSafeTimedSerializer(settings.JWT_SECRET, salt="alfred-oauth-state")


def build_oauth_state(user_id: int | None = None, scopes: list[str] | None = None) -> str:
    """Pack the OAuth state as a signed dict. When user_id is set we treat
    the callback as a connect-to-existing-user flow (Fase 3) instead of a
    login lookup."""
    return _state_signer.dumps({
        "nonce": secrets.token_urlsafe(16),
        "user_id": user_id,
        "scopes": scopes or google_oauth.LOGIN_SCOPES,
    })


def verify_oauth_state(state: str, cookie_state: str | None) -> dict:
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    try:
        return _state_signer.loads(state, max_age=_STATE_MAX_AGE_SECONDS)
    except BadSignature:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

def _require_registration_open() -> None:
    """Self-registration is gated behind REGISTRATION_OPEN so a publicly
    reachable Alfred doesn't grow strangers' accounts. Existing users
    keep logging in normally; only the create-new-user paths are
    affected."""
    if not settings.REGISTRATION_OPEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is closed on this server.",
        )


@router.get("/registration-status")
async def registration_status() -> dict:
    """Lets the SPA decide whether to render the 'Sign up' UI and whether
    a Google sign-in could land a new user (vs. only existing ones)."""
    return {"open": settings.REGISTRATION_OPEN}


@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    _require_registration_open()
    # Check if email is already taken
    result = await db.execute(select(User).filter(User.email == user_in.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The user with this email already exists."
        )

    db_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password)
    )
    db.add(db_user)
    await db.flush()
    await ensure_self_contact(db, db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # Verify user credentials
    result = await db.execute(select(User).filter(User.email == form_data.username))
    user = result.scalars().first()
    if not user or not user.hashed_password or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return {"access_token": access_token, "token_type": "bearer"}


class GoogleIdTokenRequest(BaseModel):
    id_token: str


@router.post("/google/native", response_model=Token)
async def google_native(
    body: GoogleIdTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a Google ID token (from a native client like the Android
    app) for an internal Alfred JWT. Verifies the ID token against
    Google's tokeninfo endpoint; the accepted audiences live in
    GOOGLE_CLIENT_ID + GOOGLE_NATIVE_AUDIENCES."""
    _require_google_configured()
    try:
        info = await google_oauth.verify_id_token(body.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        )
    email = info.get("email")
    google_sub = info.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="ID token missing email/sub")

    user = (
        await db.execute(select(User).filter(User.email == email))
    ).scalars().first()
    if not user:
        # Google sign-in is also a registration vector — gate it the
        # same way the email/password flow is gated, otherwise opening
        # Google auth on a public deploy silently re-opens signups.
        _require_registration_open()
        user = User(email=email, hashed_password=None)
        db.add(user)
        await db.flush()
        await ensure_self_contact(db, user)

    # Upsert a GoogleAccount row so the native sign-in still feeds the
    # avatar / display name into the SPA sidebar.
    account = (
        await db.execute(
            select(GoogleAccount).filter(
                GoogleAccount.user_id == user.id,
                GoogleAccount.google_user_id == google_sub,
            )
        )
    ).scalars().first()
    if account is None:
        account = GoogleAccount(
            user_id=user.id, google_user_id=google_sub, email=email,
        )
        db.add(account)
    if info.get("name"):
        account.display_name = info["name"]
    if info.get("picture"):
        account.picture_url = info["picture"]

    await db.commit()
    await db.refresh(user)
    jwt_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return {"access_token": jwt_token, "token_type": "bearer"}


def _require_google_configured() -> None:
    """Public alias re-exported for sibling routers (google_accounts)."""
    if not google_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server",
        )


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    """Kick off the Google OAuth2 authorization-code flow for a NEW
    session (anonymous caller). Connecting an additional account to an
    already-logged-in user lives in app.api.google_accounts.
    """
    _require_google_configured()
    state = build_oauth_state()

    response = RedirectResponse(url=google_oauth.build_authorize_url(state=state))
    response.set_cookie(
        _STATE_COOKIE,
        state,
        max_age=_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.APP_URL.startswith("https://"),
        path=_STATE_COOKIE_PATH,
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Finish the Google OAuth2 flow: exchange code, link/create user, redirect
    to the frontend with our own JWT in the query string.
    """
    _require_google_configured()

    if error:
        return _frontend_redirect(error=error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    cookie_state = request.cookies.get(_STATE_COOKIE)
    payload = verify_oauth_state(state, cookie_state)

    token_payload = await google_oauth.exchange_code_for_token(
        code=code, redirect_uri=google_oauth.build_redirect_uri()
    )
    userinfo = await google_oauth.fetch_userinfo(token_payload["access_token"])

    email = userinfo.get("email")
    google_sub = userinfo.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    link_user_id = payload.get("user_id")
    if link_user_id is not None:
        # Connect-to-current-user flow: the caller was already logged in
        # when they started this. The state cookie pinned the user_id, so
        # we trust it here even though the caller is anonymous from the
        # callback's perspective.
        user = (
            await db.execute(select(User).filter(User.id == link_user_id))
        ).scalars().first()
        if not user:
            raise HTTPException(status_code=400, detail="Link target user no longer exists")
    else:
        user = (
            await db.execute(select(User).filter(User.email == email))
        ).scalars().first()
        if not user:
            # First Google login from an unknown email would create a
            # passwordless User — i.e. a backdoor registration when the
            # email/password form is closed. Honor REGISTRATION_OPEN here
            # too and surface the error back to the SPA via the redirect.
            if not settings.REGISTRATION_OPEN:
                return _frontend_redirect(error="registration_closed")
            user = User(email=email, hashed_password=None)
            db.add(user)
            await db.flush()
            await ensure_self_contact(db, user)

    account = (
        await db.execute(
            select(GoogleAccount).filter(
                GoogleAccount.user_id == user.id,
                GoogleAccount.google_user_id == google_sub,
            )
        )
    ).scalars().first()
    if account is None:
        account = GoogleAccount(
            user_id=user.id,
            google_user_id=google_sub,
            email=email,
        )
        db.add(account)
    account.access_token = token_payload.get("access_token")
    if token_payload.get("refresh_token"):
        account.refresh_token = token_payload["refresh_token"]
    account.scopes = token_payload.get("scope", " ".join(google_oauth.LOGIN_SCOPES))
    account.expires_at = google_oauth.compute_expires_at(token_payload.get("expires_in"))
    # Refresh the profile snapshot on every login so renames/avatar
    # changes on Google's side propagate without manual action.
    if userinfo.get("name"):
        account.display_name = userinfo["name"]
    if userinfo.get("picture"):
        account.picture_url = userinfo["picture"]

    await db.commit()
    await db.refresh(user)

    if link_user_id is None:
        jwt_token = create_access_token(data={"sub": user.email, "user_id": user.id})
        redirect = _frontend_redirect(token=jwt_token)
    else:
        # Connect flow: caller already has a session, just go back to settings.
        redirect = RedirectResponse(
            url=f"{settings.FRONTEND_URL.rstrip('/')}/?google_connected=1"
        )
    redirect.delete_cookie(_STATE_COOKIE, path=_STATE_COOKIE_PATH)
    return redirect


def _frontend_redirect(
    token: str | None = None, error: str | None = None
) -> RedirectResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    if token:
        return RedirectResponse(url=f"{base}/?token={token}")
    if error:
        return RedirectResponse(url=f"{base}/?oauth_error={error}")
    return RedirectResponse(url=base)

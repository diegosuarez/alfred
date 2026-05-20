import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core import google_oauth
from app.core.config import settings
from app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.database import get_db
from app.models.google_account import GoogleAccount
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookie carries a signed nonce we expect back as `state` from Google.
_STATE_COOKIE = "alfred_oauth_state"
_STATE_MAX_AGE_SECONDS = 600  # 10 minutes is plenty for a redirect roundtrip
_state_signer = URLSafeTimedSerializer(settings.JWT_SECRET, salt="alfred-oauth-state")

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
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


def _require_google_configured() -> None:
    if not google_oauth.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server",
        )


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    """Kick off the Google OAuth2 authorization-code flow."""
    _require_google_configured()
    nonce = secrets.token_urlsafe(32)
    signed = _state_signer.dumps(nonce)

    response = RedirectResponse(url=google_oauth.build_authorize_url(state=signed))
    response.set_cookie(
        _STATE_COOKIE,
        signed,
        max_age=_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.APP_URL.startswith("https://"),
        path="/api/auth/google",
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
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    try:
        _state_signer.loads(state, max_age=_STATE_MAX_AGE_SECONDS)
    except BadSignature:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    token_payload = await google_oauth.exchange_code_for_token(
        code=code, redirect_uri=google_oauth.build_redirect_uri()
    )
    userinfo = await google_oauth.fetch_userinfo(token_payload["access_token"])

    email = userinfo.get("email")
    google_sub = userinfo.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    user = (
        await db.execute(select(User).filter(User.email == email))
    ).scalars().first()
    if not user:
        # First Google login from an unknown email creates a passwordless User.
        user = User(email=email, hashed_password=None)
        db.add(user)
        await db.flush()

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

    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    redirect = _frontend_redirect(token=jwt_token)
    redirect.delete_cookie(_STATE_COOKIE, path="/api/auth/google")
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

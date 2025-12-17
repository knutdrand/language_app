from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import (
    User,
    UserCreate,
    UserResponse,
    RefreshToken,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
)
from app.auth.password import get_password_hash, verify_password
from app.auth.jwt import create_access_token, create_refresh_token, hash_refresh_token
from app.auth.dependencies import get_current_active_user
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Register a new user account.

    - **email**: Valid email address (must be unique)
    - **password**: Password (min 8 characters recommended)
    - **display_name**: Optional display name
    """
    # Check if email already exists
    result = await session.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        display_name=user_data.display_name,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Authenticate user and return access and refresh tokens.

    - **email**: User's email address
    - **password**: User's password
    """
    # Find user by email
    result = await session.execute(select(User).where(User.email == login_data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # Create tokens
    access_token = create_access_token(user.id)
    raw_refresh_token, token_hash, expires_at = create_refresh_token()

    # Store refresh token in database
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(refresh_token)
    await session.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Get a new access token using a refresh token.

    Implements token rotation: the old refresh token is revoked
    and a new one is issued.
    """
    # Hash the provided token to look it up
    token_hash = hash_refresh_token(refresh_data.refresh_token)

    # Find the refresh token
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
        )
    )
    stored_token = result.scalar_one_or_none()

    if not stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check if token is expired
    if stored_token.expires_at < datetime.utcnow():
        stored_token.revoked = True
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    # Revoke the old refresh token (rotation)
    stored_token.revoked = True

    # Get the user
    result = await session.execute(select(User).where(User.id == stored_token.user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Create new tokens
    access_token = create_access_token(user.id)
    raw_refresh_token, new_token_hash, expires_at = create_refresh_token()

    # Store new refresh token
    new_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=expires_at,
    )
    session.add(new_refresh_token)
    await session.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_data: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Logout by revoking the refresh token.

    The access token will still be valid until it expires,
    but no new tokens can be obtained with this refresh token.
    """
    token_hash = hash_refresh_token(refresh_data.refresh_token)

    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored_token = result.scalar_one_or_none()

    if stored_token:
        stored_token.revoked = True
        await session.commit()

    # Always return success (don't reveal if token existed)
    return None


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """
    Get the current authenticated user's information.

    Requires a valid access token in the Authorization header.
    """
    return current_user

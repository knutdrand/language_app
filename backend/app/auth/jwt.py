from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
import secrets
import hashlib

from app.config import get_settings

settings = get_settings()


def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": user_id,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> tuple[str, str, datetime]:
    """
    Create a refresh token.

    Returns:
        tuple: (raw_token, token_hash, expires_at)
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return raw_token, token_hash, expires_at


def hash_refresh_token(raw_token: str) -> str:
    """Hash a refresh token for storage/comparison."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT access token.

    Returns:
        dict with token payload if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None

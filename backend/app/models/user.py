from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
import uuid


class UserBase(SQLModel):
    """Base user model with shared fields."""
    email: str = Field(unique=True, index=True)
    display_name: Optional[str] = None


class User(UserBase, table=True):
    """User database model."""
    __tablename__ = "users"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)


class UserCreate(SQLModel):
    """Schema for user registration."""
    email: str
    password: str
    display_name: Optional[str] = None


class UserResponse(SQLModel):
    """Schema for user response (excludes password)."""
    id: str
    email: str
    display_name: Optional[str]
    created_at: datetime
    is_active: bool


class RefreshToken(SQLModel, table=True):
    """Refresh token database model for token rotation."""
    __tablename__ = "refresh_tokens"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked: bool = Field(default=False)


class LoginRequest(SQLModel):
    """Schema for login request."""
    email: str
    password: str


class TokenResponse(SQLModel):
    """Schema for token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access token expires


class RefreshRequest(SQLModel):
    """Schema for token refresh request."""
    refresh_token: str

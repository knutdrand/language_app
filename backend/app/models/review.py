from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import SQLModel, Field


class ReviewBase(SQLModel):
    """Shared fields for review data."""

    word_id: int = Field(foreign_key="words.id", index=True)
    correct: bool


class Review(ReviewBase, table=True):
    """Review database model."""

    __tablename__ = "reviews"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    reviewed_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ReviewCreate(SQLModel):
    """Schema for creating a review."""

    word_id: int
    correct: bool
    timestamp: Optional[int] = None


class ReviewResponse(SQLModel):
    """Schema for review response."""

    id: str
    user_id: str
    word_id: int
    correct: bool
    reviewed_at: datetime


class ProgressResponse(SQLModel):
    """Progress summary response."""

    reviews_today: int
    correct_today: int
    last_review_date: str
    total_reviews: int
    total_correct: int

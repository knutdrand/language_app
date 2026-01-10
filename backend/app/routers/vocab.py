"""Vocabulary endpoints for words, reviews, and progress."""

from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.auth.dependencies import get_current_active_user
from app.database import get_session
from app.models.review import Review, ReviewCreate, ReviewResponse, ProgressResponse
from app.models.user import User
from app.models.word import Word, WordRead

router = APIRouter()


def normalize_timestamp(timestamp: Optional[int]) -> datetime:
    """Convert optional epoch timestamp to UTC datetime."""
    if timestamp is None:
        return datetime.utcnow()
    if timestamp > 1_000_000_000_000:
        return datetime.utcfromtimestamp(timestamp / 1000)
    return datetime.utcfromtimestamp(timestamp)


@router.get("/words", response_model=list[WordRead])
async def list_words(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    """List available words."""
    stmt = select(Word).order_by(Word.id).offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    review: ReviewCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Record a review for a word."""
    word_result = await session.execute(select(Word.id).where(Word.id == review.word_id))
    if word_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word not found")

    review_entry = Review(
        user_id=current_user.id,
        word_id=review.word_id,
        correct=review.correct,
        reviewed_at=normalize_timestamp(review.timestamp),
    )
    session.add(review_entry)
    await session.commit()
    await session.refresh(review_entry)
    return review_entry


@router.get("/progress", response_model=ProgressResponse)
async def get_progress(
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get progress stats for the current user."""
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    total_reviews_result = await session.execute(
        select(func.count(Review.id)).where(Review.user_id == current_user.id)
    )
    total_reviews = total_reviews_result.scalar_one()

    total_correct_result = await session.execute(
        select(func.count(Review.id)).where(
            Review.user_id == current_user.id,
            Review.correct.is_(True),
        )
    )
    total_correct = total_correct_result.scalar_one()

    reviews_today_result = await session.execute(
        select(func.count(Review.id)).where(
            Review.user_id == current_user.id,
            Review.reviewed_at >= start_of_day,
            Review.reviewed_at < end_of_day,
        )
    )
    reviews_today = reviews_today_result.scalar_one()

    correct_today_result = await session.execute(
        select(func.count(Review.id)).where(
            Review.user_id == current_user.id,
            Review.correct.is_(True),
            Review.reviewed_at >= start_of_day,
            Review.reviewed_at < end_of_day,
        )
    )
    correct_today = correct_today_result.scalar_one()

    last_review_result = await session.execute(
        select(func.max(Review.reviewed_at)).where(Review.user_id == current_user.id)
    )
    last_review_at = last_review_result.scalar_one_or_none()

    last_review_date = last_review_at.date().isoformat() if last_review_at else ""

    return ProgressResponse(
        reviews_today=reviews_today,
        correct_today=correct_today,
        last_review_date=last_review_date,
        total_reviews=total_reviews,
        total_correct=total_correct,
    )

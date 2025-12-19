"""
Sync router for authenticated user progress synchronization.

Provides endpoints to sync FSRS card states and progress stats
across devices for authenticated users.
"""
from typing import Annotated
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User
from app.models.progress import (
    UserWordCard,
    UserToneCard,
    UserProgress,
    WordCardSync,
    ToneCardSync,
    SyncRequest,
    SyncResponse,
)
from app.auth.dependencies import get_current_active_user

router = APIRouter()


def get_today_string() -> str:
    return datetime.now().strftime("%Y-%m-%d")


@router.get("/sync", response_model=SyncResponse)
async def get_sync_data(
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get all user's sync data (word cards, tone cards, progress)."""
    # Get word cards
    word_cards_result = await session.execute(
        select(UserWordCard).where(UserWordCard.user_id == current_user.id)
    )
    word_cards = word_cards_result.scalars().all()

    # Get tone cards
    tone_cards_result = await session.execute(
        select(UserToneCard).where(UserToneCard.user_id == current_user.id)
    )
    tone_cards = tone_cards_result.scalars().all()

    # Get progress
    progress_result = await session.execute(
        select(UserProgress).where(UserProgress.user_id == current_user.id)
    )
    progress = progress_result.scalar_one_or_none()

    # Create default progress if none exists
    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            last_review_date=get_today_string(),
        )
        session.add(progress)
        await session.commit()
        await session.refresh(progress)

    # Reset daily stats if new day
    today = get_today_string()
    if progress.last_review_date != today:
        progress.reviews_today = 0
        progress.correct_today = 0
        progress.last_review_date = today
        progress.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(progress)

    return SyncResponse(
        word_cards=[
            WordCardSync(word_id=wc.word_id, card=wc.card_data)
            for wc in word_cards
        ],
        tone_cards=[
            ToneCardSync(
                sequence_key=tc.sequence_key,
                card=tc.card_data,
                correct=tc.correct,
                total=tc.total,
            )
            for tc in tone_cards
        ],
        progress={
            "reviews_today": progress.reviews_today,
            "correct_today": progress.correct_today,
            "last_review_date": progress.last_review_date,
            "total_reviews": progress.total_reviews,
            "total_correct": progress.total_correct,
        },
        confusion_state=progress.confusion_state,
    )


@router.put("/sync")
async def update_sync_data(
    sync_data: SyncRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update user's sync data (word cards, tone cards, progress)."""
    now = datetime.utcnow()

    # Update word cards
    for wc_sync in sync_data.word_cards:
        result = await session.execute(
            select(UserWordCard).where(
                UserWordCard.user_id == current_user.id,
                UserWordCard.word_id == wc_sync.word_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.card_data = wc_sync.card
            existing.updated_at = now
        else:
            new_card = UserWordCard(
                user_id=current_user.id,
                word_id=wc_sync.word_id,
                card_data=wc_sync.card,
                updated_at=now,
            )
            session.add(new_card)

    # Update tone cards
    for tc_sync in sync_data.tone_cards:
        result = await session.execute(
            select(UserToneCard).where(
                UserToneCard.user_id == current_user.id,
                UserToneCard.sequence_key == tc_sync.sequence_key,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.card_data = tc_sync.card
            existing.correct = tc_sync.correct
            existing.total = tc_sync.total
            existing.updated_at = now
        else:
            new_card = UserToneCard(
                user_id=current_user.id,
                sequence_key=tc_sync.sequence_key,
                card_data=tc_sync.card,
                correct=tc_sync.correct,
                total=tc_sync.total,
                updated_at=now,
            )
            session.add(new_card)

    # Update progress
    if sync_data.progress:
        result = await session.execute(
            select(UserProgress).where(UserProgress.user_id == current_user.id)
        )
        progress = result.scalar_one_or_none()

        if progress:
            progress.reviews_today = sync_data.progress.get("reviews_today", 0)
            progress.correct_today = sync_data.progress.get("correct_today", 0)
            progress.last_review_date = sync_data.progress.get("last_review_date", get_today_string())
            progress.total_reviews = sync_data.progress.get("total_reviews", 0)
            progress.total_correct = sync_data.progress.get("total_correct", 0)
            if sync_data.confusion_state is not None:
                progress.confusion_state = sync_data.confusion_state
            progress.updated_at = now
        else:
            new_progress = UserProgress(
                user_id=current_user.id,
                reviews_today=sync_data.progress.get("reviews_today", 0),
                correct_today=sync_data.progress.get("correct_today", 0),
                last_review_date=sync_data.progress.get("last_review_date", get_today_string()),
                total_reviews=sync_data.progress.get("total_reviews", 0),
                total_correct=sync_data.progress.get("total_correct", 0),
                confusion_state=sync_data.confusion_state,
                updated_at=now,
            )
            session.add(new_progress)

    await session.commit()
    return {"status": "ok"}


@router.put("/sync/word-card/{word_id}")
async def update_word_card(
    word_id: int,
    card_sync: WordCardSync,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update a single word card."""
    now = datetime.utcnow()

    result = await session.execute(
        select(UserWordCard).where(
            UserWordCard.user_id == current_user.id,
            UserWordCard.word_id == word_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.card_data = card_sync.card
        existing.updated_at = now
    else:
        new_card = UserWordCard(
            user_id=current_user.id,
            word_id=word_id,
            card_data=card_sync.card,
            updated_at=now,
        )
        session.add(new_card)

    await session.commit()
    return {"status": "ok", "word_id": word_id}


@router.put("/sync/tone-card/{sequence_key}")
async def update_tone_card(
    sequence_key: str,
    card_sync: ToneCardSync,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update a single tone card."""
    now = datetime.utcnow()

    result = await session.execute(
        select(UserToneCard).where(
            UserToneCard.user_id == current_user.id,
            UserToneCard.sequence_key == sequence_key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.card_data = card_sync.card
        existing.correct = card_sync.correct
        existing.total = card_sync.total
        existing.updated_at = now
    else:
        new_card = UserToneCard(
            user_id=current_user.id,
            sequence_key=sequence_key,
            card_data=card_sync.card,
            correct=card_sync.correct,
            total=card_sync.total,
            updated_at=now,
        )
        session.add(new_card)

    await session.commit()
    return {"status": "ok", "sequence_key": sequence_key}


@router.post("/sync/record-review")
async def record_review(
    correct: bool,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Record a review in progress stats."""
    today = get_today_string()
    now = datetime.utcnow()

    result = await session.execute(
        select(UserProgress).where(UserProgress.user_id == current_user.id)
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = UserProgress(
            user_id=current_user.id,
            last_review_date=today,
        )
        session.add(progress)

    # Reset if new day
    if progress.last_review_date != today:
        progress.reviews_today = 0
        progress.correct_today = 0
        progress.last_review_date = today

    # Update counts
    progress.reviews_today += 1
    progress.total_reviews += 1
    if correct:
        progress.correct_today += 1
        progress.total_correct += 1

    progress.updated_at = now
    await session.commit()
    await session.refresh(progress)

    return {
        "reviews_today": progress.reviews_today,
        "correct_today": progress.correct_today,
        "last_review_date": progress.last_review_date,
        "total_reviews": progress.total_reviews,
        "total_correct": progress.total_correct,
    }

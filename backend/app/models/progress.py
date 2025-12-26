from sqlmodel import SQLModel, Field, JSON, Column, UniqueConstraint
from datetime import datetime
from typing import Optional
import uuid


class UserWordCard(SQLModel, table=True):
    """FSRS card state for a word, per user."""
    __tablename__ = "user_word_cards"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    word_id: int = Field(index=True)
    card_data: dict = Field(default={}, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


class UserToneCard(SQLModel, table=True):
    """FSRS card state for a tone sequence, per user."""
    __tablename__ = "user_tone_cards"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    sequence_key: str = Field(index=True)
    card_data: dict = Field(default={}, sa_column=Column(JSON))
    correct: int = Field(default=0)
    total: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


class UserVowelCard(SQLModel, table=True):
    """FSRS card state for a vowel sequence, per user."""
    __tablename__ = "user_vowel_cards"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    sequence_key: str = Field(index=True)
    card_data: dict = Field(default={}, sa_column=Column(JSON))
    correct: int = Field(default=0)
    total: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


class UserProgress(SQLModel, table=True):
    """Progress stats per user."""
    __tablename__ = "user_progress"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", unique=True, index=True)
    reviews_today: int = Field(default=0)
    correct_today: int = Field(default=0)
    last_review_date: str = Field(default="")
    total_reviews: int = Field(default=0)
    total_correct: int = Field(default=0)
    confusion_state: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    vowel_confusion_state: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


class UserState(SQLModel, table=True):
    """ML confusion state per user per problem type.

    Each problem type (e.g., tone_1, tone_2, vowel_1) has its own state.
    Problem types are defined by drill_type + syllable_count.
    Unique constraint on (user_id, problem_type_id) enforced at DB level.
    """
    __table_args__ = (
        UniqueConstraint("user_id", "problem_type_id", name="uix_userstate_user_problem"),
    )

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    problem_type_id: str = Field(index=True)  # e.g., "tone_1", "tone_2", "vowel_1"
    state_json: dict = Field(default={}, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        arbitrary_types_allowed = True


# Request/Response schemas
class WordCardSync(SQLModel):
    """Schema for syncing a word card."""
    word_id: int
    card: dict


class ToneCardSync(SQLModel):
    """Schema for syncing a tone card."""
    sequence_key: str
    card: dict
    correct: int = 0
    total: int = 0


class SyncRequest(SQLModel):
    """Request schema for full sync."""
    word_cards: list[WordCardSync] = []
    tone_cards: list[ToneCardSync] = []
    progress: Optional[dict] = None
    confusion_state: Optional[dict] = None


class SyncResponse(SQLModel):
    """Response schema for full sync."""
    word_cards: list[WordCardSync]
    tone_cards: list[ToneCardSync]
    progress: dict
    confusion_state: Optional[dict] = None


class DrillAttempt(SQLModel, table=True):
    """Log of every drill attempt for ML training.

    Captures all information needed to replay/analyze user behavior,
    including audio parameters (voice, speed) for voice preference learning.
    """
    __tablename__ = "drill_attempts"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    # Problem info
    problem_type_id: str = Field(index=True)  # e.g., "tone_1", "tone_2"
    word_id: int
    vietnamese: str
    correct_sequence: list[int] = Field(default=[], sa_column=Column(JSON))
    alternatives: list[list[int]] = Field(default=[], sa_column=Column(JSON))

    # User response
    selected_sequence: list[int] = Field(default=[], sa_column=Column(JSON))
    is_correct: bool
    response_time_ms: Optional[int] = None

    # Audio parameters (for voice preference learning)
    voice: str = Field(default="banmai", index=True)
    speed: int = Field(default=0)

    # Lesson tracking (for lesson-based drills)
    lesson_id: Optional[int] = Field(default=None, index=True)

    class Config:
        arbitrary_types_allowed = True

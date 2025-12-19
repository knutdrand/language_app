from sqlmodel import SQLModel, Field, JSON, Column
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

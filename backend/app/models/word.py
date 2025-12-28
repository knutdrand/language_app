from typing import Optional

from sqlmodel import SQLModel, Field


class WordBase(SQLModel):
    """Shared fields for word data."""

    vietnamese: str
    english: str
    image_url: Optional[str] = Field(default=None, alias="imageUrl")
    source_id: Optional[str] = Field(default=None, alias="sourceId")
    frequency: Optional[int] = None

    class Config:
        allow_population_by_field_name = True


class Word(WordBase, table=True):
    """Word database model."""

    __tablename__ = "words"

    id: int = Field(primary_key=True)


class WordRead(WordBase):
    """Schema for word responses."""

    id: int

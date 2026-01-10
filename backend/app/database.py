import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, create_engine, select

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

WORDS_PATH = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "data" / "words.json"

# Async engine for SQLite
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

# Async session factory
async_session_maker = sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Create all tables in the database."""
    from app.models.user import User, RefreshToken  # noqa: F401
    from app.models.progress import UserWordCard, UserToneCard, UserProgress, UserState, DrillAttempt  # noqa: F401
    from app.models.word import Word  # noqa: F401
    from app.models.review import Review  # noqa: F401

    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    await seed_words()


async def seed_words():
    """Seed the words table from the bundled JSON file if empty."""
    from app.models.word import Word

    if not WORDS_PATH.exists():
        logger.warning("Words seed file not found at %s", WORDS_PATH)
        return

    async with async_session_maker() as session:
        result = await session.execute(select(func.count()).select_from(Word))
        count = result.scalar_one()
        if count:
            return

        try:
            with WORDS_PATH.open(encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load words seed file: %s", exc)
            return

        words = [Word(**item) for item in data]
        session.add_all(words)
        await session.commit()


async def get_session() -> AsyncSession:
    """Dependency for getting async database session."""
    async with async_session_maker() as session:
        yield session


@asynccontextmanager
async def get_session_context():
    """Context manager for database session (for use outside FastAPI)."""
    async with async_session_maker() as session:
        yield session

from sqlmodel import SQLModel, create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager

from app.config import get_settings

settings = get_settings()

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

    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncSession:
    """Dependency for getting async database session."""
    async with async_session_maker() as session:
        yield session


@asynccontextmanager
async def get_session_context():
    """Context manager for database session (for use outside FastAPI)."""
    async with async_session_maker() as session:
        yield session

from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets
from typing import List


class Settings(BaseSettings):
    # JWT Configuration
    SECRET_KEY: str = secrets.token_urlsafe(32)  # Generate random key if not set
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Database
    # SQLite for development: sqlite+aiosqlite:///./data/app.db
    # PostgreSQL for production: postgresql+asyncpg://user:pass@host/db
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"

    # CORS - comma-separated list of allowed origins
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082"

    @property
    def cors_origins(self) -> List[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()

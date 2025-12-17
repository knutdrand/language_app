# User Authentication Implementation Plan

## Overview

Implementing user registration, login, and session management for the Vietnamese Tone Trainer app using custom JWT authentication with FastAPI and SQLModel.

## Architecture Decision

**Chosen Approach: Custom JWT with SQLModel + SQLite**

Rationale:
- Full control over authentication flow
- No external service dependencies
- Works offline after initial login
- SQLModel provides clean Python type hints with SQLAlchemy power
- SQLite for simplicity (can migrate to PostgreSQL later)

## Token Strategy

- **Access Token**: 15 minutes, stored in memory (web) or secure storage (mobile)
- **Refresh Token**: 30 days, stored in database with rotation on use
- **Token Rotation**: Issue new refresh token on each refresh request
- **Revocation**: Delete refresh token from database on logout

---

## Phase 1: Backend Auth Foundation

### 1.1 Dependencies

```txt
# Add to requirements.txt
sqlmodel>=0.0.14
aiosqlite>=0.19.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.6
```

### 1.2 Database Models (SQLModel)

```python
# backend/app/models/user.py
from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
import uuid

class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    display_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

class RefreshToken(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked: bool = Field(default=False)
```

### 1.3 Auth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create new user account |
| `/api/auth/login` | POST | Authenticate and get tokens |
| `/api/auth/refresh` | POST | Get new access token using refresh token |
| `/api/auth/logout` | POST | Revoke refresh token |
| `/api/auth/me` | GET | Get current user info |

### 1.4 Request/Response Schemas

```python
# Registration
class UserCreate(SQLModel):
    email: str
    password: str
    display_name: Optional[str] = None

# Login
class LoginRequest(SQLModel):
    email: str
    password: str

# Token Response
class TokenResponse(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds

# User Response
class UserResponse(SQLModel):
    id: str
    email: str
    display_name: Optional[str]
    created_at: datetime
```

### 1.5 JWT Configuration

```python
# backend/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"

settings = Settings()
```

---

## Phase 2: Frontend Auth (Web)

### 2.1 Auth Context

- Create `AuthContext` with React Context API
- Store access token in memory (not localStorage for security)
- Store refresh token in httpOnly cookie or secure storage
- Auto-refresh access token before expiry

### 2.2 Protected Routes

- Wrap app in `AuthProvider`
- Create `ProtectedRoute` component
- Redirect unauthenticated users to login

### 2.3 Auth UI Components

- `LoginForm` - Email/password login
- `RegisterForm` - New user registration
- `UserMenu` - Profile dropdown with logout

---

## Phase 3: Mobile Auth (React Native)

### 3.1 Secure Storage

- Use `expo-secure-store` for token storage
- Encrypted storage on both iOS and Android

### 3.2 Auth State Management

- Similar AuthContext pattern as web
- Persist auth state across app restarts
- Handle token refresh on app foreground

---

## Phase 4: User-Scoped Data

### 4.1 Migrate Existing Data

- Add `user_id` foreign key to:
  - `attempts` table
  - `tone_cards` (FSRS card states)
- Create migration script

### 4.2 Update Endpoints

- Add authentication middleware
- Filter all queries by `current_user.id`
- Keep backward compatibility for anonymous users

---

## Phase 5: Progress Sync

### 5.1 Sync Strategy

- **Pull on login**: Fetch user's data from server
- **Push on change**: Send updates to server
- **Conflict resolution**: Server wins (latest timestamp)

### 5.2 Offline Support

- Queue changes when offline
- Sync when connection restored
- Show sync status indicator

---

## Phase 6: Account Management

### 6.1 Features

- Change password
- Update display name
- Delete account (with data)
- Export user data (GDPR compliance)

---

## Security Considerations

1. **Password Hashing**: bcrypt with salt rounds = 12
2. **Token Storage**: Never store access tokens in localStorage
3. **HTTPS**: Required in production
4. **Rate Limiting**: Add to auth endpoints
5. **Input Validation**: Pydantic schemas validate all input
6. **SQL Injection**: SQLModel parameterizes all queries

---

## File Structure

```
backend/
├── app/
│   ├── config.py          # Settings and JWT config
│   ├── database.py        # SQLModel engine and session
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py        # User, RefreshToken models
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt.py         # Token creation/verification
│   │   ├── password.py    # Password hashing
│   │   └── dependencies.py # get_current_user dependency
│   └── routers/
│       └── auth.py        # Auth endpoints
├── data/
│   └── app.db             # SQLite database
└── alembic/               # Database migrations (optional)

frontend/src/
├── contexts/
│   └── AuthContext.tsx    # Auth state management
├── components/
│   ├── LoginForm.tsx
│   ├── RegisterForm.tsx
│   └── ProtectedRoute.tsx
└── hooks/
    └── useAuth.ts         # Auth hook

mobile/
├── contexts/
│   └── AuthContext.tsx
├── components/
│   ├── LoginScreen.tsx
│   └── RegisterScreen.tsx
└── utils/
    └── secureStorage.ts   # expo-secure-store wrapper
```

---

## Implementation Order

1. **Phase 1**: Backend auth foundation (this phase)
2. **Phase 2**: Web frontend auth
3. **Phase 3**: Mobile auth
4. **Phase 4**: User-scoped data migration
5. **Phase 5**: Progress sync
6. **Phase 6**: Account management

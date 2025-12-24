
"""State persistence for ML confusion states.
Handles loading and saving ConfusionState to the database.
"""

from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.progress import UserState
from app.ml import ConfusionState, get_ml_service, get_problem_type


def _deserialize_state(state_json: dict) -> ConfusionState:
    """Deserialize state JSON to appropriate state class.

    Checks model_version to determine the correct class:
    - model_version=2: BradleyTerryState (pairwise wins)
    - model_version=1 or missing: ConfusionState/LuceState (confusion matrix)
    """
    model_version = state_json.get("model_version", 1)

    if model_version == 2:
        from app.ml.luce_service import BradleyTerryState
        return BradleyTerryState(**state_json)
    else:
        return ConfusionState(**state_json)


async def load_state(
    session: AsyncSession,
    user_id: str,
    problem_type_id: str,
) -> ConfusionState:
    """Load state for a user and problem type.

    If no state exists, returns initial state with priors.
    Deserializes to the appropriate state class based on model_version.
    """
    stmt = select(UserState).where(
        UserState.user_id == user_id,
        UserState.problem_type_id == problem_type_id,
    )
    result = await session.execute(stmt)
    user_state = result.scalar_one_or_none()

    if user_state is None:
        # Return initial state with priors
        return get_ml_service().get_initial_state(problem_type_id)

    # Deserialize from JSON with appropriate class
    return _deserialize_state(user_state.state_json)


async def save_state(
    session: AsyncSession,
    user_id: str,
    problem_type_id: str,
    state: ConfusionState,
) -> None:
    """Save state for a user and problem type.

    Creates or updates the state record. Uses IntegrityError handling
    for race condition protection (unique constraint on user_id + problem_type_id).
    """
    from sqlalchemy.exc import IntegrityError

    stmt = select(UserState).where(
        UserState.user_id == user_id,
        UserState.problem_type_id == problem_type_id,
    )
    result = await session.execute(stmt)
    user_state = result.scalar_one_or_none()

    if user_state is None:
        # Create new record
        user_state = UserState(
            user_id=user_id,
            problem_type_id=problem_type_id,
            state_json=state.model_dump(),
            updated_at=datetime.utcnow(),
        )
        session.add(user_state)
        try:
            await session.commit()
        except IntegrityError:
            # Race condition: another request created the record
            await session.rollback()
            # Retry as update
            result = await session.execute(
                select(UserState).where(
                    UserState.user_id == user_id,
                    UserState.problem_type_id == problem_type_id,
                )
            )
            user_state = result.scalar_one()
            user_state.state_json = state.model_dump()
            user_state.updated_at = datetime.utcnow()
            await session.commit()
    else:
        # Update existing record
        user_state.state_json = state.model_dump()
        user_state.updated_at = datetime.utcnow()
        await session.commit()


async def load_all_states(
    session: AsyncSession,
    user_id: str,
) -> dict[str, ConfusionState]:
    """Load all states for a user.

    Returns dict mapping problem_type_id to ConfusionState.
    Missing states are not included (caller should use get_initial_state).
    """
    stmt = select(UserState).where(UserState.user_id == user_id)
    result = await session.execute(stmt)
    user_states = result.scalars().all()

    return {
        us.problem_type_id: _deserialize_state(us.state_json)
        for us in user_states
    }


async def delete_state(
    session: AsyncSession,
    user_id: str,
    problem_type_id: str,
) -> bool:
    """Delete state for a user and problem type.

    Returns True if deleted, False if not found.
    """
    stmt = select(UserState).where(
        UserState.user_id == user_id,
        UserState.problem_type_id == problem_type_id,
    )
    result = await session.execute(stmt)
    user_state = result.scalar_one_or_none()

    if user_state is None:
        return False

    await session.delete(user_state)
    await session.commit()
    return True

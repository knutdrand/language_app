#!/bin/bash
# Restart the backend server on port 8023

cd "$(dirname "$0")/.." || exit 1

# Kill any existing uvicorn process on port 8023
lsof -ti:8023 | xargs kill -9 2>/dev/null

# Wait for port to be released
sleep 1

# Activate virtual environment
source .venv/bin/activate

# Start uvicorn with reload
exec uvicorn app.main:app --reload --port 8023

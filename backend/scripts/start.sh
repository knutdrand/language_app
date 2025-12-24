#!/bin/bash
# Start the backend server on port 8023

cd "$(dirname "$0")/.." || exit 1

# Activate virtual environment
source .venv/bin/activate

# Start uvicorn with reload
exec uvicorn app.main:app --reload --port 8023

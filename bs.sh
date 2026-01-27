#!/bin/bash

cd backend
if [ -d ".venv" ]; then
    echo "Activating .venv..."
    . .venv/bin/activate
else
    echo "Activating conda tfgpu..."
    conda activate tfgpu
fi

uvicorn app.main:app --reload --no-access-log --log-level warning

cd ..

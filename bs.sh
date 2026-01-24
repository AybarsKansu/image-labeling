#!/bin/bash

source ~/anaconda3/etc/profile.d/conda.sh
conda activate tfgpu
cd "/home/aybars/work environment/Projects/image labeling/backend"
uvicorn app.main:app --reload --log-level warning
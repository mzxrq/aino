# Import Package

# backend-python/main.py


# Check if file existed
import os
import sys

# Ensure backend-python directory is on sys.path so local `resource` and `train` imports resolve
sys.path.insert(0, os.path.dirname(__file__) or '.')

# stocklist / model paths
from resource.stocklist import MODEL_PATHS

# training helper (top-level train.py)
from train import trained_model

# Check model files
def check_model_files():
    for market, path in MODEL_PATHS.items():
        if not os.path.exists(path):
            trained_model(market,path)
        else:
            print(f"{market} model found at {path}")




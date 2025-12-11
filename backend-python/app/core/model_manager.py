"""
ModelManager: Singleton cache for trained ML models with versioning.

Provides efficient model loading, caching, and version tracking for
anomaly detection across markets (US, JP, TH).

This prevents redundant disk I/O and ensures consistent model versions
across detection runs.
"""

import os
import hashlib
import joblib as jo
from typing import Optional, Dict
from core.config import logger

MODEL_PATHS = {
    "US": os.getenv("US_MODEL_PATH"),
    "JP": os.getenv("JP_MODEL_PATH"),
    "TH": os.getenv("TH_MODEL_PATH"),
}


class ModelManager:
    """
    Singleton cache for trained models.
    
    Manages lazy loading, caching, and versioning of ML models.
    """
    
    _cache: Dict = {}
    _versions: Dict[str, str] = {}
    _hashes: Dict[str, str] = {}
    
    @classmethod
    def get_model(cls, market: str):
        """
        Load model from cache or disk.
        
        Args:
            market: Market code ('US', 'JP', 'TH')
            
        Returns:
            Loaded model or None if unavailable
        """
        market = market.upper()
        
        # Return from cache if available
        if market in cls._cache:
            return cls._cache[market]
        
        # Load from disk
        path = MODEL_PATHS.get(market)
        if not path:
            logger.warning(f"No model path configured for market '{market}'")
            return None
        
        try:
            if not os.path.exists(path):
                logger.warning(f"Model file not found at {path} for market '{market}'")
                return None
            
            model = jo.load(path)
            
            # Calculate file hash for version tracking
            with open(path, 'rb') as f:
                file_hash = hashlib.sha256(f.read()).hexdigest()
            
            # Cache the model and its hash
            cls._cache[market] = model
            cls._hashes[market] = file_hash
            cls._versions[market] = file_hash[:16]  # Use first 16 chars as version ID
            
            logger.info(f"Loaded {market} model from {path} (hash: {cls._versions[market]}...)")
            return model
            
        except Exception as e:
            logger.exception(f"Failed loading model for {market} from {path}: {e}")
            return None
    
    @classmethod
    def get_version(cls, market: str) -> str:
        """
        Get model version/hash for traceability.
        
        Args:
            market: Market code ('US', 'JP', 'TH')
            
        Returns:
            SHA256 hash (first 16 chars) or empty string if model unavailable
        """
        market = market.upper()
        
        if market not in cls._versions:
            # Force load to get version
            cls.get_model(market)
        
        return cls._versions.get(market, "unknown")
    
    @classmethod
    def get_full_hash(cls, market: str) -> str:
        """
        Get full SHA256 hash of model file.
        
        Args:
            market: Market code ('US', 'JP', 'TH')
            
        Returns:
            Full SHA256 hash or empty string
        """
        market = market.upper()
        
        if market not in cls._hashes:
            cls.get_model(market)
        
        return cls._hashes.get(market, "")
    
    @classmethod
    def is_cached(cls, market: str) -> bool:
        """Check if model is loaded in cache."""
        return market.upper() in cls._cache
    
    @classmethod
    def clear_cache(cls):
        """Clear all cached models (e.g., for reloading after file update)."""
        cls._cache.clear()
        cls._versions.clear()
        cls._hashes.clear()
        logger.info("Model cache cleared")
    
    @classmethod
    def get_cache_stats(cls) -> Dict:
        """Return cache statistics."""
        return {
            "cached_models": list(cls._cache.keys()),
            "model_versions": cls._versions.copy(),
            "total_cached": len(cls._cache)
        }

"""
Detection metadata management for incremental anomaly detection.

Tracks detection state (which data has been processed, model versions, etc.)
to enable efficient incremental updates and prevent re-processing.
"""

from datetime import datetime
from typing import Optional, Dict
from core.config import db, logger


class DetectionMetadata:
    """Manages detection state per ticker/interval."""
    
    @staticmethod
    def get_metadata(ticker: str, interval: str = '1d') -> Optional[Dict]:
        """
        Retrieve detection metadata for a ticker.
        
        Args:
            ticker: Ticker symbol (e.g., 'AAPL')
            interval: Data interval (e.g., '1d', '15m')
            
        Returns:
            Metadata dict or None if not found
        """
        try:
            meta = db.detection_metadata.find_one({
                "_id": f"detection_meta::{ticker}::{interval}"
            })
            return meta
        except Exception as e:
            logger.error(f"Error retrieving metadata for {ticker}: {e}")
            return None
    
    @staticmethod
    def save_metadata(ticker: str, interval: str, metadata: Dict) -> bool:
        """
        Save detection metadata.
        
        Args:
            ticker: Ticker symbol
            interval: Data interval
            metadata: Metadata dict to save
            
        Returns:
            True if successful
        """
        try:
            doc = {
                "_id": f"detection_meta::{ticker}::{interval}",
                "ticker": ticker,
                "interval": interval,
                **metadata,
                "updated_at": datetime.utcnow()
            }
            
            db.detection_metadata.update_one(
                {"_id": doc["_id"]},
                {"$set": doc},
                upsert=True
            )
            
            logger.info(f"Saved metadata for {ticker}/{interval}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving metadata for {ticker}: {e}")
            return False
    
    @staticmethod
    def should_detect(
        ticker: str,
        interval: str,
        latest_data_timestamp: datetime
    ) -> bool:
        """
        Determine if detection should run.
        
        Returns False if:
        - Detection metadata exists
        - Last detected timestamp >= latest data timestamp
        - Status is 'complete'
        
        Args:
            ticker: Ticker symbol
            interval: Data interval
            latest_data_timestamp: Latest timestamp in current dataset
            
        Returns:
            True if detection should run
        """
        meta = DetectionMetadata.get_metadata(ticker, interval)
        
        if not meta:
            # No metadata = first run
            return True
        
        if meta.get('status') != 'complete':
            # Previous run failed or in progress
            return True
        
        last_detected = meta.get('last_detected_timestamp')
        if not last_detected:
            return True
        
        # Convert to datetime if string
        if isinstance(last_detected, str):
            last_detected = datetime.fromisoformat(last_detected)
        
        # Only detect if new data available
        if latest_data_timestamp > last_detected:
            logger.info(
                f"{ticker}/{interval}: New data since {last_detected}, "
                f"latest={latest_data_timestamp}"
            )
            return True
        
        logger.debug(f"{ticker}/{interval}: Already detected up to {last_detected}")
        return False


class DetectionRun:
    """Audit trail for detection runs."""
    
    @staticmethod
    def start_run(
        trigger: str,
        ticker: str,
        interval: str,
        period: str,
        model_version: str,
        model_hash: str
    ) -> str:
        """
        Log the start of a detection run.
        
        Args:
            trigger: How was detection triggered ('chart_request', 'scheduler', 'backfill', etc)
            ticker: Ticker symbol
            interval: Data interval
            period: Period requested ('12mo', '5y', etc)
            model_version: Model version/hash
            model_hash: Full SHA256 hash
            
        Returns:
            Detection run ID
        """
        try:
            import uuid
            run_id = str(uuid.uuid4())
            
            doc = {
                "_id": run_id,
                "trigger": trigger,
                "ticker": ticker,
                "interval": interval,
                "period": period,
                "model_version": model_version,
                "model_hash": model_hash,
                "started_at": datetime.utcnow(),
                "status": "in_progress",
                "rows_loaded": 0,
                "rows_preprocessed": 0,
                "anomalies_found": 0,
                "errors": [],
                "warnings": []
            }
            
            db.detection_runs.insert_one(doc)
            return run_id
            
        except Exception as e:
            logger.error(f"Error starting detection run: {e}")
            return None
    
    @staticmethod
    def complete_run(
        run_id: str,
        status: str = "complete",
        rows_loaded: int = 0,
        rows_preprocessed: int = 0,
        anomalies_found: int = 0,
        anomaly_ids: list = None,
        error: str = None,
        warnings: list = None
    ) -> bool:
        """
        Log completion of detection run.
        
        Args:
            run_id: Run ID from start_run()
            status: 'complete', 'failed', 'partial'
            rows_loaded: Number of rows loaded
            rows_preprocessed: Number of rows processed
            anomalies_found: Number of anomalies detected
            anomaly_ids: List of ObjectId for inserted anomalies
            error: Error message if failed
            warnings: List of warning messages
            
        Returns:
            True if successful
        """
        try:
            update_doc = {
                "status": status,
                "completed_at": datetime.utcnow(),
                "rows_loaded": rows_loaded,
                "rows_preprocessed": rows_preprocessed,
                "anomalies_found": anomalies_found
            }
            
            if anomaly_ids:
                update_doc["anomaly_ids"] = anomaly_ids
            
            if error:
                update_doc["error"] = error
            
            if warnings:
                update_doc["warnings"] = warnings
            
            # Calculate duration
            result = db.detection_runs.find_one({"_id": run_id})
            if result and result.get("started_at"):
                duration = (datetime.utcnow() - result["started_at"]).total_seconds()
                update_doc["duration_seconds"] = duration
            
            db.detection_runs.update_one(
                {"_id": run_id},
                {"$set": update_doc}
            )
            
            logger.info(f"Completed detection run {run_id}: {status}")
            return True
            
        except Exception as e:
            logger.error(f"Error completing detection run {run_id}: {e}")
            return False
    
    @staticmethod
    def get_run(run_id: str) -> Optional[Dict]:
        """Retrieve detection run details."""
        try:
            return db.detection_runs.find_one({"_id": run_id})
        except Exception as e:
            logger.error(f"Error retrieving run {run_id}: {e}")
            return None

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

from app.ml.features import ANOMALY_FEATURE_COLUMNS


class StatisticalAnomalyBaseline:
    """
    Statistical benchmark baseline for groundwater anomaly screening.
    Uses IQR on month-to-month level changes and expanding z-score deviations.
    """

    def __init__(self, iqr_multiplier: float = 1.5, zscore_threshold: float = 3.0, valid_ratio_min: float = 0.8):
        self.iqr_multiplier = iqr_multiplier
        self.zscore_threshold = zscore_threshold
        self.valid_ratio_min = valid_ratio_min
        self.lower_change_bound: Optional[float] = None
        self.upper_change_bound: Optional[float] = None

    def fit(self, train_df: pd.DataFrame) -> "StatisticalAnomalyBaseline":
        """Compute statistical thresholds from historical training baseline."""
        changes = train_df["month_to_month_change"]
        q25, q75 = changes.quantile([0.25, 0.75])
        iqr = q75 - q25
        self.lower_change_bound = float(q25 - self.iqr_multiplier * iqr)
        self.upper_change_bound = float(q75 + self.iqr_multiplier * iqr)
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """Flag potential anomalies using fitted baseline rules."""
        if self.lower_change_bound is None or self.upper_change_bound is None:
            raise ValueError("Baseline model must be fitted before predict.")

        is_large_chg = (df["month_to_month_change"] < self.lower_change_bound) | (
            df["month_to_month_change"] > self.upper_change_bound
        )
        is_large_zscore = df["history_zscore"].abs() > self.zscore_threshold
        is_low_quality = df["valid_ratio"] < self.valid_ratio_min

        stat_flags = is_large_chg | is_large_zscore | is_low_quality
        return stat_flags.astype(int).values

    def to_dict(self) -> Dict[str, Any]:
        """Export fitted baseline thresholds and hyperparameters as dictionary."""
        return {
            "iqr_multiplier": self.iqr_multiplier,
            "zscore_threshold": self.zscore_threshold,
            "valid_ratio_min": self.valid_ratio_min,
            "lower_change_bound": self.lower_change_bound,
            "upper_change_bound": self.upper_change_bound,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StatisticalAnomalyBaseline":
        """Instantiate baseline from parameter dictionary."""
        obj = cls(
            iqr_multiplier=data.get("iqr_multiplier", 1.5),
            zscore_threshold=data.get("zscore_threshold", 3.0),
            valid_ratio_min=data.get("valid_ratio_min", 0.8),
        )
        obj.lower_change_bound = data.get("lower_change_bound")
        obj.upper_change_bound = data.get("upper_change_bound")
        return obj

    def save(self, filepath: str) -> None:
        """Serialize baseline instance to disk."""
        joblib.dump(self, filepath)

    @classmethod
    def load(cls, filepath: str) -> "StatisticalAnomalyBaseline":
        """Load baseline instance from disk."""
        return joblib.load(filepath)


class GroundwaterIsolationForest:
    """
    Machine Learning Anomaly Detector for groundwater observation time-series.
    Wraps scikit-learn IsolationForest with feature scaling and calibrated anomaly scoring.
    """

    def __init__(
        self,
        contamination: float = 0.03,
        n_estimators: int = 150,
        random_state: int = 42,
    ):
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.feature_columns = list(ANOMALY_FEATURE_COLUMNS)

        self.scaler = StandardScaler()
        self.model = IsolationForest(
            contamination=self.contamination,
            n_estimators=self.n_estimators,
            random_state=self.random_state,
            n_jobs=-1,
        )
        self.is_fitted = False
        self.train_score_min: float = 0.0
        self.train_score_max: float = 1.0

    def fit(self, train_df: pd.DataFrame) -> "GroundwaterIsolationForest":
        """Fit scaler and Isolation Forest model on historical training partition."""
        X_train = train_df[self.feature_columns].values
        X_train_scaled = self.scaler.fit_transform(X_train)

        self.model.fit(X_train_scaled)
        self.is_fitted = True

        raw_scores = -self.model.score_samples(X_train_scaled)
        self.train_score_min = float(np.min(raw_scores))
        self.train_score_max = float(np.max(raw_scores))
        return self

    def predict_with_scores(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Compute anomaly predictions and normalized confidence scores for inference.
        Returns a copy of the dataframe with added ml_anomaly and anomaly_score columns.
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted before predict.")

        out_df = df.copy()
        X = out_df[self.feature_columns].values
        X_scaled = self.scaler.transform(X)

        raw_preds = self.model.predict(X_scaled)
        raw_scores = -self.model.score_samples(X_scaled)

        # Scale raw scores to [0.0, 1.0] for interpretable confidence
        score_range = max(self.train_score_max - self.train_score_min, 1e-6)
        normalized_scores = np.clip((raw_scores - self.train_score_min) / score_range, 0.0, 1.0)

        out_df["ml_anomaly"] = (raw_preds == -1).astype(int)
        out_df["anomaly_score"] = np.round(normalized_scores, 4)
        return out_df

    def predict_anomaly(self, df: pd.DataFrame) -> np.ndarray:
        """Return boolean numpy array indicating detected anomalies."""
        scored = self.predict_with_scores(df)
        return scored["ml_anomaly"].values == 1

    def predict_score(self, df: pd.DataFrame) -> np.ndarray:
        """Return 1D numpy array of calibrated anomaly scores in [0.0, 1.0]."""
        scored = self.predict_with_scores(df)
        return scored["anomaly_score"].values

    def save(self, filepath: str) -> None:
        """Serialize trained pipeline artifact to disk."""
        joblib.dump(self, filepath)

    @classmethod
    def load(cls, filepath: str) -> "GroundwaterIsolationForest":
        """Load trained pipeline artifact from disk."""
        return joblib.load(filepath)

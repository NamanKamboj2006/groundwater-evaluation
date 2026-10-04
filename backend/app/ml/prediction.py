"""
Groundwater Level Prediction Pipeline.

Provides:
1. Causal lag, rolling, seasonal, and historical feature engineering.
2. Naive Persistence Baseline model (y_hat_t = y_{t-1}) for benchmark evaluation.
3. Machine learning regression model using HistGradientBoostingRegressor.
4. Comprehensive comparative evaluation metrics (MAE, RMSE, R²).
5. Model artifact serialization and deserialization.

Leakage Safeguards:
- All features for target month t strictly use observations at or before t-1.
- Expanding historical statistics and rolling averages apply .shift(1) before computation.
"""
import os
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

PREDICTION_FEATURE_COLUMNS: List[str] = [
    "lag_1_month",
    "lag_2_month",
    "lag_3_month",
    "lag_6_month",
    "lag_12_month",
    "rolling_mean_3",
    "rolling_mean_6",
    "rolling_std_3",
    "rolling_std_6",
    "change_from_previous_month",
    "change_from_3_months_ago",
    "historical_mean",
    "historical_std",
    "month_num",
    "sin_month",
    "cos_month",
    "rl_msl",
    "latitude",
    "longitude",
]


def prepare_prediction_features(
    raw_df: pd.DataFrame,
    min_valid_obs: int = 1,
) -> pd.DataFrame:
    """
    Construct causal time-series features for groundwater level regression.
    
    Temporal Leakage Prevention:
    - Target: mean_gw_level at month t.
    - Features: lag_1 (t-1), lag_2 (t-2), ..., rolling statistics computed on shift(1).
    - No information from month t or future months is ever provided to the feature vector.
    """
    if raw_df.empty:
        return raw_df.copy()

    df = raw_df[raw_df["valid_count"] >= min_valid_obs].copy()
    if df.empty:
        return df

    # Sort deterministically by station and calendar month
    df = df.sort_values(["station_id", "month"]).reset_index(drop=True)

    # 1. Target definition
    df["target_gw_level"] = df["mean_gw_level"]

    # 2. Historical Lags (per station)
    for k in [1, 2, 3, 4, 6, 12]:
        df[f"lag_{k}_month"] = df.groupby("station_id")["mean_gw_level"].shift(k)

    # 3. Rolling window statistics strictly prior to target month t (using shift(1))
    df["rolling_mean_3"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    df["rolling_mean_6"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).rolling(6, min_periods=1).mean()
    )
    df["rolling_std_3"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=2).std()
    ).fillna(0.0)
    df["rolling_std_6"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).rolling(6, min_periods=2).std()
    ).fillna(0.0)

    # 4. Historical changes
    df["change_from_previous_month"] = df["lag_1_month"] - df["lag_2_month"]
    df["change_from_3_months_ago"] = df["lag_1_month"] - df["lag_3_month"]

    # 5. Expanding historical baseline strictly prior to month t (using shift(1))
    df["historical_mean"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).expanding(min_periods=1).mean()
    )
    df["historical_std"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).expanding(min_periods=2).std()
    ).fillna(0.0)

    # 6. Calendar seasonal features
    df["month_num"] = pd.to_datetime(df["month"]).dt.month
    df["sin_month"] = np.sin(2.0 * np.pi * df["month_num"] / 12.0)
    df["cos_month"] = np.cos(2.0 * np.pi * df["month_num"] / 12.0)

    # Station metadata fill
    df["rl_msl"] = df["rl_msl"].fillna(0.0)
    df["latitude"] = df["latitude"].fillna(0.0)
    df["longitude"] = df["longitude"].fillna(0.0)

    return df


class NaivePersistenceBaseline:
    """
    Naive baseline predicting that groundwater level at month t equals month t-1 (persistence).
    Formula: y_hat_t = y_{t-1}
    """

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """Predict using lag_1_month."""
        if "lag_1_month" not in df.columns:
            raise ValueError("lag_1_month feature is required for naive persistence baseline.")
        return df["lag_1_month"].values

    def evaluate(self, df: pd.DataFrame) -> Dict[str, float]:
        """Compute evaluation metrics against actual target groundwater level."""
        valid_mask = df["lag_1_month"].notna() & df["target_gw_level"].notna()
        sub_df = df[valid_mask]
        y_true = sub_df["target_gw_level"].values
        y_pred = sub_df["lag_1_month"].values

        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        r2 = float(r2_score(y_true, y_pred))

        return {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "r2": round(r2, 4),
        }


class GroundwaterLevelPredictor:
    """
    Machine Learning Regression Pipeline for Groundwater Level Prediction.
    Wraps HistGradientBoostingRegressor with native missing lag handling.
    """

    def __init__(
        self,
        max_iter: int = 100,
        learning_rate: float = 0.08,
        max_depth: int = 6,
        random_state: int = 42,
    ):
        self.max_iter = max_iter
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.random_state = random_state
        self.feature_columns = list(PREDICTION_FEATURE_COLUMNS)

        self.model = HistGradientBoostingRegressor(
            loss="squared_error",
            max_iter=self.max_iter,
            learning_rate=self.learning_rate,
            max_depth=self.max_depth,
            random_state=self.random_state,
        )
        self.is_fitted = False

    def fit(self, train_df: pd.DataFrame) -> "GroundwaterLevelPredictor":
        """Fit regression model on training partition."""
        clean_train = train_df.dropna(subset=["lag_1_month", "target_gw_level"])
        X = clean_train[self.feature_columns].values
        y = clean_train["target_gw_level"].values

        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """Predict groundwater levels for input station-month feature rows."""
        if not self.is_fitted:
            raise ValueError("Predictor model must be fitted before calling predict.")
        X = df[self.feature_columns].values
        return self.model.predict(X)

    def evaluate(self, test_df: pd.DataFrame) -> Dict[str, Any]:
        """Evaluate model against actual targets on unseen evaluation partition."""
        clean_test = test_df.dropna(subset=["lag_1_month", "target_gw_level"])
        y_true = clean_test["target_gw_level"].values
        y_pred = self.predict(clean_test)

        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        r2 = float(r2_score(y_true, y_pred))

        return {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "r2": round(r2, 4),
            "evaluated_samples": len(clean_test),
            "stations_represented": int(clean_test["station_id"].nunique()),
            "start_month": str(clean_test["month"].min()),
            "end_month": str(clean_test["month"].max()),
        }

    def save(self, filepath: str) -> None:
        """Serialize trained model to disk."""
        joblib.dump(self, filepath)

    @classmethod
    def load(cls, filepath: str) -> "GroundwaterLevelPredictor":
        """Load serialized predictor model from disk."""
        return joblib.load(filepath)

from typing import Tuple, List, Optional
import pandas as pd
import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

# List of numeric features used for anomaly model training and inference
ANOMALY_FEATURE_COLUMNS: List[str] = [
    "mean_gw_level",
    "std_gw_level",
    "monthly_range",
    "valid_ratio",
    "month_to_month_change",
    "deviation_from_history",
    "history_zscore",
]


def extract_station_month_aggregations(db: Session, station_id: Optional[int] = None) -> pd.DataFrame:
    """
    Extract station-month level aggregated telemetry metrics directly from PostgreSQL.
    Aggregates across valid readings to minimize memory usage while capturing observation quality.
    """
    where_clause = "WHERE r.station_id = :station_id" if station_id is not None else ""
    params = {"station_id": station_id} if station_id is not None else {}

    sql = f"""
    SELECT 
        r.station_id,
        s.station_name,
        s.district,
        s.latitude,
        s.longitude,
        s.rl_msl,
        TO_CHAR(r.timestamp, 'YYYY-MM') as month,
        COUNT(*) as observation_count,
        COUNT(*) FILTER (WHERE r.data_quality = 'valid') as valid_count,
        COUNT(*) FILTER (WHERE r.data_quality = 'suspect') as suspect_count,
        COUNT(*) FILTER (WHERE r.data_quality = 'invalid') as invalid_count,
        AVG(CASE WHEN r.data_quality = 'valid' THEN r.groundwater_level END)::FLOAT as mean_gw_level,
        MIN(CASE WHEN r.data_quality = 'valid' THEN r.groundwater_level END)::FLOAT as min_gw_level,
        MAX(CASE WHEN r.data_quality = 'valid' THEN r.groundwater_level END)::FLOAT as max_gw_level,
        STDDEV_POP(CASE WHEN r.data_quality = 'valid' THEN r.groundwater_level END)::FLOAT as std_gw_level
    FROM readings r
    JOIN stations s ON r.station_id = s.id
    {where_clause}
    GROUP BY r.station_id, s.station_name, s.district, s.latitude, s.longitude, s.rl_msl, TO_CHAR(r.timestamp, 'YYYY-MM')
    ORDER BY r.station_id, month ASC
    """

    df = pd.read_sql(text(sql), db.bind, params=params)
    return df


def prepare_anomaly_features(
    raw_df: pd.DataFrame,
    min_valid_obs: int = 1,
) -> pd.DataFrame:
    """
    Compute causal, leakage-free station-month time-series features.
    
    Temporal Leakage Prevention Rules:
    - Lagged and expanding statistical features are computed sequentially per station using ONLY data prior to the evaluated month (t-1).
    - Expanding mean and standard deviation use shift(1) so the current observation does not leak into the station's historical baseline.
    """
    if raw_df.empty:
        return raw_df.copy()

    df = raw_df[raw_df["valid_count"] >= min_valid_obs].copy()
    if df.empty:
        return df

    # Ensure deterministic chronological ordering per station
    df = df.sort_values(["station_id", "month"]).reset_index(drop=True)

    # 1. Observation Quality and Intra-month Spread
    df["valid_ratio"] = df["valid_count"] / df["observation_count"].replace(0, 1)
    df["monthly_range"] = (df["max_gw_level"] - df["min_gw_level"]).clip(lower=0.0)
    df["std_gw_level"] = df["std_gw_level"].fillna(0.0)

    # 2. Causal Inter-month Change (Lag-1)
    df["prev_mean_gw_level"] = df.groupby("station_id")["mean_gw_level"].shift(1)
    df["month_to_month_change"] = (df["mean_gw_level"] - df["prev_mean_gw_level"]).fillna(0.0)

    # 3. Expanding Historical Baseline strictly prior to current month (t-1)
    df["historical_mean_gw_level"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).expanding().mean()
    )
    df["historical_std_gw_level"] = df.groupby("station_id")["mean_gw_level"].transform(
        lambda s: s.shift(1).expanding().std()
    )

    # 4. Historical Deviation & Normalized Z-Score
    df["deviation_from_history"] = (df["mean_gw_level"] - df["historical_mean_gw_level"]).fillna(0.0)
    
    # Handle initial months or near-zero variance safely
    valid_std_mask = df["historical_std_gw_level"] > 0.05
    df["history_zscore"] = np.where(
        valid_std_mask,
        df["deviation_from_history"] / df["historical_std_gw_level"],
        0.0,
    )
    df["history_zscore"] = df["history_zscore"].fillna(0.0)

    return df


def split_chronological_data(
    feature_df: pd.DataFrame,
    split_month: str = "2024-12",
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split the dataset chronologically into train (baseline) and test (evaluation) partitions.
    Avoids random shuffling leakage.
    """
    train_df = feature_df[feature_df["month"] <= split_month].copy()
    test_df = feature_df[feature_df["month"] > split_month].copy()
    return train_df, test_df

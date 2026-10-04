"""
Machine Learning Anomaly Detection Service.

Loads the pre-trained Isolation Forest model and metadata artifact to provide:
1. Model configuration and evaluation metadata.
2. High-level dataset anomaly summary and district breakdown.
3. Filterable and paginated station-month anomaly records.
4. Station-specific anomaly evaluation timelines.

Uses fast SQL station-month aggregations and cached model inference to avoid
expensive per-request retraining and heavy raw data queries.
"""
import os
import json
import logging
from typing import Dict, Any, List, Optional
import pandas as pd
from sqlalchemy.orm import Session

from app.ml.features import (
    extract_station_month_aggregations,
    prepare_anomaly_features,
    ANOMALY_FEATURE_COLUMNS,
)
from app.ml.anomaly import GroundwaterIsolationForest, StatisticalAnomalyBaseline
from app.schemas.ml import (
    ModelInfoResponse,
    AnomalySummaryResponse,
    AnomalyRecordItem,
    MLAnomaliesListResponse,
    StationMLAnomalyResponse,
)

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "artifacts"))
MODEL_PATH = os.path.join(ARTIFACTS_DIR, "groundwater_anomaly_isolation_forest.joblib")
BASELINE_PATH = os.path.join(ARTIFACTS_DIR, "groundwater_anomaly_statistical_baseline.joblib")
METADATA_PATH = os.path.join(ARTIFACTS_DIR, "groundwater_anomaly_metadata.json")

# In-memory cached dataset & model
_CACHED_MODEL: Optional[GroundwaterIsolationForest] = None
_CACHED_BASELINE: Optional[StatisticalAnomalyBaseline] = None
_CACHED_METADATA: Optional[Dict[str, Any]] = None
_CACHED_SCORED_DF: Optional[pd.DataFrame] = None


def load_model_and_metadata():
    """
    Load pre-trained model artifact, baseline artifact, and metadata JSON from disk if not already cached.
    """
    global _CACHED_MODEL, _CACHED_BASELINE, _CACHED_METADATA
    if _CACHED_MODEL is None and os.path.exists(MODEL_PATH):
        try:
            _CACHED_MODEL = GroundwaterIsolationForest.load(MODEL_PATH)
            logger.info("ML Anomaly Model successfully loaded from %s", MODEL_PATH)
        except Exception as e:
            logger.error("Failed to load ML model from %s: %s", MODEL_PATH, e)

    if _CACHED_METADATA is None and os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                _CACHED_METADATA = json.load(f)
            logger.info("ML Metadata successfully loaded from %s", METADATA_PATH)
        except Exception as e:
            logger.error("Failed to load ML metadata from %s: %s", METADATA_PATH, e)

    if _CACHED_BASELINE is None:
        if os.path.exists(BASELINE_PATH):
            try:
                _CACHED_BASELINE = StatisticalAnomalyBaseline.load(BASELINE_PATH)
                logger.info("Statistical Baseline successfully loaded from %s", BASELINE_PATH)
            except Exception as e:
                logger.error("Failed to load baseline from %s: %s", BASELINE_PATH, e)
        elif _CACHED_METADATA and "parameters" in _CACHED_METADATA.get("statistical_baseline_comparison", {}):
            params = _CACHED_METADATA["statistical_baseline_comparison"]["parameters"]
            _CACHED_BASELINE = StatisticalAnomalyBaseline.from_dict(params)

    return _CACHED_MODEL, _CACHED_BASELINE, _CACHED_METADATA


def generate_review_context(row: pd.Series) -> str:
    """
    Generate an interpretable reason string explaining the potential anomaly
    based on hydrological and statistical indicators.
    """
    reasons = []
    
    delta = abs(float(row.get("month_to_month_change", 0.0)))
    zscore = abs(float(row.get("history_zscore", 0.0)))
    valid_ratio = float(row.get("valid_ratio", 1.0))
    std_gw = float(row.get("std_gw_level", 0.0))
    score = float(row.get("anomaly_score", 0.0))

    if delta >= 10.0:
        reasons.append(f"Abrupt level change (|delta| = {delta:.1f} m)")
    elif delta >= 5.0:
        reasons.append(f"Elevated monthly change (|delta| = {delta:.1f} m)")

    if zscore >= 4.0:
        reasons.append(f"Extreme historical deviation (Z = {zscore:.1f})")
    elif zscore >= 2.5:
        reasons.append(f"Significant historical deviation (Z = {zscore:.1f})")

    if valid_ratio < 0.8:
        reasons.append(f"Substantial suspect telemetry ({valid_ratio*100:.0f}% valid)")

    if std_gw >= 5.0:
        reasons.append(f"High intra-month dispersion (std = {std_gw:.1f} m)")

    if not reasons:
        if score >= 0.8:
            return "Multivariate statistical anomaly across combined hydrological indicators requiring review."
        elif score >= 0.5:
            return "Moderate deviation across multi-feature groundwater distribution."
        else:
            return "Normal hydrological observation pattern within expected baseline limits."

    return "Potential statistical anomaly requiring review: " + ", ".join(reasons) + "."


def get_cached_scored_dataset(db: Session) -> pd.DataFrame:
    """
    Retrieve or compute scored station-month dataframe with anomaly flags, scores, and context.
    Cached in-memory for sub-millisecond response times.
    """
    global _CACHED_SCORED_DF
    if _CACHED_SCORED_DF is not None:
        return _CACHED_SCORED_DF

    model, baseline, _ = load_model_and_metadata()
    if model is None:
        raise RuntimeError("ML Anomaly detection model artifact is missing or not trained.")

    # Extract station-month aggregations efficiently from database
    raw_df = extract_station_month_aggregations(db)
    feature_df = prepare_anomaly_features(raw_df)

    # Compute ML scores
    scored_df = model.predict_with_scores(feature_df)
    scored_df["is_anomaly"] = scored_df["ml_anomaly"] == 1
    feature_df = scored_df

    # Statistical proxy flag using trained baseline
    if baseline is not None:
        stat_flags = baseline.predict(feature_df)
        feature_df["statistical_anomaly_flag"] = (stat_flags == 1)
    else:
        # Fallback to default thresholds
        stat_flags = (
            (feature_df["history_zscore"].abs() >= 3.0) |
            (feature_df["month_to_month_change"].abs() >= 1.5) |
            (feature_df["valid_ratio"] < 0.8)
        )
        feature_df["statistical_anomaly_flag"] = stat_flags

    # Generate interpretable review context
    feature_df["review_context"] = feature_df.apply(generate_review_context, axis=1)

    _CACHED_SCORED_DF = feature_df
    return _CACHED_SCORED_DF


def get_model_info_service() -> ModelInfoResponse:
    """
    Return metadata, hyperparameters, training window, and performance summary for the ML model.
    """
    _, _, metadata = load_model_and_metadata()
    if not metadata:
        return ModelInfoResponse(
            model_type="IsolationForest",
            training_period="2023-06 to 2024-12",
            training_sample_count=10853,
            features_used=ANOMALY_FEATURE_COLUMNS,
            contamination_rate=0.03,
            trained_at=None,
            evaluation_summary={"status": "Model metadata file not loaded."},
        )

    return ModelInfoResponse(
        model_type=metadata.get("model_performance", {}).get("model_type", "IsolationForest"),
        training_period=metadata.get("dataset_summary", {}).get("training_period", "2023-06 to 2024-12"),
        training_sample_count=metadata.get("dataset_summary", {}).get("training_samples", 10853),
        features_used=metadata.get("metadata", {}).get("features_used", ANOMALY_FEATURE_COLUMNS),
        contamination_rate=metadata.get("model_performance", {}).get("contamination_param", 0.03),
        trained_at=metadata.get("metadata", {}).get("trained_at"),
        evaluation_summary={
            "dataset_summary": metadata.get("dataset_summary"),
            "model_performance": metadata.get("model_performance"),
            "statistical_baseline_comparison": metadata.get("statistical_baseline_comparison"),
            "methodological_notes": metadata.get("methodological_notes"),
        },
    )


def get_anomaly_summary_service(db: Session) -> AnomalySummaryResponse:
    """
    Return high-level summary of anomaly distribution, baseline overlap, and district breakdown.
    """
    df = get_cached_scored_dataset(db)
    total_months = len(df)
    anomalies = df[df["is_anomaly"] == True]
    total_anomalies = len(anomalies)
    pct = round((total_anomalies / total_months * 100.0), 2) if total_months > 0 else 0.0

    # Overlap with statistical baseline
    overlap = len(df[(df["is_anomaly"] == True) & (df["statistical_anomaly_flag"] == True)])
    overlap_pct = round((overlap / total_anomalies * 100.0), 2) if total_anomalies > 0 else 0.0

    # District breakdown
    district_counts = anomalies.groupby("district").size().to_dict()

    return AnomalySummaryResponse(
        total_evaluated_station_months=total_months,
        total_anomalies_detected=total_anomalies,
        overall_anomaly_percentage=pct,
        statistical_baseline_overlap_pct=overlap_pct,
        district_breakdown=district_counts,
    )


def get_anomalies_list_service(
    db: Session,
    district: Optional[str] = None,
    min_score: float = 0.0,
    is_anomaly_only: bool = True,
    page: int = 1,
    page_size: int = 50,
) -> MLAnomaliesListResponse:
    """
    Return filtered and paginated station-month anomaly records.
    """
    df = get_cached_scored_dataset(db)
    filtered = df

    if district:
        filtered = filtered[filtered["district"].str.upper() == district.strip().upper()]

    if is_anomaly_only:
        filtered = filtered[filtered["is_anomaly"] == True]

    if min_score > 0.0:
        filtered = filtered[filtered["anomaly_score"] >= min_score]

    # Sort descending by anomaly score then month descending
    filtered = filtered.sort_values(by=["anomaly_score", "month"], ascending=[False, False])

    total_count = len(filtered)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_df = filtered.iloc[start_idx:end_idx]

    records = []
    for _, row in page_df.iterrows():
        records.append(
            AnomalyRecordItem(
                station_id=int(row["station_id"]),
                station_name=str(row["station_name"]),
                district=str(row["district"]),
                month=str(row["month"]),
                anomaly_score=round(float(row["anomaly_score"]), 4),
                is_anomaly=bool(row["is_anomaly"]),
                mean_gw_level=round(float(row["mean_gw_level"]), 2),
                month_to_month_change=round(float(row["month_to_month_change"]), 2),
                history_zscore=round(float(row["history_zscore"]), 2),
                valid_ratio=round(float(row["valid_ratio"]), 3),
                observation_count=int(row["observation_count"]),
                statistical_anomaly_flag=bool(row["statistical_anomaly_flag"]),
                review_context=str(row["review_context"]),
            )
        )

    return MLAnomaliesListResponse(
        total_count=total_count,
        page=page,
        page_size=page_size,
        data=records,
    )


def get_station_ml_anomalies_service(db: Session, station_id: int) -> Optional[StationMLAnomalyResponse]:
    """
    Return full chronological anomaly evaluation timeline for a specific station.
    """
    df = get_cached_scored_dataset(db)
    station_df = df[df["station_id"] == station_id].sort_values(by="month", ascending=True)

    if station_df.empty:
        return None

    first_row = station_df.iloc[0]
    station_name = str(first_row["station_name"])
    district = str(first_row["district"])
    total_months = len(station_df)
    anomaly_months = int(station_df["is_anomaly"].sum())
    highest_score = round(float(station_df["anomaly_score"].max()), 4)

    records = []
    for _, row in station_df.iterrows():
        records.append(
            AnomalyRecordItem(
                station_id=int(row["station_id"]),
                station_name=str(row["station_name"]),
                district=str(row["district"]),
                month=str(row["month"]),
                anomaly_score=round(float(row["anomaly_score"]), 4),
                is_anomaly=bool(row["is_anomaly"]),
                mean_gw_level=round(float(row["mean_gw_level"]), 2),
                month_to_month_change=round(float(row["month_to_month_change"]), 2),
                history_zscore=round(float(row["history_zscore"]), 2),
                valid_ratio=round(float(row["valid_ratio"]), 3),
                observation_count=int(row["observation_count"]),
                statistical_anomaly_flag=bool(row["statistical_anomaly_flag"]),
                review_context=str(row["review_context"]),
            )
        )

    return StationMLAnomalyResponse(
        station_id=station_id,
        station_name=station_name,
        district=district,
        total_months_evaluated=total_months,
        anomaly_months_count=anomaly_months,
        highest_anomaly_score=highest_score,
        records=records,
    )

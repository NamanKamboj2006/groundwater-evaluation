from typing import Dict, Any, List
import numpy as np
import pandas as pd

from app.ml.anomaly import GroundwaterIsolationForest, StatisticalAnomalyBaseline


def evaluate_anomaly_detection(
    model: GroundwaterIsolationForest,
    baseline: StatisticalAnomalyBaseline,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Perform temporal and proxy-comparative evaluation of the groundwater anomaly model.
    """
    # Predict on train and test
    train_scored = model.predict_with_scores(train_df)
    test_scored = model.predict_with_scores(test_df)

    # Statistical baseline proxy labels
    train_stat_flags = baseline.predict(train_df)
    test_stat_flags = baseline.predict(test_df)

    train_scored["stat_anomaly"] = train_stat_flags
    test_scored["stat_anomaly"] = test_stat_flags

    # Train metrics
    train_count = len(train_scored)
    train_ml_anom = int(train_scored["ml_anomaly"].sum())
    train_stat_anom = int(train_scored["stat_anomaly"].sum())
    train_overlap = int(((train_scored["ml_anomaly"] == 1) & (train_scored["stat_anomaly"] == 1)).sum())

    # Test metrics
    test_count = len(test_scored)
    test_ml_anom = int(test_scored["ml_anomaly"].sum())
    test_stat_anom = int(test_scored["stat_anomaly"].sum())
    test_overlap = int(((test_scored["ml_anomaly"] == 1) & (test_scored["stat_anomaly"] == 1)).sum())

    # Overall metrics
    total_count = train_count + test_count
    total_ml_anom = train_ml_anom + test_ml_anom
    total_stat_anom = train_stat_anom + test_stat_anom
    total_overlap = train_overlap + test_overlap

    # Top anomaly examples for qualitative inspection
    all_scored = pd.concat([train_scored, test_scored], ignore_index=True)
    top_anomalies_df = (
        all_scored[all_scored["ml_anomaly"] == 1]
        .sort_values("anomaly_score", ascending=False)
        .head(10)
    )

    top_examples: List[Dict[str, Any]] = []
    for _, row in top_anomalies_df.iterrows():
        top_examples.append({
            "station_id": int(row["station_id"]),
            "station_name": str(row["station_name"]),
            "district": str(row["district"]),
            "month": str(row["month"]),
            "anomaly_score": float(row["anomaly_score"]),
            "mean_gw_level": float(np.round(row["mean_gw_level"], 2)),
            "month_to_month_change": float(np.round(row["month_to_month_change"], 2)),
            "history_zscore": float(np.round(row["history_zscore"], 2)),
            "valid_ratio": float(np.round(row["valid_ratio"], 3)),
            "stat_anomaly": bool(row["stat_anomaly"]),
        })

    # District distribution of anomalies
    district_anomalies = (
        all_scored[all_scored["ml_anomaly"] == 1]
        .groupby("district")
        .size()
        .to_dict()
    )

    return {
        "dataset_summary": {
            "total_station_months": total_count,
            "training_samples": train_count,
            "training_period": f"{train_df['month'].min()} to {train_df['month'].max()}",
            "evaluation_samples": test_count,
            "evaluation_period": f"{test_df['month'].min()} to {test_df['month'].max()}",
        },
        "model_performance": {
            "model_type": "IsolationForest",
            "contamination_param": model.contamination,
            "train_anomaly_count": train_ml_anom,
            "train_anomaly_percentage": float(np.round((train_ml_anom / max(train_count, 1)) * 100, 2)),
            "test_anomaly_count": test_ml_anom,
            "test_anomaly_percentage": float(np.round((test_ml_anom / max(test_count, 1)) * 100, 2)),
            "total_anomaly_count": total_ml_anom,
            "total_anomaly_percentage": float(np.round((total_ml_anom / max(total_count, 1)) * 100, 2)),
        },
        "statistical_baseline_comparison": {
            "baseline_type": "IQR + Historical Z-Score + Quality Thresholds",
            "parameters": baseline.to_dict(),
            "stat_anomaly_count": total_stat_anom,
            "stat_anomaly_percentage": float(np.round((total_stat_anom / max(total_count, 1)) * 100, 2)),
            "overlap_count": total_overlap,
            "ml_overlap_with_baseline_pct": float(np.round((total_overlap / max(total_ml_anom, 1)) * 100, 2)),
            "overlap_definition": "ML anomalies also flagged by statistical baseline / Total ML anomalies",
        },
        "district_anomaly_distribution": district_anomalies,
        "top_detected_anomalies": top_examples,
        "methodological_notes": [
            "Anomaly detection uses unsupervised statistical machine learning (Isolation Forest).",
            "Evaluation uses a proxy statistical baseline (IQR & Z-score) rather than manufactured true/false labels.",
            "Temporal split is strictly chronological (2023-06..2024-12 vs 2025-01..2025-12) to avoid time-series data leakage.",
            "High anomaly scores indicate unusual observation shifts or deviations from local historical station behavior, which represent candidate events for scientific or hydrological review.",
        ],
    }

import os
import sys
import json
from datetime import datetime

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.ml.features import (
    extract_station_month_aggregations,
    prepare_anomaly_features,
    split_chronological_data,
)
from app.ml.anomaly import GroundwaterIsolationForest, StatisticalAnomalyBaseline
from app.ml.evaluation import evaluate_anomaly_detection


def main():
    print("=" * 60)
    print("Starting Groundwater Anomaly Model Training Pipeline")
    print("=" * 60)

    db = SessionLocal()
    try:
        print("[1/5] Extracting station-month aggregations from PostgreSQL...")
        raw_df = extract_station_month_aggregations(db)
        print(f"      Extracted {len(raw_df)} raw station-month records.")

        print("[2/5] Preparing causal, leak-free feature engineering...")
        feature_df = prepare_anomaly_features(raw_df, min_valid_obs=1)
        print(f"      Engineered {len(feature_df)} valid station-month feature vectors.")

        print("[3/5] Splitting data chronologically (split_month='2024-12')...")
        train_df, test_df = split_chronological_data(feature_df, split_month="2024-12")
        print(f"      Training samples:   {len(train_df)} ({train_df['month'].min()} to {train_df['month'].max()})")
        print(f"      Evaluation samples: {len(test_df)} ({test_df['month'].min()} to {test_df['month'].max()})")

        print("[4/5] Fitting Statistical Baseline and Isolation Forest...")
        baseline = StatisticalAnomalyBaseline(iqr_multiplier=1.5, zscore_threshold=3.0, valid_ratio_min=0.8)
        baseline.fit(train_df)

        model = GroundwaterIsolationForest(contamination=0.03, n_estimators=150, random_state=42)
        model.fit(train_df)
        print("      Fitted Isolation Forest successfully.")

        print("[5/5] Evaluating anomaly detection performance...")
        eval_results = evaluate_anomaly_detection(model, baseline, train_df, test_df)

        # Print concise summary to stdout
        perf = eval_results["model_performance"]
        base_comp = eval_results["statistical_baseline_comparison"]
        print("-" * 60)
        print(f"Training Anomalies Detected:    {perf['train_anomaly_count']} ({perf['train_anomaly_percentage']}%)")
        print(f"Evaluation Anomalies Detected:  {perf['test_anomaly_count']} ({perf['test_anomaly_percentage']}%)")
        print(f"Total ML Anomalies Detected:    {perf['total_anomaly_count']} ({perf['total_anomaly_percentage']}%)")
        print(f"Statistical Baseline Overlap:   {base_comp['overlap_count']} ({base_comp['ml_overlap_with_baseline_pct']}% of ML detections)")
        print("-" * 60)

        # Ensure artifacts directory exists
        artifact_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "artifacts"))
        os.makedirs(artifact_dir, exist_ok=True)

        model_path = os.path.join(artifact_dir, "groundwater_anomaly_isolation_forest.joblib")
        baseline_path = os.path.join(artifact_dir, "groundwater_anomaly_statistical_baseline.joblib")
        meta_path = os.path.join(artifact_dir, "groundwater_anomaly_metadata.json")

        # Save model and baseline artifacts
        model.save(model_path)
        print(f"Saved model artifact: {model_path}")
        baseline.save(baseline_path)
        print(f"Saved baseline artifact: {baseline_path}")

        # Add training metadata
        eval_results["metadata"] = {
            "trained_at": datetime.now(datetime.now().astimezone().tzinfo).isoformat(),
            "model_path": "artifacts/groundwater_anomaly_isolation_forest.joblib",
            "baseline_path": "artifacts/groundwater_anomaly_statistical_baseline.joblib",
            "features_used": model.feature_columns,
            "random_state": model.random_state,
        }

        # Save metadata JSON
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(eval_results, f, indent=2)
        print(f"Saved metadata report: {meta_path}")

        print("=" * 60)
        print("Anomaly Model Training Complete and Artifacts Saved Successfully!")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    main()

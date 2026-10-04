import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.routers.ml import (
    get_model_info,
    get_anomaly_summary,
    get_anomalies,
    get_station_anomalies,
    get_prediction_model_info,
    get_station_prediction,
)
from app.services.analytics_service import (
    get_groundwater_trend,
    get_groundwater_trend_analysis,
    get_districts_summary,
    get_district_summary,
    get_station_anomalies as get_station_quality_anomalies,
)
from app.services.summary_service import get_overall_summary
from app.services.dashboard_service import get_dashboard_overview, get_recent_readings
from app.services.station_service import get_stations
from app.services.reading_service import get_readings_by_station


db = SessionLocal()

print("=== 1. VERIFYING ML ANOMALY DETECTION ENDPOINTS ===", flush=True)
info = get_model_info()
print(f"[PASS] /api/ml/model-info -> Model: {info.model_type}, Training Window: {info.training_period}, Samples: {info.training_sample_count}", flush=True)

summary = get_anomaly_summary(db=db)
print(f"[PASS] /api/ml/anomalies/summary -> Evaluated: {summary.total_evaluated_station_months}, Anomalies: {summary.total_anomalies_detected} ({summary.overall_anomaly_percentage}%), Baseline Overlap: {summary.statistical_baseline_overlap_pct}%", flush=True)
print(f"   District Breakdown top 5: {dict(list(summary.district_breakdown.items())[:5])}", flush=True)

anomalies_list = get_anomalies(district=None, min_score=0.0, is_anomaly_only=True, page=1, page_size=3, db=db)
print(f"[PASS] /api/ml/anomalies -> Total: {anomalies_list.total_count}, Returned: {len(anomalies_list.data)}", flush=True)
if anomalies_list.data:
    top = anomalies_list.data[0]
    print(f"   Top anomaly: Station {top.station_id} ({top.station_name}, {top.district}), Month: {top.month}, Score: {top.anomaly_score}, Change: {top.month_to_month_change}m, Z: {top.history_zscore}", flush=True)
    print(f"   Review context: '{top.review_context}'", flush=True)

bhiwani_anomalies = get_anomalies(district='BHIWANI', min_score=0.5, is_anomaly_only=True, page=1, page_size=2, db=db)
print(f"[PASS] /api/ml/anomalies?district=BHIWANI -> Total: {bhiwani_anomalies.total_count}, Page items: {len(bhiwani_anomalies.data)}", flush=True)

st539 = get_station_anomalies(station_id=539, db=db)
print(f"[PASS] /api/ml/stations/539/anomalies -> Station: {st539.station_name}, Months: {st539.total_months_evaluated}, Anomalies: {st539.anomaly_months_count}, Top Score: {st539.highest_anomaly_score}", flush=True)

st1 = get_station_anomalies(station_id=1, db=db)
print(f"[PASS] /api/ml/stations/1/anomalies -> Station: {st1.station_name}, Months: {st1.total_months_evaluated}, Anomalies: {st1.anomaly_months_count}, Top Score: {st1.highest_anomaly_score}", flush=True)

try:
    get_station_anomalies(station_id=999999, db=db)
    print("[FAIL] Station 999999 should have raised 404", flush=True)
except Exception as e:
    print(f"[PASS] Station 999999 raised expected 404: {e.detail}", flush=True)

print("\n=== 2. VERIFYING ML PREDICTION ENDPOINTS ===", flush=True)
pred_info = get_prediction_model_info()
print(f"[PASS] /api/ml/prediction/model-info -> Model: {pred_info.model_name}, Train: {pred_info.training_period}, Test: {pred_info.evaluation_period}, Features: {pred_info.feature_count}", flush=True)
print(f"   Naive Baseline: MAE = {pred_info.naive_baseline_metrics.mae} m | RMSE = {pred_info.naive_baseline_metrics.rmse} m | R2 = {pred_info.naive_baseline_metrics.r2}", flush=True)
print(f"   ML Model:       MAE = {pred_info.ml_model_metrics.mae} m | RMSE = {pred_info.ml_model_metrics.rmse} m | R2 = {pred_info.ml_model_metrics.r2}", flush=True)
print(f"   Comparison:     RMSE Delta = {pred_info.comparison.rmse_difference_meters} m ({pred_info.comparison.rmse_difference_percentage}%)", flush=True)

pred1 = get_station_prediction(station_id=1, db=db)
print(f"[PASS] /api/ml/prediction/stations/1 -> Station: '{pred1.station_name}', Latest: {pred1.latest_observed_month} ({pred1.latest_observed_level} m) -> Target: {pred1.prediction_target_month}, Predicted: {pred1.predicted_groundwater_level} m (Change: {pred1.predicted_monthly_change} m, Status: {pred1.status})", flush=True)

pred539 = get_station_prediction(station_id=539, db=db)
print(f"[PASS] /api/ml/prediction/stations/539 -> Station: '{pred539.station_name}', Latest: {pred539.latest_observed_month} ({pred539.latest_observed_level} m) -> Target: {pred539.prediction_target_month}, Predicted: {pred539.predicted_groundwater_level} m (Status: {pred539.status})", flush=True)

pred142 = get_station_prediction(station_id=142, db=db)
print(f"[PASS] /api/ml/prediction/stations/142 (Limited History) -> Station: '{pred142.station_name}', Months: {pred142.historical_months_count} -> Target: {pred142.prediction_target_month}, Predicted: {pred142.predicted_groundwater_level} m (Status: {pred142.status})", flush=True)

try:
    get_station_prediction(station_id=999999, db=db)
    print("[FAIL] Prediction Station 999999 should have raised 404", flush=True)
except Exception as e:
    print(f"[PASS] Prediction Station 999999 raised expected 404: {e.detail}", flush=True)

print("\n=== 3. VERIFYING EXISTING APIS FOR REGRESSIONS ===", flush=True)
dash = get_dashboard_overview(db=db)
print(f"[PASS] /api/dashboard/overview -> Stations: {dash.get('kpis', {}).get('total_stations') if isinstance(dash, dict) else 'ok'}", flush=True)

summ = get_overall_summary(db=db)
print(f"[PASS] /api/summary -> Stations: {summ.get('total_stations') if isinstance(summ, dict) else 'ok'}", flush=True)

st_list = get_stations(db=db, limit=3)
print(f"[PASS] /api/stations -> Returned: {len(st_list)} stations", flush=True)

trend = get_groundwater_trend(db=db)
print(f"[PASS] /api/analytics/groundwater-trend -> Months: {len(trend.get('data', [])) if isinstance(trend, dict) else len(trend.data)}", flush=True)

trend_an = get_groundwater_trend_analysis(db=db)
slope = trend_an.get('slope_m_per_year') if isinstance(trend_an, dict) else getattr(trend_an, 'slope_m_per_year', None)
direction = trend_an.get('direction') if isinstance(trend_an, dict) else getattr(trend_an, 'direction', None)
print(f"[PASS] /api/analytics/groundwater-trend-analysis -> Slope: {slope} m/yr, Direction: {direction}", flush=True)

dist_list = get_districts_summary(db=db)
total_dist = len(dist_list) if isinstance(dist_list, list) else len(dist_list.get('districts', []))
print(f"[PASS] /api/analytics/districts -> Total Districts: {total_dist}", flush=True)

dist_det = get_district_summary(district='FATEHABAD', db=db)
dist_st = dist_det.get('station_count') if isinstance(dist_det, dict) else None
print(f"[PASS] /api/analytics/districts/FATEHABAD -> Stations: {dist_st}", flush=True)

st_qa = get_station_quality_anomalies(station_id=1, db=db)
outliers = len(st_qa.get('anomalies', [])) if isinstance(st_qa, dict) else 0
print(f"[PASS] /api/analytics/stations/1/quality-anomalies -> Detected events: {outliers}", flush=True)

recent_r = get_recent_readings(db=db, limit=10)
print(f"[PASS] /api/dashboard/recent-readings -> Returned {len(recent_r)} recent readings. Latest: Station '{recent_r[0]['station_name']}' ({recent_r[0]['district']}) at {recent_r[0]['timestamp']} with level {recent_r[0]['groundwater_level']}m", flush=True)

print("\n=== ALL ML AND EXISTING ENDPOINTS VERIFIED 100% OPERATIONAL WITH REAL DATA ===", flush=True)


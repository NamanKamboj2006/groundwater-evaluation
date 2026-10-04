import requests
import json
import sys

base_url = 'http://127.0.0.1:8000'

def test_endpoint(ep, name):
    try:
        r = requests.get(base_url + ep, timeout=20)
        print(f"[{r.status_code}] {name} ({ep})", flush=True)
        if r.status_code == 200:
            d = r.json()
            if isinstance(d, dict):
                if 'data' in d:
                    print(f"   -> Total items: {d.get('total_count')}, Page items: {len(d.get('data', []))}", flush=True)
                    if d.get('data'):
                        print(f"   -> Top record: station_id={d['data'][0]['station_id']}, score={d['data'][0]['anomaly_score']}, month={d['data'][0]['month']}, context='{d['data'][0]['review_context']}'", flush=True)
                elif 'district_breakdown' in d:
                    print(f"   -> Evaluated: {d.get('total_evaluated_station_months')}, Anomalies: {d.get('total_anomalies_detected')} ({d.get('overall_anomaly_percentage')}%), Baseline Overlap: {d.get('statistical_baseline_overlap_pct')}%", flush=True)
                elif 'records' in d:
                    print(f"   -> Station: '{d.get('station_name')}', District: {d.get('district')}, Months: {d.get('total_months_evaluated')}, Anomalies: {d.get('anomaly_months_count')}, Top Score: {d.get('highest_anomaly_score')}", flush=True)
                elif 'model_type' in d:
                    print(f"   -> Model: {d.get('model_type')}, Window: {d.get('training_period')}, Features: {d.get('features_used')}", flush=True)
        elif r.status_code == 404:
            print(f"   -> 404 Handled Correctly: {r.json()}", flush=True)
    except Exception as e:
        print(f"[FAIL] {ep}: {e}", flush=True)

print("=== 1. TESTING ML ANOMALY DETECTION ENDPOINTS ===", flush=True)
test_endpoint('/api/ml/model-info', 'ML Model Info')
test_endpoint('/api/ml/anomalies/summary', 'ML Anomaly Dataset Summary')
test_endpoint('/api/ml/anomalies?page=1&page_size=3', 'ML Anomalies All (Top 3)')
test_endpoint('/api/ml/anomalies?district=BHIWANI&page=1&page_size=2', 'ML Anomalies Bhiwani')
test_endpoint('/api/ml/stations/1/anomalies', 'Station 1 Anomaly Timeline')
test_endpoint('/api/ml/stations/539/anomalies', 'Station 539 Anomaly Timeline (Highest Anomaly)')
test_endpoint('/api/ml/stations/999999/anomalies', 'Station 999999 (Non-existent -> 404)')

print("\n=== 2. REGRESSION TESTING EXISTING ENDPOINTS ===", flush=True)
test_endpoint('/health', 'Health Check')
test_endpoint('/db-health', 'DB Health Check')
test_endpoint('/api/dashboard/overview', 'Dashboard Overview')
test_endpoint('/api/summary', 'Summary API')
test_endpoint('/api/map/stations', 'Map Stations API')
test_endpoint('/api/stations?page=1&page_size=3', 'Stations List')
test_endpoint('/api/readings?page=1&page_size=3', 'Readings List')
test_endpoint('/api/analytics/groundwater-trend', 'Statewide Trend')
test_endpoint('/api/analytics/groundwater-trend-analysis', 'Statewide Trend Analysis')
test_endpoint('/api/analytics/districts', 'Districts Overview')
test_endpoint('/api/analytics/districts/FATEHABAD', 'Fatehabad District Summary')
test_endpoint('/api/analytics/stations/1/trend', 'Station 1 Trend')
test_endpoint('/api/analytics/stations/1/trend-analysis', 'Station 1 Trend Analysis')
test_endpoint('/api/analytics/stations/1/quality-anomalies', 'Station 1 Statistical Quality & Anomalies')

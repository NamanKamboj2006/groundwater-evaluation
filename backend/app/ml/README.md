# Machine Learning Pipelines: Anomaly Detection & Level Prediction

## 1. Module Overview & Problem Formulation

This module encapsulates the two specialized Machine Learning (ML) pipelines developed for the **Groundwater Resource Evaluation and Monitoring System**:

1. **Statistical Anomaly Detection Pipeline**: Unsupervised screening designed to answer: *"What historical station-month behaviors deviate significantly from expected regional and temporal patterns?"*
2. **Monthly Groundwater Level Prediction Pipeline**: Supervised gradient boosted regression designed to answer: *"What is the estimated next-month groundwater level for an individual monitoring station given historical observations?"*

Both pipelines operate strictly on verified PostgreSQL telemetry data, adhere to causal time-series boundaries to prevent data leakage, and provide objective benchmarks against statistical baselines.

---

## 2. Dataset & Station-Month Aggregation

### 2.1 Raw Telemetry Inventory
- **Database Engine**: PostgreSQL with PostGIS extension (`groundwater_db`).
- **Physical Monitoring Stations**: 988 distinct monitoring locations across 14 districts in Haryana.
- **Ingested Telemetry Observations**: 1,864,977 six-hourly readings spanning 31 calendar months (**June 2023** to **December 2025**).
- **Data Quality Distribution**:
  - `valid`: 1,837,910 readings (98.55%) — *Utilized for feature computation*.
  - `suspect`: 27,064 readings (1.45%) — *Flagged extreme values preserved for review*.
  - `invalid`: 3 readings (< 0.01%) — *Excluded error sentinels (`-999.999`)*.

### 2.2 Station-Month Aggregation Rationale
Training models directly on 1.86M six-hourly observations introduces substantial high-frequency sensor noise and unnecessary computational overhead. By aggregating valid observations into **monthly station intervals directly in PostgreSQL**, the dataset is condensed to **19,270 valid station-month records**, preserving key statistical moments (mean, intra-month variance, range, and completeness ratios).

---

## 3. Pipeline 1: Statistical Anomaly Detection

### 3.1 Causal Feature Engineering
For each station-month $t$, seven causal features are derived:

| Feature Name | Description | Leakage Prevention Safeguard |
|---|---|---|
| `mean_gw_level` | Monthly average of valid groundwater levels ($m$). | Evaluates observations within month $t$. |
| `std_gw_level` | Intra-month standard deviation ($m$). | Volatility during month $t$. |
| `monthly_range` | Monthly maximum minus minimum level ($m$). | Excursion range during month $t$. |
| `valid_ratio` | Valid readings divided by total readings ($\frac{\text{valid}}{\text{total}}$). | Telemetry completeness in month $t$. |
| `month_to_month_change` | Level change from preceding month: $\text{mean}_t - \text{mean}_{t-1}$. | Uses only month $t$ and month $t-1$. |
| `deviation_from_history` | Difference between current mean and expanding historical mean prior to $t$. | Computed on `shift(1).expanding().mean()` — *never includes current month $t$*. |
| `history_zscore` | Standard score relative to historical variance prior to $t$. | Uses expanding standard deviation up to $t-1$. |

---

### 3.2 Statistical Baseline Benchmark

A benchmark rule-based filter fitted strictly on the historical training window (`<= 2024-12`):
1. **IQR Month-to-Month Change**: Beyond $Q_1 - 1.5\times\text{IQR}$ ($-1.28\,\text{m}$) or $Q_3 + 1.5\times\text{IQR}$ ($+1.33\,\text{m}$).
2. **Historical Outlier Threshold**: $|\text{history\_zscore}| \ge 3.0\,\sigma$.
3. **Telemetry Completeness Drop**: $\text{valid\_ratio} < 0.80$.

---

### 3.3 Isolation Forest Model Configuration

- **Algorithm**: `sklearn.ensemble.IsolationForest`
- **Feature Scaling**: `sklearn.preprocessing.StandardScaler`
- **Hyperparameters**:
  - `n_estimators`: 150
  - `contamination`: 0.03
  - `random_state`: 42

---

### 3.4 Temporal Evaluation & Proxy Overlap Metric

- **Training Baseline Partition**: `2023-06` to `2024-12` (10,853 station-months).
- **Evaluation Partition**: `2025-01` to `2025-12` (8,417 station-months).
- **Total Samples Evaluated**: 19,270 station-months.

#### Results Breakdown
- **Total ML Anomalies Flagged**: **647** (3.36% of dataset)
- **Statistical Baseline Anomalies**: **3,640** (18.89% of dataset)
- **Overlap Count (Flagged by Both)**: **485**
- **Proxy Baseline Overlap**: $\frac{485}{647} \times 100 =$ **74.96%**

> **Academic Interpretation Notice**: 74.96% represents the **proxy overlap / agreement rate** between the unsupervised Isolation Forest and the rule-based statistical baseline. Because groundwater telemetry lacks ground-truth failure labels, this metric must **not** be described as classification accuracy. Anomaly scores represent relative severity rankings for human review.

---

## 4. Pipeline 2: Monthly Groundwater Level Prediction

### 4.1 Task Definition & Model Architecture
- **Objective**: Predict the next calendar month's mean groundwater level ($m$) for an individual borehole.
- **Model**: `sklearn.ensemble.HistGradientBoostingRegressor` (gradient boosted decision trees with native support for missing historical lags).
- **Splitting Strategy**: Chronological time-series split (Train: `2023-07` to `2024-12` [9,872 samples]; Test: `2025-01` to `2025-12` [8,411 samples]).

---

### 4.2 19 Causal Features

1. **Lags**: `lag_1_month` ($t-1$), `lag_2_month` ($t-2$), `lag_3_month` ($t-3$), `lag_6_month` ($t-6$), `lag_12_month` ($t-12$).
2. **Rolling Statistics**: `rolling_mean_3`, `rolling_mean_6`, `rolling_std_3`, `rolling_std_6` (computed on `shift(1)`).
3. **Short-Term Differences**: `change_from_previous_month` ($t-1 - t-2$), `change_from_3_months_ago` ($t-1 - t-3$).
4. **Historical Statistics**: `historical_mean`, `historical_std` (expanding metrics prior to $t$).
5. **Seasonal Cyclical Encodings**: `month_num` ($1..12$), `sin_month`, `cos_month`.
6. **Geospatial & Elevation Metadata**: `rl_msl`, `latitude`, `longitude`.

---

### 4.3 Comparative Benchmark Evaluation (2025 Unseen Test Period)

| Metric | Naive Persistence ($\hat{y}_t = y_{t-1}$) | ML Model (HistGradientBoosting) | Comparison / Interpretation |
|---|---:|---:|---|
| **Mean Absolute Error (MAE)** | **1.1425 m** | 1.5688 m | Baseline has lower MAE on steady periods |
| **Root Mean Squared Error (RMSE)** | 5.1525 m | **4.9799 m** | **ML reduces RMSE by 3.35% ($-0.1726\,\text{m}$)** |
| **Coefficient of Determination ($R^2$)** | 0.9626 | **0.9651** | ML explains higher proportion of variance |

### Interpretation
- **Persistence Baseline Advantage**: Deep boreholes with slow seasonal movement exhibit high serial correlation, giving the persistence rule a lower MAE during steady months.
- **Machine Learning Advantage**: The HistGradientBoosting model penalizes large errors during rapid monsoon recharge or steep summer drawdown, resulting in a **3.35% lower RMSE** and an improved $R^2$ of **0.9651**.
- **Important Disclosure**: $R^2 = 0.9651$ measures statistical variance explained, **not "96.51% prediction accuracy"**. Model predictions represent time-series point estimates and do not constitute physical guarantees.

---

## 5. Serialized Model Artifacts & File Structure

```
backend/app/
├── ml/
│   ├── anomaly.py                 # Isolation Forest scoring & statistical baseline functions
│   ├── features.py                # Feature extraction & lag transformation logic
│   ├── prediction.py             # HistGradientBoosting training & inference wrappers
│   ├── evaluation.py              # Metrics computation (MAE, RMSE, R², overlap)
│   └── README.md                  # This documentation file
├── artifacts/
│   ├── anomaly_model.joblib       # Serialized Isolation Forest estimator
│   ├── anomaly_scaler.joblib      # Fitted StandardScaler for anomaly features
│   ├── anomaly_metadata.joblib    # Training period bounds and baseline thresholds
│   ├── prediction_model.joblib    # Serialized HistGradientBoostingRegressor estimator
│   └── prediction_metadata.joblib # Feature names, train/test metrics, and evaluation summaries
└── services/
    ├── ml_anomaly_service.py      # Database integration for anomaly endpoints
    └── ml_prediction_service.py   # Database integration for prediction endpoints
```

---

## 6. Model Training & Retraining Scripts

To retrain and regenerate model artifacts using the active PostgreSQL database:

```bash
cd backend

# Activate virtual environment
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate

# 1. Train Anomaly Detection Model
python scripts/train_anomaly_model.py

# 2. Train Groundwater Level Prediction Model
python scripts/train_prediction_model.py

# 3. Verify ML Endpoints
python scripts/test_ml_endpoints.py
```

---

## 7. Limitations & Scientific Boundaries

1. **Unsupervised Anomaly Metric**: Without confirmed field ground-truth labels, anomaly detection is evaluated via statistical baseline overlap.
2. **Monthly Temporal Granularity**: Station-month aggregation removes intra-day diurnal variations and short storm surge telemetry spikes.
3. **History Constraints**: Stations with sparse historical data (< 12 months) operate with restricted lag feature support.
4. **Single-Step Horizons**: The model generates single-step ($t+1$) estimates; multi-step recursive forecasts compound error variance.
5. **Absence of Hydrogeological Covariates**: Aquifer transmissivity, extraction pumping volumes, and meteorological precipitation data are not currently available in the telemetry stream.

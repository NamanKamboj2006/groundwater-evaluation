from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class ModelInfoResponse(BaseModel):
    """
    Pydantic schema for trained groundwater anomaly machine learning model metadata.
    """
    model_type: str = Field(..., description="Machine learning algorithm name")
    training_period: str = Field(..., description="Start and end months used for training baseline")
    training_sample_count: int = Field(..., description="Number of station-month training samples")
    features_used: List[str] = Field(..., description="Feature columns used in model inference")
    contamination_rate: float = Field(..., description="Contamination proportion parameter")
    trained_at: Optional[str] = Field(None, description="Timestamp of training run")
    evaluation_summary: Dict[str, Any] = Field(..., description="Key evaluation performance and overlap metrics")

    model_config = ConfigDict(from_attributes=True)


class AnomalySummaryResponse(BaseModel):
    """
    Pydantic schema for overall ML anomaly distribution and district statistics.
    """
    total_evaluated_station_months: int = Field(..., description="Total station-month intervals scored")
    total_anomalies_detected: int = Field(..., description="Total anomalous station-months flagged by model")
    overall_anomaly_percentage: float = Field(..., description="Percentage of station-months flagged as anomalies")
    statistical_baseline_overlap_pct: float = Field(..., description="Percentage of ML detections supported by statistical benchmark rules")
    district_breakdown: Dict[str, int] = Field(..., description="Count of anomalies detected per district")

    model_config = ConfigDict(from_attributes=True)


class AnomalyRecordItem(BaseModel):
    """
    Pydantic schema representing a single station-month anomaly record with context.
    """
    station_id: int = Field(..., description="Monitoring station database ID")
    station_name: str = Field(..., description="Name of monitoring station")
    district: str = Field(..., description="District name")
    month: str = Field(..., description="Year-month in 'YYYY-MM' format")
    anomaly_score: float = Field(..., description="Normalized relative anomaly score in [0.0, 1.0]")
    is_anomaly: bool = Field(..., description="Binary anomaly flag (True if score exceeds threshold)")
    mean_gw_level: float = Field(..., description="Monthly mean groundwater level in meters")
    month_to_month_change: float = Field(..., description="Net level change from preceding month in meters")
    history_zscore: float = Field(..., description="Standard score relative to station historical baseline")
    valid_ratio: float = Field(..., description="Proportion of valid observations in the month")
    observation_count: int = Field(..., description="Total observation count in the month")
    statistical_anomaly_flag: bool = Field(..., description="Whether statistical baseline rule also flagged this record")
    review_context: str = Field(..., description="Interpretable explanation of potential anomaly reason")

    model_config = ConfigDict(from_attributes=True)


class MLAnomaliesListResponse(BaseModel):
    """
    Pydantic schema for paginated list of ML anomaly detections.
    """
    total_count: int = Field(..., description="Total records matching filter criteria")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Page size limit")
    data: List[AnomalyRecordItem] = Field(..., description="List of scored station-month records")

    model_config = ConfigDict(from_attributes=True)


class StationMLAnomalyResponse(BaseModel):
    """
    Pydantic schema for station-specific ML anomaly time-series and summary.
    """
    station_id: int = Field(..., description="Monitoring station database ID")
    station_name: str = Field(..., description="Name of monitoring station")
    district: str = Field(..., description="District name")
    total_months_evaluated: int = Field(..., description="Total months evaluated for this station")
    anomaly_months_count: int = Field(..., description="Count of anomalous months flagged")
    highest_anomaly_score: float = Field(..., description="Highest anomaly score observed for this station")
    records: List[AnomalyRecordItem] = Field(..., description="Chronological station-month anomaly evaluations")

    model_config = ConfigDict(from_attributes=True)


class PredictionMetrics(BaseModel):
    """
    Pydantic schema for regression performance metrics.
    """
    mae: float = Field(..., description="Mean Absolute Error in meters")
    rmse: float = Field(..., description="Root Mean Squared Error in meters")
    r2: float = Field(..., description="Coefficient of Determination (R² score)")

    model_config = ConfigDict(from_attributes=True)


class PredictionComparison(BaseModel):
    """
    Pydantic schema comparing ML model against Naive persistence baseline.
    """
    mae_difference_meters: float = Field(..., description="ML MAE minus Naive MAE (positive means naive had lower MAE)")
    mae_difference_percentage: float = Field(..., description="Percentage change in MAE")
    rmse_difference_meters: float = Field(..., description="ML RMSE minus Naive RMSE (negative means ML had lower RMSE)")
    rmse_difference_percentage: float = Field(..., description="Percentage change in RMSE")
    interpretation: str = Field(..., description="Academic summary of predictive strengths")

    model_config = ConfigDict(from_attributes=True)


class PredictionModelInfoResponse(BaseModel):
    """
    Pydantic schema for trained groundwater level prediction model metadata and benchmark evaluation.
    """
    model_name: str = Field(..., description="Regression algorithm name")
    training_period: str = Field(..., description="Training date range (YYYY-MM to YYYY-MM)")
    evaluation_period: str = Field(..., description="Evaluation date range (YYYY-MM to YYYY-MM)")
    feature_count: int = Field(..., description="Number of causal features utilized")
    features_used: List[str] = Field(..., description="List of feature column names")
    training_samples: int = Field(..., description="Count of station-month training samples")
    evaluation_samples: int = Field(..., description="Count of station-month evaluation samples")
    stations_represented: int = Field(..., description="Count of distinct monitoring stations in evaluation")
    naive_baseline_metrics: PredictionMetrics = Field(..., description="Performance of persistence benchmark (y_t = y_{t-1})")
    ml_model_metrics: PredictionMetrics = Field(..., description="Performance of machine learning regression model")
    comparison: PredictionComparison = Field(..., description="Comparison between ML and Naive baseline")
    trained_at: Optional[str] = Field(None, description="Training execution timestamp")

    model_config = ConfigDict(from_attributes=True)


class StationPredictionResponse(BaseModel):
    """
    Pydantic schema for station-specific groundwater level forecasting output.
    """
    station_id: int = Field(..., description="Monitoring station database ID")
    station_name: str = Field(..., description="Name of monitoring station")
    district: str = Field(..., description="District name")
    latest_observed_month: Optional[str] = Field(None, description="Most recent calendar month with valid observation")
    latest_observed_level: Optional[float] = Field(None, description="Most recent recorded average groundwater level in meters")
    prediction_target_month: Optional[str] = Field(None, description="Target calendar month for prediction")
    predicted_groundwater_level: Optional[float] = Field(None, description="Model-predicted monthly groundwater level in meters")
    predicted_monthly_change: Optional[float] = Field(None, description="Predicted net change relative to latest observed level in meters")
    model_test_mae: Optional[float] = Field(None, description="Historical evaluation MAE on 2025 unseen evaluation set in meters")
    model_test_rmse: Optional[float] = Field(None, description="Historical evaluation RMSE on 2025 unseen evaluation set in meters")
    model_test_r2: Optional[float] = Field(None, description="Historical evaluation R² score on 2025 unseen evaluation set")
    model_name: str = Field(..., description="Name of predictive model used for inference")
    status: str = Field(..., description="Prediction status ('success', 'limited_history', 'no_data')")
    historical_months_count: int = Field(..., description="Count of historical monthly observations available for this station")
    notice: str = Field(..., description="Academic disclosure: Model prediction is an estimate, not a guarantee.")

    model_config = ConfigDict(from_attributes=True)

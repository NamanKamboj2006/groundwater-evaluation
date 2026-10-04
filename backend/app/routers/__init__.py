"""
API Routers Package.
"""
from app.routers.stations import router as stations_router
from app.routers.readings import router as readings_router
from app.routers.summary import router as summary_router
from app.routers.map import router as map_router
from app.routers.analytics import router as analytics_router
from app.routers.dashboard import router as dashboard_router
from app.routers.ml import router as ml_router

__all__ = [
    "stations_router",
    "readings_router",
    "summary_router",
    "map_router",
    "analytics_router",
    "dashboard_router",
    "ml_router",
]


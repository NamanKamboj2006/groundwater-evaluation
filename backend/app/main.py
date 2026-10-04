from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.routers import (
    stations_router,
    readings_router,
    summary_router,
    map_router,
    analytics_router,
    dashboard_router,
    ml_router,
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for Real-time Groundwater Resource Evaluation using DWLR Data",
    version="0.1.0",
)

# Configure CORS using origins from settings
cors_origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [str(settings.CORS_ORIGINS)]
allow_creds = False if cors_origins == ["*"] else True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(stations_router)
app.include_router(readings_router)
app.include_router(summary_router)
app.include_router(map_router)
app.include_router(analytics_router)
app.include_router(dashboard_router)
app.include_router(ml_router)


@app.get("/health", tags=["Health"])
def health_check():
    """
    Standard health check endpoint to verify backend service status.
    """
    return {
        "status": "ok",
        "service": "groundwater-backend"
    }


@app.get("/db-health", tags=["Health"])
def db_health_check(db: Session = Depends(get_db)):
    """
    Database connectivity health check. Executes a simple query to verify PostgreSQL connection.
    Returns HTTP 503 if database connection fails without crashing the application.
    """
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected"
        }
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "database": "disconnected",
                "detail": str(e)
            }
        )


@app.get("/", tags=["Root"])
def root():
    """
    Root endpoint providing API information and documentation links.
    """
    return {
        "message": "Groundwater Resource Evaluation API is running",
        "docs_url": "/docs",
        "health_url": "/health",
        "db_health_url": "/db-health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

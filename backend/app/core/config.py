from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS: List[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Groundwater Resource Evaluation API"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/groundwater_db"
    CORS_ORIGINS: Union[str, List[str]] = DEFAULT_CORS_ORIGINS

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_database_url(cls, v: str) -> str:
        if not v or not isinstance(v, str):
            return "postgresql+psycopg://postgres:postgres@localhost:5432/groundwater_db"
        url = v.strip()
        # Normalize cloud provider URL schemes (e.g. Render, Neon, Supabase) to SQLAlchemy psycopg 3
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql+psycopg2://"):
            url = url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
        return url

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if not v.strip():
                return DEFAULT_CORS_ORIGINS
            if v.strip() == "*":
                return ["*"]
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, tuple)):
            cleaned = [str(i).strip() for i in v if str(i).strip()]
            return cleaned if cleaned else DEFAULT_CORS_ORIGINS
        return DEFAULT_CORS_ORIGINS

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()


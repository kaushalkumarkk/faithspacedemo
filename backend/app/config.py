from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BASE_DIR / 'faithspace.db').as_posix()}"
    jwt_secret: str = "dev-only-change-me-please-use-32+chars"
    jwt_algorithm: str = "HS256"
    bcrypt_rounds: int = 12
    access_token_minutes: int = 60 * 24
    storage_dir: Path = BASE_DIR / "storage"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_video_mb: int = 100
    max_audio_mb: int = 60
    max_image_mb: int = 5
    login_rate_limit: int = 10  # attempts per minute per IP
    upload_rate_limit: int = 30  # uploads per minute per user


settings = Settings()
# Accept Supabase/Heroku-style URLs and route them to the psycopg3 driver.
for _old in ("postgresql://", "postgres://"):
    if settings.database_url.startswith(_old):
        settings.database_url = "postgresql+psycopg://" + settings.database_url[len(_old):]

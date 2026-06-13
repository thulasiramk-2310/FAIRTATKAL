from pydantic_settings import BaseSettings


_WEAK_DEFAULTS = {"dev-secret-change-in-prod", "change-me", "secret", ""}


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    db_path: str = "fairtatkal.db"
    secret_key: str = "dev-secret-change-in-prod"
    admin_key: str = "dev-admin-key-change-in-prod"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_file": ".env"}

    def __init__(self, **data):
        super().__init__(**data)
        import warnings
        if self.secret_key in _WEAK_DEFAULTS:
            warnings.warn(
                "SECRET_KEY is using the insecure default. Set SECRET_KEY in .env before deploying.",
                stacklevel=2,
            )
        if self.admin_key in _WEAK_DEFAULTS:
            warnings.warn(
                "ADMIN_KEY is using the insecure default. Set ADMIN_KEY in .env before deploying.",
                stacklevel=2,
            )


settings = Settings()

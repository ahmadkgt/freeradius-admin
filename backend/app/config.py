from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://radius:radiuspass@localhost:3306/radius?charset=utf8mb4"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    app_name: str = "FreeRADIUS Admin API"

    # --- Auth ---
    jwt_secret: str = "change-me-in-production-please-set-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 8  # 8 hours

    initial_admin_username: str = "admin"
    initial_admin_password: str = "admin"

    # --- WhatsApp gateway (Phase 4) ---
    whatsapp_gateway_url: str = ""
    whatsapp_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()


def get_settings() -> Settings:
    """Lazy accessor used by services that don't want a module-level import."""
    return settings

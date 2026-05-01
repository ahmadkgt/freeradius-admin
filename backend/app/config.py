from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+pymysql://radius:radiuspass@localhost:3306/radius?charset=utf8mb4"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    app_name: str = "FreeRADIUS Admin API"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    database_url: str = "sqlite:///./invoices.db"
    upload_dir: str = "./uploads"
    extraction_model: str = "nvidia/nemotron-nano-12b-v2-vl:free"
    assistant_model: str = "openai/gpt-oss-120b:free"
    use_stub_extraction: bool = False

    # auth
    jwt_secret: str = "dev-secret-change-me-in-prod"
    jwt_expiry_seconds: int = 7 * 24 * 60 * 60  # 7 days

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()

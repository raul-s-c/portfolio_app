from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str | None = None
    supabase_secret_key: str | None = None
    supabase_anon_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.4-mini"
    openai_report_max_output_tokens: int = 3500
    openai_daily_token_budget: int = 750_000
    brave_search_api_key: str | None = None
    brave_search_endpoint: str = "https://api.search.brave.com/res/v1/web/search"
    price_request_timeout_seconds: float = 8.0
    research_request_timeout_seconds: float = 20.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def supabase_backend_key(self) -> str:
        key = self.supabase_secret_key or self.supabase_service_role_key
        if not key:
            raise ValueError("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required")
        return key


@lru_cache
def get_settings() -> Settings:
    return Settings()

from supabase import Client, create_client

from app.core.config import get_settings


def service_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

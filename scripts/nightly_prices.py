import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(ROOT))

from app.core.supabase_client import service_client  # noqa: E402
from app.services.prices import update_price_snapshots  # noqa: E402


async def main() -> None:
    client = service_client()
    result = await update_price_snapshots(client)
    print(result)
    if result["prices_inserted"] == 0 and result["assets_checked"] > 0:
        raise SystemExit("No prices were inserted")


if __name__ == "__main__":
    asyncio.run(main())

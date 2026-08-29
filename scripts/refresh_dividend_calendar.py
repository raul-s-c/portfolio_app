import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(ROOT))

from app.core.supabase_client import service_client
from app.services.dividend_calendar import CalendarRequest, refresh_dividend_calendar


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh declared dividend calendar with Brave + OpenAI."
    )
    parser.add_argument("--focus", default=None, help="Optional extra search focus.")
    parser.add_argument("--max-positions", type=int, default=80)
    parser.add_argument("--max-web-results", type=int, default=5)
    args = parser.parse_args()

    client = service_client()
    result = await refresh_dividend_calendar(
        client,
        CalendarRequest(
            focus=args.focus,
            max_positions=args.max_positions,
            max_web_results=args.max_web_results,
        ),
    )
    print(f"Updated dividend calendar: {result['events']} events for {result['positions']} positions")


if __name__ == "__main__":
    asyncio.run(main())

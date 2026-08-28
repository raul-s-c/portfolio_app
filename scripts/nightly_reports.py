import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(ROOT))

from app.core.supabase_client import service_client  # noqa: E402
from app.services.research_reports import ReportRequest, generate_research_report  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Generate portfolio research reports with Brave + OpenAI.")
    parser.add_argument(
        "--type",
        choices=["portfolio_periodic", "rebalance_opportunity"],
        default="portfolio_periodic",
    )
    parser.add_argument("--focus", default=None, help="Optional user focus for this report.")
    parser.add_argument("--max-positions", type=int, default=12)
    parser.add_argument("--max-web-results", type=int, default=6)
    args = parser.parse_args()

    client = service_client()
    result = await generate_research_report(
        client,
        ReportRequest(
            report_type=args.type,
            focus=args.focus,
            max_positions=args.max_positions,
            max_web_results=args.max_web_results,
        ),
    )
    print(f"Created {args.type} report: {result['report']['id']}")


if __name__ == "__main__":
    asyncio.run(main())

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

import httpx

from app.core.config import get_settings

if TYPE_CHECKING:
    from supabase import Client


async def fetch_yahoo_quote(symbol: str) -> dict | None:
    settings = get_settings()
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    async with httpx.AsyncClient(timeout=settings.price_request_timeout_seconds) as http:
        response = await http.get(url, params={"range": "2d", "interval": "1d"})
        response.raise_for_status()
        data = response.json()

    result = (data.get("chart", {}).get("result") or [None])[0]
    if not result:
        return None
    meta = result.get("meta", {})
    price = meta.get("regularMarketPrice") or meta.get("previousClose")
    previous_close = meta.get("previousClose")
    currency = meta.get("currency") or "EUR"
    if price is None:
        return None
    return {
        "price": Decimal(str(price)),
        "previous_close": Decimal(str(previous_close)) if previous_close is not None else None,
        "currency": currency,
        "provider": "yahoo",
        "raw_payload": {"symbol": symbol, "meta": meta},
    }


def primary_price_symbols(client: "Client") -> list[dict]:
    return (
        client.table("asset_identifiers")
        .select("asset_id,symbol,provider,is_primary")
        .eq("provider", "yahoo")
        .eq("is_primary", True)
        .execute()
        .data
    )


async def update_price_snapshots(client: "Client") -> dict:
    rows = primary_price_symbols(client)
    inserted = 0
    errors = []

    for row in rows:
        symbol = row["symbol"]
        try:
            quote = await fetch_yahoo_quote(symbol)
            if not quote:
                errors.append({"symbol": symbol, "error": "No quote returned"})
                continue
            client.table("price_snapshots").insert(
                {
                    "asset_id": row["asset_id"],
                    "priced_at": datetime.now(UTC).isoformat(),
                    "price": str(quote["price"]),
                    "previous_close": str(quote["previous_close"]) if quote["previous_close"] else None,
                    "currency": quote["currency"],
                    "provider": quote["provider"],
                    "raw_payload": quote["raw_payload"],
                }
            ).execute()
            inserted += 1
        except Exception as exc:
            errors.append({"symbol": symbol, "error": str(exc)})

    return {"assets_checked": len(rows), "prices_inserted": inserted, "errors": errors}

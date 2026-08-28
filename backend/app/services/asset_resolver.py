from dataclasses import asdict
from decimal import Decimal
from typing import TYPE_CHECKING

from app.importers.models import ParsedMovement

if TYPE_CHECKING:
    from supabase import Client


CANONICAL_SYMBOLS = {
    "IHYG": "EUNW",
    "IHYG.DE": "EUNW.DE",
    "IQQJ": "IJPN",
    "IQQJ.DE": "IJPN.DE",
}


def canonical_symbol(symbol: str | None) -> str | None:
    if not symbol:
        return None
    cleaned = symbol.strip().upper()
    return CANONICAL_SYMBOLS.get(cleaned, cleaned)


def guess_asset_type(raw_name: str, symbol: str | None) -> str:
    text = f"{raw_name} {symbol or ''}".lower()
    if any(word in text for word in ["ucits", "etf", "ishares", "vanguard", "xtrackers"]):
        return "etf"
    if "fund" in text or "fondo" in text:
        return "fund"
    return "stock"


def resolve_broker(client: "Client", broker_name: str) -> str:
    existing = client.table("brokers").select("id").eq("name", broker_name).limit(1).execute().data
    if existing:
        return existing[0]["id"]
    created = client.table("brokers").insert({"name": broker_name}).execute().data
    return created[0]["id"]


def resolve_asset(client: "Client", movement: ParsedMovement) -> str:
    symbol = canonical_symbol(movement.symbol)
    if movement.isin:
        by_isin = client.table("assets").select("id").eq("isin", movement.isin).limit(1).execute().data
        if by_isin:
            return by_isin[0]["id"]

    if symbol:
        by_symbol = (
            client.table("asset_identifiers")
            .select("asset_id")
            .in_("symbol", list({symbol, symbol.split(".")[0]}))
            .limit(1)
            .execute()
            .data
        )
        if by_symbol:
            return by_symbol[0]["asset_id"]

    asset = {
        "asset_type": guess_asset_type(movement.raw_name, symbol),
        "name": movement.raw_name[:240] or symbol or "Unknown asset",
        "isin": movement.isin,
        "currency": movement.currency or "EUR",
    }
    created_asset = client.table("assets").insert(asset).execute().data[0]

    if symbol:
        identifier_rows = [
            {
                "asset_id": created_asset["id"],
                "provider": "manual",
                "symbol": symbol,
                "exchange": "",
                "is_primary": True,
            }
        ]
        if "." not in symbol:
            identifier_rows.append(
                {
                    "asset_id": created_asset["id"],
                    "provider": "yahoo",
                    "symbol": f"{symbol}.DE",
                    "exchange": "XETRA",
                    "is_primary": True,
                }
            )
        client.table("asset_identifiers").upsert(identifier_rows, on_conflict="provider,symbol,exchange").execute()

    return created_asset["id"]


def serialise_raw_payload(movement: ParsedMovement) -> dict:
    payload = asdict(movement)
    payload["date"] = movement.date.isoformat()
    for key, value in list(payload.items()):
        if isinstance(value, Decimal):
            payload[key] = str(value)
    return payload

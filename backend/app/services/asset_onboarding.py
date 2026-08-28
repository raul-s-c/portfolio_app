from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.services.asset_resolver import canonical_symbol, guess_asset_type

if TYPE_CHECKING:
    from supabase import Client


ASSET_NAMESPACE = uuid.UUID("7f5f7f4d-f5c3-5b0c-9821-27ff3e23e0c9")


@dataclass(frozen=True)
class AssetCandidate:
    asset_id: str
    asset_key: str
    symbol: str | None
    isin: str | None
    name: str
    asset_type: str
    currency: str


def stable_asset_id(symbol: str | None, isin: str | None) -> tuple[str, str]:
    if isin:
        key = f"isin:{isin.strip().upper()}"
    elif symbol:
        key = f"symbol:{canonical_symbol(symbol)}"
    else:
        raise ValueError("A symbol or ISIN is required to create a stable asset id.")
    return str(uuid.uuid5(ASSET_NAMESPACE, key)), key


def build_asset_candidate(
    *,
    symbol: str | None,
    isin: str | None,
    name: str | None,
    currency: str | None = None,
    asset_type: str | None = None,
) -> AssetCandidate:
    canonical = canonical_symbol(symbol)
    asset_id, asset_key = stable_asset_id(canonical, isin)
    display_name = (name or canonical or isin or "Unknown asset").strip()
    return AssetCandidate(
        asset_id=asset_id,
        asset_key=asset_key,
        symbol=canonical,
        isin=isin.strip().upper() if isin else None,
        name=display_name,
        asset_type=asset_type or guess_asset_type(display_name, canonical),
        currency=currency or "EUR",
    )


def find_existing_asset(client: "Client", symbol: str | None, isin: str | None) -> dict | None:
    if isin:
        rows = client.table("assets").select("*").eq("isin", isin.strip().upper()).limit(1).execute().data
        if rows:
            return rows[0]
    canonical = canonical_symbol(symbol)
    if canonical:
        rows = (
            client.table("asset_identifiers")
            .select("asset_id,assets(*)")
            .eq("symbol", canonical)
            .limit(1)
            .execute()
            .data
        )
        if rows:
            return rows[0].get("assets") or {"id": rows[0]["asset_id"]}
    return None


def upsert_manual_asset(
    client: "Client",
    *,
    symbol: str | None,
    isin: str | None,
    name: str | None,
    currency: str | None = None,
    asset_type: str | None = None,
    yahoo_symbol: str | None = None,
) -> dict:
    candidate = build_asset_candidate(
        symbol=symbol,
        isin=isin,
        name=name,
        currency=currency,
        asset_type=asset_type,
    )
    client.table("assets").upsert(
        {
            "id": candidate.asset_id,
            "asset_type": candidate.asset_type,
            "name": candidate.name,
            "isin": candidate.isin,
            "currency": candidate.currency,
        },
        on_conflict="id",
    ).execute()

    identifiers = []
    if candidate.symbol:
        identifiers.append(
            {
                "asset_id": candidate.asset_id,
                "provider": "manual",
                "symbol": candidate.symbol,
                "is_primary": True,
            }
        )
    if yahoo_symbol:
        identifiers.append(
            {
                "asset_id": candidate.asset_id,
                "provider": "yahoo",
                "symbol": canonical_symbol(yahoo_symbol),
                "is_primary": True,
            }
        )
    if identifiers:
        client.table("asset_identifiers").upsert(
            identifiers,
            on_conflict="provider,symbol,exchange",
        ).execute()

    return {
        "asset_id": candidate.asset_id,
        "asset_key": candidate.asset_key,
        "symbol": candidate.symbol,
        "isin": candidate.isin,
        "name": candidate.name,
        "asset_type": candidate.asset_type,
        "currency": candidate.currency,
    }

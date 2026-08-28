from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path
from typing import Any

try:
    from legacy_common import canonical_symbol, write_json
except ImportError:  # pragma: no cover - used when imported as scripts.migrate_legacy_to_supabase
    from scripts.legacy_common import canonical_symbol, write_json


ASSET_NAMESPACE = uuid.UUID("7f5f7f4d-f5c3-5b0c-9821-27ff3e23e0c9")


def stable_asset_id(asset_key: str) -> str:
    return str(uuid.uuid5(ASSET_NAMESPACE, asset_key))


def _asset_key(symbol: str, isin: str | None = None) -> str:
    return f"isin:{isin.upper()}" if isin else f"symbol:{symbol.upper()}"


def _asset_type(raw: str | None) -> str:
    text = str(raw or "").lower()
    if "etf" in text:
        return "etf"
    if "fund" in text or "fondo" in text or "sicav" in text:
        return "fund"
    if "cash" in text or "intereses" in text:
        return "cash"
    return "stock"


def _add_identifier(
    identifiers: dict[tuple[str, str, str, str | None], dict[str, Any]],
    asset_key: str,
    provider: str,
    symbol: str | None,
    *,
    exchange: str | None = None,
    is_primary: bool = False,
) -> None:
    canonical = canonical_symbol(symbol)
    if not canonical:
        return
    key = (asset_key, provider, canonical, exchange)
    identifiers[key] = {
        "asset_key": asset_key,
        "asset_id": stable_asset_id(asset_key),
        "provider": provider,
        "symbol": canonical,
        "exchange": exchange,
        "is_primary": is_primary,
    }


def _resolve_asset_keys(export_payload: dict[str, Any]) -> dict[str, str]:
    by_symbol: dict[str, str] = {}
    for item in export_payload.get("etfs", []):
        symbol = canonical_symbol(item.get("symbol"))
        if symbol:
            by_symbol[symbol] = _asset_key(symbol, item.get("isin"))
    for item in export_payload.get("mappings", []):
        symbol = canonical_symbol(item.get("symbol"))
        if symbol and symbol not in by_symbol:
            by_symbol[symbol] = _asset_key(symbol)
    for section in ("transactions", "dividends", "manual_prices", "quote_aliases"):
        for row in export_payload.get(section, []):
            symbol = canonical_symbol(row.get("symbol"))
            if symbol and symbol not in by_symbol:
                by_symbol[symbol] = _asset_key(symbol)
    return by_symbol


def build_plan(export_payload: dict[str, Any]) -> dict[str, Any]:
    assets: dict[str, dict[str, Any]] = {}
    identifiers: dict[tuple[str, str, str, str | None], dict[str, Any]] = {}
    symbol_to_asset_key = _resolve_asset_keys(export_payload)

    for item in export_payload.get("etfs", []):
        symbol = canonical_symbol(item.get("symbol"))
        if not symbol:
            continue
        key = symbol_to_asset_key[symbol]
        assets.setdefault(
            key,
            {
                "id": stable_asset_id(key),
                "asset_key": key,
                "asset_type": "etf",
                "name": f"{item.get('provider_name') or 'ETF'} {symbol}".strip(),
                "isin": item.get("isin"),
                "currency": "EUR",
            },
        )
        _add_identifier(identifiers, key, "manual", symbol, is_primary=True)

    for mapping in export_payload.get("mappings", []):
        symbol = canonical_symbol(mapping.get("symbol"))
        if not symbol:
            continue
        key = symbol_to_asset_key[symbol]
        assets.setdefault(
            key,
            {
                "id": stable_asset_id(key),
                "asset_key": key,
                "asset_type": _asset_type(mapping.get("asset_type")),
                "name": mapping.get("broker_names", [symbol])[0] if mapping.get("broker_names") else symbol,
                "isin": None,
                "currency": mapping.get("currency") or "EUR",
            },
        )
        _add_identifier(identifiers, key, "manual", symbol, is_primary=True)
        _add_identifier(identifiers, key, "yahoo", mapping.get("quote_symbol"), is_primary=True)
        for broker_name in mapping.get("broker_names", []):
            _add_identifier(identifiers, key, "broker_alias", broker_name)

    for section in ("transactions", "dividends"):
        for row in export_payload.get(section, []):
            symbol = canonical_symbol(row.get("symbol"))
            if not symbol:
                continue
            key = symbol_to_asset_key[symbol]
            assets.setdefault(
                key,
                {
                    "id": stable_asset_id(key),
                    "asset_key": key,
                    "asset_type": "stock",
                    "name": row.get("raw_name") or symbol,
                    "isin": None,
                    "currency": row.get("currency") or "EUR",
                },
            )
            row["asset_key"] = key
            row["asset_id"] = stable_asset_id(key)
            _add_identifier(identifiers, key, "manual", symbol, is_primary=True)

    for quote in export_payload.get("quote_aliases", []):
        symbol = canonical_symbol(quote.get("symbol"))
        if not symbol:
            continue
        key = symbol_to_asset_key[symbol]
        _add_identifier(identifiers, key, "yahoo", quote.get("quote_symbol"), is_primary=True)

    price_snapshots = []
    for price in export_payload.get("manual_prices", []):
        symbol = canonical_symbol(price.get("symbol"))
        if not symbol:
            continue
        key = symbol_to_asset_key[symbol]
        price_snapshots.append(
            {
                "asset_key": key,
                "asset_id": stable_asset_id(key),
                "price": price["price"],
                "previous_close": None,
                "currency": price.get("currency") or "EUR",
                "provider": price.get("provider") or "legacy_manual",
                "raw_payload": price.get("raw_payload") or {},
            }
        )

    return {
        "assets": list(assets.values()),
        "identifiers": list(identifiers.values()),
        "brokers": sorted(
            {
                row["broker"]
                for section in ("transactions", "dividends")
                for row in export_payload.get(section, [])
                if row.get("broker")
            }
        ),
        "transactions": export_payload.get("transactions", []),
        "dividends": export_payload.get("dividends", []),
        "price_snapshots": price_snapshots,
        "cash": export_payload.get("cash", {}),
        "validation": validate_export(export_payload),
    }


def validate_export(export_payload: dict[str, Any]) -> dict[str, Any]:
    transactions = export_payload.get("transactions", [])
    dividends = export_payload.get("dividends", [])
    symbols = [row.get("symbol") for row in transactions + dividends]
    duplicate_hashes = len({row.get("source_row_hash") for row in transactions + dividends}) != len(
        transactions + dividends
    )
    return {
        "etf_open_positions_in_ibkr_expected_zero": "manual_check_required",
        "ihyg_final_rows": sum(1 for symbol in symbols if symbol == "IHYG"),
        "iqqj_final_rows": sum(1 for symbol in symbols if symbol == "IQQJ"),
        "eunw_exists": "EUNW" in symbols or "EUNW.DE" in symbols,
        "ijpn_exists": "IJPN" in symbols or "IJPN.DE" in symbols,
        "duplicate_source_row_hashes": duplicate_hashes,
        "brokers": sorted({row.get("broker") for row in transactions + dividends if row.get("broker")}),
    }


def write_to_supabase(plan: dict[str, Any]) -> None:
    try:
        from supabase import create_client
    except ImportError as exc:
        raise SystemExit("supabase package is required for non-dry-run migration.") from exc

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for non-dry-run migration.")

    client = create_client(url, key)
    for broker in plan["brokers"]:
        client.table("brokers").upsert({"name": broker}, on_conflict="name").execute()

    client.table("assets").upsert(
        [
            {key: value for key, value in asset.items() if key != "asset_key"}
            for asset in plan["assets"]
        ],
        on_conflict="id",
    ).execute()
    client.table("asset_identifiers").upsert(
        [
            {key: value for key, value in identifier.items() if key != "asset_key"}
            for identifier in plan["identifiers"]
        ],
        on_conflict="provider,symbol,exchange",
    ).execute()

    brokers = client.table("brokers").select("id,name").execute().data
    broker_ids = {row["name"]: row["id"] for row in brokers}

    transactions = [
        {
            "asset_id": row["asset_id"],
            "broker_id": broker_ids[row["broker"]],
            "trade_date": row["trade_date"],
            "type": row["type"],
            "quantity": row["quantity"],
            "gross_amount": row["gross_amount"],
            "fees": row["fees"],
            "tax": row["tax"],
            "currency": row["currency"],
            "source_file": row["source_file"],
            "source_row_hash": row["source_row_hash"],
            "raw_payload": row["raw_payload"],
        }
        for row in plan["transactions"]
    ]
    dividends = [
        {
            "asset_id": row["asset_id"],
            "broker_id": broker_ids[row["broker"]],
            "pay_date": row["pay_date"],
            "gross_amount": row["gross_amount"],
            "tax": row["tax"],
            "net_amount": row["net_amount"],
            "currency": row["currency"],
            "source_file": row["source_file"],
            "source_row_hash": row["source_row_hash"],
            "raw_payload": row["raw_payload"],
        }
        for row in plan["dividends"]
    ]
    if transactions:
        client.table("transactions").upsert(transactions, on_conflict="source_row_hash").execute()
    if dividends:
        client.table("dividends").upsert(dividends, on_conflict="source_row_hash").execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or execute a Supabase migration plan from legacy HTML export.")
    parser.add_argument("legacy_export", type=Path, help="JSON generated by export_legacy_html_state.py.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/legacy/migration_plan.json"),
        help="Destination migration plan JSON path.",
    )
    parser.add_argument("--write", action="store_true", help="Write to Supabase using service-role credentials.")
    args = parser.parse_args()

    export_payload = json.loads(args.legacy_export.read_text(encoding="utf-8"))
    plan = build_plan(export_payload)
    write_json(args.output, plan)
    print(
        "Built migration plan with "
        f"{len(plan['assets'])} assets, {len(plan['transactions'])} transactions, "
        f"{len(plan['dividends'])} dividends."
    )
    if args.write:
        write_to_supabase(plan)


if __name__ == "__main__":
    main()

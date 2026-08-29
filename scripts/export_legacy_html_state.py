from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    from legacy_common import canonical_broker, canonical_symbol, decimal_text, stable_hash, write_json
except ImportError:  # pragma: no cover - used when imported as scripts.export_legacy_html_state
    from scripts.legacy_common import canonical_broker, canonical_symbol, decimal_text, stable_hash, write_json


STATE_PATTERNS = [
    re.compile(r"localStorage\.setItem\(\s*['\"](?P<key>[^'\"]+)['\"]\s*,\s*JSON\.stringify\((?P<value>.*?)\)\s*\)", re.S),
    re.compile(r"localStorage\.setItem\(\s*['\"](?P<key>[^'\"]+)['\"]\s*,\s*['\"](?P<value>[\[{].*?[\]}])['\"]\s*\)", re.S),
    re.compile(r"(?:const|let|var)\s+(?P<key>[A-Za-z0-9_]*state[A-Za-z0-9_]*)\s*=\s*(?P<value>[\[{].*?[\]}])\s*;", re.S | re.I),
]


def extract_seed(html: str) -> dict[str, Any]:
    marker = "const SEED="
    start = html.find(marker)
    if start < 0:
        raise ValueError("Could not find `const SEED=` in the legacy HTML.")
    decoder = json.JSONDecoder()
    seed, _end = decoder.raw_decode(html[start + len(marker) :])
    if not isinstance(seed, dict):
        raise ValueError("`const SEED=` did not contain a JSON object.")
    return seed


def _parse_jsonish(value: str) -> Any:
    cleaned = value.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return cleaned


def extract_html_state(html: str) -> dict[str, Any]:
    extracted: dict[str, Any] = {}
    for pattern in STATE_PATTERNS:
        for match in pattern.finditer(html):
            key = match.group("key")
            if key in extracted:
                continue
            extracted[key] = _parse_jsonish(match.group("value"))
    return extracted


def _asset_type(raw: str | None, symbol: str | None) -> str:
    text = f"{raw or ''} {symbol or ''}".lower()
    if "etf" in text or "ucits" in text:
        return "etf"
    if "fondo" in text or "fund" in text or "sicav" in text:
        return "fund"
    if symbol == "INTERESES":
        return "cash"
    return "stock"


def action_skip_reason(row: dict[str, Any]) -> str | None:
    symbol = canonical_symbol(row.get("ticker"))
    if not symbol:
        return "missing_symbol"
    movement_type = str(row.get("type") or "").lower()
    if not any(word in movement_type for word in ["venta", "sell", "compra", "buy"]):
        return "unsupported_type"
    return None


def normalise_action(row: dict[str, Any]) -> dict[str, Any] | None:
    if action_skip_reason(row):
        return None
    symbol = canonical_symbol(row.get("ticker"))
    movement_type = str(row.get("type") or "").lower()
    tx_type = "sell" if "venta" in movement_type or "sell" in movement_type else "buy"
    quantity = decimal_text(row.get("quantity"))
    if tx_type == "sell" and not quantity.startswith("-"):
        quantity = f"-{quantity}"
    if tx_type == "buy" and quantity.startswith("-"):
        quantity = quantity[1:]
    broker = canonical_broker(row.get("broker"))
    source_row_hash = stable_hash(["html", "actions", row.get("id"), row.get("date"), symbol, quantity])
    return {
        "legacy_id": row.get("id"),
        "broker": broker,
        "trade_date": row.get("date"),
        "type": tx_type,
        "symbol": symbol,
        "raw_name": row.get("name") or symbol,
        "quantity": quantity,
        "gross_amount": decimal_text(row.get("eurCost")),
        "gross_amount_local": decimal_text(row.get("localCost")),
        "price": decimal_text(row.get("eurPrice")),
        "price_local": decimal_text(row.get("localPrice")),
        "fees": "0",
        "tax": "0",
        "currency": row.get("currency") or "EUR",
        "source_file": "legacy-html-actions",
        "source_row_hash": source_row_hash,
        "raw_payload": row,
    }


def dividend_skip_reason(row: dict[str, Any]) -> str | None:
    symbol = canonical_symbol(row.get("ticker"))
    if not symbol:
        return "missing_symbol"
    return None


def normalise_dividend(row: dict[str, Any]) -> dict[str, Any] | None:
    if dividend_skip_reason(row):
        return None
    symbol = canonical_symbol(row.get("ticker"))
    source_row_hash = stable_hash(["html", "dividends", row.get("id"), row.get("date"), symbol])
    return {
        "legacy_id": row.get("id"),
        "broker": canonical_broker(row.get("source") or row.get("broker")),
        "pay_date": row.get("date"),
        "symbol": symbol,
        "raw_name": row.get("name") or symbol,
        "gross_amount": decimal_text(row.get("grossEUR")),
        "gross_amount_local": decimal_text(row.get("grossLocal")),
        "tax": decimal_text(row.get("taxEUR")),
        "tax_local": decimal_text(row.get("taxLocal")),
        "net_amount": decimal_text(row.get("netEUR")),
        "net_amount_local": decimal_text(row.get("netLocal")),
        "currency": row.get("currency") or "EUR",
        "source_file": "legacy-html-dividends",
        "source_row_hash": source_row_hash,
        "raw_payload": row,
    }


def normalise_mapping(row: dict[str, Any]) -> dict[str, Any] | None:
    symbol = canonical_symbol(row.get("ticker"))
    if not symbol:
        return None
    quote_symbol = canonical_symbol(row.get("quoteSymbol"))
    aliases = [
        value
        for value in [row.get("brokerName"), row.get("alias"), row.get("ticker"), row.get("quoteSymbol")]
        if value
    ]
    return {
        "symbol": symbol,
        "quote_symbol": quote_symbol,
        "currency": row.get("currency") or "EUR",
        "asset_type": _asset_type(row.get("assetType"), symbol),
        "broker_names": sorted({str(value).strip() for value in aliases if str(value).strip()}),
        "notes": row.get("notes") or "",
        "raw_payload": row,
    }


def normalise_etf(row: dict[str, Any]) -> dict[str, Any] | None:
    symbol = canonical_symbol(row.get("Ticker") or row.get("ticker"))
    isin = row.get("ISIN") or row.get("isin")
    if not symbol:
        return None
    return {
        "symbol": symbol,
        "isin": str(isin).strip() if isin else None,
        "provider_name": row.get("Proveedor") or row.get("provider") or "",
        "asset_type": "etf",
        "raw_payload": row,
    }


def normalise_manual_price(symbol: str, row: dict[str, Any]) -> dict[str, Any]:
    canonical = canonical_symbol(symbol) or symbol.upper()
    return {
        "symbol": canonical,
        "quote_symbol": canonical_symbol(row.get("quoteSymbol")) or canonical,
        "currency": row.get("currency") or "EUR",
        "price": decimal_text(row.get("price")),
        "to_eur": decimal_text(row.get("toEUR")),
        "last_updated": row.get("lastUpdated"),
        "provider": "legacy_manual",
        "raw_payload": row,
    }


def build_export(html: str, source_file: Path) -> dict[str, Any]:
    seed = extract_seed(html)
    state_blocks = extract_html_state(html)
    raw_actions = seed.get("actions", [])
    raw_dividends = seed.get("dividends", [])
    transactions = [item for row in raw_actions if (item := normalise_action(row))]
    dividends = [item for row in raw_dividends if (item := normalise_dividend(row))]
    mappings = [item for row in seed.get("mappings", []) if (item := normalise_mapping(row))]
    etfs = [item for row in seed.get("etfs", []) if (item := normalise_etf(row))]
    manual_prices = [
        normalise_manual_price(symbol, row) for symbol, row in (seed.get("manualPrices") or {}).items()
    ]
    quote_aliases = [
        {
            "symbol": canonical_symbol(symbol) or str(symbol).upper(),
            "quote_symbol": canonical_symbol(row.get("quoteSymbol")) or str(symbol).upper(),
            "currency": row.get("currency") or "EUR",
            "raw_payload": row,
        }
        for symbol, row in (seed.get("quoteAliases") or {}).items()
    ]

    symbols = [row["symbol"] for row in transactions + dividends]
    source_hashes = [row["source_row_hash"] for row in transactions + dividends]
    return {
        "source_file": str(source_file),
        "seed_meta": {
            "version": seed.get("version"),
            "source_file": seed.get("sourceFile"),
            "migrated_at": seed.get("migratedAt"),
        },
        "summary": {
            "transactions": len(transactions),
            "skipped_transactions": len(raw_actions) - len(transactions),
            "dividends": len(dividends),
            "skipped_dividends": len(raw_dividends) - len(dividends),
            "mappings": len(mappings),
            "etfs": len(etfs),
            "manual_prices": len(manual_prices),
            "quote_aliases": len(quote_aliases),
            "state_blocks": len(state_blocks),
        },
        "validation": {
            "ihyg_final_rows": sum(1 for symbol in symbols if symbol == "IHYG"),
            "iqqj_final_rows": sum(1 for symbol in symbols if symbol == "IQQJ"),
            "eunw_exists": "EUNW" in symbols or "EUNW.DE" in symbols,
            "ijpn_exists": "IJPN" in symbols or "IJPN.DE" in symbols,
            "duplicate_source_row_hashes": len(set(source_hashes)) != len(source_hashes),
            "brokers": sorted({row["broker"] for row in transactions + dividends}),
        },
        "transactions": transactions,
        "dividends": dividends,
        "skipped": {
            "actions": [
                {"reason": reason, "raw_payload": row}
                for row in raw_actions
                if (reason := action_skip_reason(row))
            ],
            "dividends": [
                {"reason": reason, "raw_payload": row}
                for row in raw_dividends
                if (reason := dividend_skip_reason(row))
            ],
        },
        "mappings": mappings,
        "etfs": etfs,
        "manual_prices": manual_prices,
        "quote_aliases": quote_aliases,
        "cash": seed.get("cash") or {},
        "property": seed.get("property") or [],
        "wealth_rows": seed.get("wealthRows") or [],
        "wealth_summary": seed.get("wealthSummary") or [],
        "raw_state_keys": sorted(seed.keys()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract embedded JSON-like state from the legacy HTML dashboard.")
    parser.add_argument("input", type=Path, help="Path to the legacy dashboard HTML.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/legacy/html_state.json"),
        help="Destination JSON path.",
    )
    args = parser.parse_args()

    html = args.input.read_text(encoding="utf-8", errors="replace")
    payload = build_export(html, args.input)
    write_json(args.output, payload)
    print(
        "Exported "
        f"{payload['summary']['transactions']} transactions, "
        f"{payload['summary']['dividends']} dividends, "
        f"{payload['summary']['mappings']} mappings to {args.output}"
    )


if __name__ == "__main__":
    main()

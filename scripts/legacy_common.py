from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


KNOWN_SYMBOL_ALIASES = {
    "IHYG": "EUNW",
    "IHYG.DE": "EUNW.DE",
    "IQQJ": "IJPN",
    "IQQJ.DE": "IJPN.DE",
}

BROKER_ALIASES = {
    "IB": "IBKR",
    "INTERACTIVE BROKERS": "IBKR",
    "IBKR": "IBKR",
    "MYINVESTOR": "MyInvestor",
    "MY INVESTOR": "MyInvestor",
    "TRADE REPUBLIC": "Trade Republic",
    "TRADE REPUBLI": "Trade Republic",
    "TR": "Trade Republic",
}


def canonical_symbol(symbol: Any) -> str | None:
    if symbol is None:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9.\-]", "", str(symbol)).upper()
    if not cleaned:
        return None
    return KNOWN_SYMBOL_ALIASES.get(cleaned, cleaned)


def canonical_broker(broker: Any) -> str:
    cleaned = str(broker or "").strip()
    return BROKER_ALIASES.get(cleaned.upper(), cleaned or "Unknown")


def decimal_text(value: Any) -> str:
    if value is None or value == "":
        return "0"
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (int, float)):
        return str(Decimal(str(value)))
    cleaned = str(value).replace("\u00a0", "").replace(" ", "")
    cleaned = re.sub(r"[^0-9,.\-]", "", cleaned)
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    return str(Decimal(cleaned or "0"))


def iso_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    cleaned = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(cleaned[:10], fmt).date().isoformat()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(cleaned.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def stable_hash(parts: list[Any]) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

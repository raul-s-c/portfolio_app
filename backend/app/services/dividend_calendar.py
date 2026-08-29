from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import httpx
from supabase import Client

from app.core.config import get_settings
from app.services.research_reports import brave_search


@dataclass(frozen=True)
class CalendarRequest:
    max_positions: int = 80
    max_web_results: int = 5
    focus: str | None = None


def dividend_calendar_context(client: Client, max_positions: int = 80) -> dict[str, Any]:
    positions = (
        client.table("v_open_positions")
        .select("*")
        .in_("asset_type", ["stock", "etf"])
        .order("market_value", desc=True)
        .limit(max_positions)
        .execute()
        .data
    )
    asset_ids = [row["asset_id"] for row in positions]
    identifiers = (
        client.table("asset_identifiers")
        .select("asset_id,provider,symbol,exchange,is_primary")
        .in_("asset_id", asset_ids or ["00000000-0000-0000-0000-000000000000"])
        .execute()
        .data
    )
    identifiers_by_asset: dict[str, list[dict[str, Any]]] = {}
    primary_by_asset: dict[str, str] = {}
    for row in identifiers:
        identifiers_by_asset.setdefault(row["asset_id"], []).append(row)
        if row.get("is_primary") and row["asset_id"] not in primary_by_asset:
            primary_by_asset[row["asset_id"]] = row["symbol"]

    return {
        "as_of": datetime.now(UTC).isoformat(),
        "positions": [
            {
                "asset_id": row["asset_id"],
                "broker_id": row["broker_id"],
                "symbol": primary_by_asset.get(row["asset_id"], row.get("name", "")),
                "name": row.get("name"),
                "asset_type": row.get("asset_type"),
                "broker": row.get("broker"),
                "quantity": float(row.get("quantity") or 0),
                "price_currency": row.get("price_currency"),
                "identifiers": identifiers_by_asset.get(row["asset_id"], []),
            }
            for row in positions
        ],
    }


def dividend_calendar_queries(context: dict[str, Any], request: CalendarRequest) -> list[dict[str, Any]]:
    searches = []
    current_year = datetime.now(UTC).year
    focus = f" {request.focus}" if request.focus else ""
    for position in context.get("positions", [])[: request.max_positions]:
        symbol = position.get("symbol")
        name = position.get("name")
        query = (
            f"{symbol} {name} declared dividend ex-dividend date record date payment date "
            f"{current_year} {current_year + 1}{focus}"
        )
        searches.append({"asset_id": position["asset_id"], "broker_id": position["broker_id"], "query": query})
    return searches


async def collect_declared_dividend_sources(
    context: dict[str, Any], request: CalendarRequest
) -> list[dict[str, Any]]:
    searches = []
    for item in dividend_calendar_queries(context, request):
        result = await brave_search(item["query"])
        result["asset_id"] = item["asset_id"]
        result["broker_id"] = item["broker_id"]
        result["results"] = result.get("results", [])[: request.max_web_results]
        searches.append(result)
    if searches and all(not search.get("results") for search in searches):
        raise RuntimeError("Brave search did not return declared dividend sources")
    return searches


def dividend_calendar_system_prompt() -> str:
    return (
        "Eres un analista de datos financieros. Extraes dividendos declarados de resultados web "
        "obtenidos con Brave. Devuelve solo JSON valido. No inventes dividendos no declarados. "
        "Si una fuente no confirma importe y fecha, marca status='unconfirmed' y confidence bajo."
    )


def dividend_calendar_user_prompt(
    position: dict[str, Any],
    search: dict[str, Any],
) -> str:
    return (
        "Extrae dividendos declarados o anunciados para esta posicion. Solo eventos futuros o "
        "muy recientes que aun puedan estar pendientes de cobro. Usa fechas ISO YYYY-MM-DD si se conocen.\n\n"
        f"Posicion JSON:\n{json.dumps(position, ensure_ascii=False)}\n\n"
        f"Resultados Brave JSON:\n{json.dumps(search, ensure_ascii=False)}\n\n"
        "Devuelve este JSON exacto: "
        '{"events":[{"ex_date":null,"record_date":null,"payment_date":null,'
        '"declaration_date":null,"dividend_amount":0,"currency":"EUR","frequency":null,'
        '"status":"declared","source_url":null,"source_title":null,"confidence":0.0,'
        '"notes":null}]}'
    )


async def extract_dividend_events(position: dict[str, Any], search: dict[str, Any]) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY missing")
    async with httpx.AsyncClient(timeout=settings.research_request_timeout_seconds) as http:
        response = await http.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.openai_model,
                "instructions": dividend_calendar_system_prompt(),
                "input": [
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": dividend_calendar_user_prompt(position, search)}],
                    }
                ],
                "store": False,
                "temperature": 0.0,
                "max_output_tokens": min(settings.openai_report_max_output_tokens, 1800),
            },
        )
        response.raise_for_status()
    parsed = parse_json_response(response.json())
    return [normalize_event(event) for event in parsed.get("events", []) if isinstance(event, dict)]


def parse_json_response(data: dict[str, Any]) -> dict[str, Any]:
    text = data.get("output_text") or ""
    if not text:
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    text += content.get("text") or ""
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return {"events": []}
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"events": []}
    return value if isinstance(value, dict) else {"events": []}


def normalize_event(event: dict[str, Any]) -> dict[str, Any]:
    amount = float(event.get("dividend_amount") or 0)
    confidence = max(0.0, min(1.0, float(event.get("confidence") or 0)))
    return {
        "ex_date": clean_date(event.get("ex_date")),
        "record_date": clean_date(event.get("record_date")),
        "payment_date": clean_date(event.get("payment_date")),
        "declaration_date": clean_date(event.get("declaration_date")),
        "dividend_amount": amount,
        "currency": normalize_currency(event.get("currency")),
        "frequency": event.get("frequency"),
        "status": event.get("status") or "unconfirmed",
        "source_url": event.get("source_url"),
        "source_title": event.get("source_title"),
        "confidence": confidence,
        "notes": event.get("notes"),
    }


def calculate_expected_amount(quantity: float, dividend_amount: float) -> float:
    return quantity * dividend_amount


def calendar_row(position: dict[str, Any], event: dict[str, Any], raw_payload: dict[str, Any]) -> dict[str, Any]:
    quantity = float(position.get("quantity") or 0)
    dividend_amount = float(event.get("dividend_amount") or 0)
    return {
        "asset_id": position["asset_id"],
        "broker_id": position["broker_id"],
        "symbol": position.get("symbol"),
        "asset_name": position.get("name"),
        "asset_type": position.get("asset_type"),
        "broker": position.get("broker"),
        "quantity": quantity,
        "ex_date": event.get("ex_date"),
        "record_date": event.get("record_date"),
        "payment_date": event.get("payment_date"),
        "declaration_date": event.get("declaration_date"),
        "dividend_amount": dividend_amount,
        "currency": event.get("currency"),
        "expected_gross_amount": calculate_expected_amount(quantity, dividend_amount),
        "status": event.get("status"),
        "confidence": event.get("confidence"),
        "source_url": event.get("source_url"),
        "source_title": event.get("source_title"),
        "notes": event.get("notes"),
        "raw_payload": raw_payload,
    }


async def refresh_dividend_calendar(client: Client, request: CalendarRequest) -> dict[str, Any]:
    context = dividend_calendar_context(client, request.max_positions)
    searches = await collect_declared_dividend_sources(context, request)
    searches_by_key = {(row["asset_id"], row["broker_id"]): row for row in searches}
    rows = []
    for position in context["positions"]:
        search = searches_by_key.get((position["asset_id"], position["broker_id"]))
        if not search:
            continue
        events = await extract_dividend_events(position, search)
        for event in events:
            if not event.get("payment_date") and not event.get("ex_date"):
                continue
            rows.append(calendar_row(position, event, {"search": search, "event": event}))
    inserted = []
    for row in rows:
        result = (
            client.table("dividend_calendar_events")
            .upsert(
                row,
                on_conflict="asset_id,broker_id,ex_date,payment_date,dividend_amount,currency",
            )
            .execute()
        )
        inserted.extend(result.data or [])
    return {"status": "ok", "positions": len(context["positions"]), "events": len(inserted)}


def clean_date(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)[:10]
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return None


def normalize_currency(value: Any) -> str:
    currency = str(value or "EUR").strip().upper()
    return currency if re.fullmatch(r"[A-Z]{3}", currency) else "EUR"

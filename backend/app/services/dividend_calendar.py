from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from html import unescape
from statistics import median
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
    raw_positions = (
        client.table("v_open_positions")
        .select("*")
        .in_("asset_type", ["stock", "etf"])
        .order("market_value", desc=True)
        .limit(max_positions)
        .execute()
        .data
    )
    positions_by_key = {
        (row["asset_id"], row["broker_id"]): row
        for row in raw_positions
        if float(row.get("quantity") or 0) > 0.00000001
    }
    positions = list(positions_by_key.values())
    asset_ids = [row["asset_id"] for row in positions]
    assets = (
        client.table("assets")
        .select("id,isin,currency,name,asset_type")
        .in_("id", asset_ids or ["00000000-0000-0000-0000-000000000000"])
        .execute()
        .data
    )
    assets_by_id = {row["id"]: row for row in assets}
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
                "name": assets_by_id.get(row["asset_id"], {}).get("name") or row.get("name"),
                "asset_type": assets_by_id.get(row["asset_id"], {}).get("asset_type") or row.get("asset_type"),
                "isin": assets_by_id.get(row["asset_id"], {}).get("isin"),
                "asset_currency": assets_by_id.get(row["asset_id"], {}).get("currency"),
                "broker": row.get("broker"),
                "quantity": float(row.get("quantity") or 0),
                "price_currency": row.get("price_currency"),
                "identifiers": identifiers_by_asset.get(row["asset_id"], []),
            }
            for row in positions
        ],
    }


def unique_terms(values: list[Any], limit: int = 8) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.upper()
        if key in seen:
            continue
        seen.add(key)
        terms.append(text)
        if len(terms) >= limit:
            break
    return terms


def position_search_terms(position: dict[str, Any]) -> dict[str, list[str] | str]:
    identifiers = position.get("identifiers") or []
    symbols = unique_terms(
        [
            position.get("symbol"),
            *[row.get("symbol") for row in identifiers if row.get("symbol")],
        ]
    )
    isin = str(position.get("isin") or "").strip()
    name = str(position.get("name") or "").strip()
    return {"symbols": symbols, "isin": isin, "name": name}


def dividend_calendar_query_variants(position: dict[str, Any], request: CalendarRequest) -> list[str]:
    current_year = datetime.now(UTC).year
    focus = f" {request.focus}" if request.focus else ""
    terms = position_search_terms(position)
    symbols = terms["symbols"] if isinstance(terms["symbols"], list) else []
    isin = str(terms["isin"] or "")
    name = str(terms["name"] or "")
    symbol_text = " ".join(symbols[:3])
    common_tail = f"{current_year} {current_year + 1}{focus}"

    if position.get("asset_type") == "etf":
        core = unique_terms([isin, name, symbol_text], limit=3)
        return [
            f"{' '.join(core)} ETF distribution dividend ex-dividend payment date {common_tail}",
            f"{isin or name} ETF dividends distributions income payment date {common_tail}",
            f"{isin or name} UCITS ETF distribution calendar ex date pay date {common_tail}",
            f"site:justetf.com {isin or name} distributions dividends",
        ]

    return [
        f"{symbol_text} {name} declared dividend ex-dividend date record date payment date {common_tail}",
        f"{symbol_text or name} dividend announcement payment date ex-date {common_tail}",
    ]


def dividend_calendar_queries(context: dict[str, Any], request: CalendarRequest) -> list[dict[str, Any]]:
    searches = []
    seen_assets: set[str] = set()
    for position in context.get("positions", [])[: request.max_positions]:
        asset_id = position["asset_id"]
        if asset_id in seen_assets:
            continue
        seen_assets.add(asset_id)
        for query in dividend_calendar_query_variants(position, request):
            searches.append(
                {
                    "asset_id": asset_id,
                    "query": query,
                }
            )
    return searches


async def collect_declared_dividend_sources(
    context: dict[str, Any], request: CalendarRequest
) -> list[dict[str, Any]]:
    searches_by_key: dict[str, dict[str, Any]] = {}
    for item in dividend_calendar_queries(context, request):
        result = await brave_search(item["query"])
        key = item["asset_id"]
        existing = searches_by_key.setdefault(
            key,
            {
                "asset_id": item["asset_id"],
                "queries": [],
                "results": [],
            },
        )
        existing["queries"].append(item["query"])
        seen_urls = {row.get("url") for row in existing["results"]}
        for row in result.get("results", []):
            if row.get("url") in seen_urls:
                continue
            existing["results"].append(row)
            seen_urls.add(row.get("url"))
            if len(existing["results"]) >= request.max_web_results:
                break
    searches = list(searches_by_key.values())
    if searches and all(not search.get("results") for search in searches):
        raise RuntimeError("Brave search did not return declared dividend sources")
    return searches


async def fetch_result_excerpt(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=12.0,
            headers={"User-Agent": "Mozilla/5.0 PortfolioDividendCalendar/1.0"},
        ) as http:
            response = await http.get(url)
            response.raise_for_status()
    except httpx.HTTPError:
        return None
    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type and "text/plain" not in content_type:
        return None
    text = response.text[:120_000]
    text = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    keyword_pattern = re.compile(
        r"(.{0,280}(dividend|distribution|ex-date|ex dividend|pay date|payment date|income).{0,700})",
        flags=re.IGNORECASE,
    )
    date_pattern = re.compile(
        r"\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}|"
        r"\d{1,2}\s+[A-Za-z]{3,12}\s+20\d{2}|[A-Za-z]{3,12}\s+\d{1,2},?\s+20\d{2})\b"
    )
    amount_pattern = re.compile(r"(\b(EUR|USD|GBP|CHF|GBX|GBp)\b|[$€£]\s?\d|\d+[.,]\d{2,6})")
    candidates = []
    for match in keyword_pattern.finditer(text):
        excerpt = match.group(1).strip()
        score = 0
        score += 4 if date_pattern.search(excerpt) else 0
        score += 3 if amount_pattern.search(excerpt) else 0
        score += 2 if re.search(r"ex[- ]?(date|dividend)|pay(ment)? date", excerpt, re.IGNORECASE) else 0
        score += 1 if re.search(r"declared|issuer|distribution", excerpt, re.IGNORECASE) else 0
        candidates.append((score, excerpt))
    if candidates:
        candidates.sort(key=lambda item: item[0], reverse=True)
        excerpts = [excerpt for score, excerpt in candidates if score > 0] or [excerpt for _, excerpt in candidates]
        return "\n".join(excerpts[:10])[:9000]
    return text[:2500]


async def enrich_search_with_page_excerpts(
    position: dict[str, Any],
    search: dict[str, Any],
    max_pages: int = 4,
) -> dict[str, Any]:
    if position.get("asset_type") != "etf":
        return search
    enriched_results = []
    for result in search.get("results", [])[:max_pages]:
        url = result.get("url")
        if url:
            excerpt = await fetch_result_excerpt(url)
            if excerpt:
                result = {**result, "page_excerpt": excerpt}
        enriched_results.append(result)
    return {**search, "results": enriched_results + search.get("results", [])[max_pages:]}


async def yahoo_dividend_history(symbol: str) -> list[dict[str, Any]]:
    now = int(datetime.now(UTC).timestamp())
    start = now - 900 * 24 * 60 * 60
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as http:
            response = await http.get(
                url,
                params={
                    "period1": start,
                    "period2": now + 60 * 24 * 60 * 60,
                    "interval": "1d",
                    "events": "div",
                },
                headers={"User-Agent": "Mozilla/5.0 PortfolioDividendCalendar/1.0"},
            )
            response.raise_for_status()
    except httpx.HTTPError:
        return []
    try:
        result = response.json()["chart"]["result"][0]
        dividends = result.get("events", {}).get("dividends", {})
    except (KeyError, IndexError, TypeError):
        return []
    events = []
    for item in dividends.values():
        amount = item.get("amount")
        timestamp = item.get("date")
        if not amount or not timestamp:
            continue
        events.append(
            {
                "ex_date": datetime.fromtimestamp(int(timestamp), UTC).date(),
                "dividend_amount": float(amount),
            }
        )
    return sorted(events, key=lambda item: item["ex_date"])


def infer_next_distribution_from_history(history: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not history:
        return None
    today = datetime.now(UTC).date()
    latest = history[-1]
    if latest["ex_date"] >= today:
        next_ex_date = latest["ex_date"]
        status = "declared_yahoo"
        confidence = 0.62
    else:
        intervals = [
            (history[index]["ex_date"] - history[index - 1]["ex_date"]).days
            for index in range(1, len(history))
            if (history[index]["ex_date"] - history[index - 1]["ex_date"]).days > 0
        ]
        if not intervals:
            return None
        interval = round(median(intervals))
        if interval < 20 or interval > 370:
            return None
        next_ex_date = latest["ex_date"]
        while next_ex_date <= today:
            next_ex_date = next_ex_date.fromordinal(next_ex_date.toordinal() + interval)
        status = "estimated_from_history"
        confidence = 0.38
    return {
        "ex_date": next_ex_date.isoformat(),
        "record_date": None,
        "payment_date": None,
        "declaration_date": None,
        "dividend_amount": latest["dividend_amount"],
        "currency": None,
        "frequency": None,
        "status": status,
        "source_url": None,
        "source_title": "Yahoo Finance dividend history",
        "confidence": confidence,
        "notes": "Estimacion desde historico de distribuciones; revisar fuente antes de darlo por definitivo.",
    }


async def estimate_etf_distribution_from_history(position: dict[str, Any]) -> dict[str, Any] | None:
    if position.get("asset_type") != "etf":
        return None
    terms = position_search_terms(position)
    symbols = terms["symbols"] if isinstance(terms["symbols"], list) else []
    for symbol in symbols:
        history = await yahoo_dividend_history(symbol)
        estimate = infer_next_distribution_from_history(history)
        if estimate:
            estimate["currency"] = position.get("asset_currency") or position.get("price_currency") or "EUR"
            estimate["source_url"] = f"https://finance.yahoo.com/quote/{symbol}/history?filter=div"
            estimate["notes"] = f"{estimate['notes']} Simbolo usado: {symbol}."
            return normalize_event(estimate)
    return None


def dividend_calendar_system_prompt() -> str:
    return (
        "Eres un analista de datos financieros. Extraes dividendos declarados de resultados web "
        "obtenidos con Brave. Para ETFs, trata 'distribution', 'income distribution', 'dividend' "
        "y 'pay date' como equivalentes; si el ETF es acumulativo y no reparte, devuelve events vacio. "
        "Respeta el ISIN y nombre exactos del instrumento: no mezcles ETFs UCITS europeos con tickers "
        "similares de EEUU si el ISIN no coincide. "
        "Devuelve solo JSON valido. No inventes dividendos no declarados. "
        "Si una fuente no confirma importe y fecha, marca status='unconfirmed' y confidence bajo."
    )


def dividend_calendar_user_prompt(
    position: dict[str, Any],
    search: dict[str, Any],
) -> str:
    return (
        "Extrae dividendos declarados o anunciados para esta posicion. Solo eventos futuros o "
        "muy recientes que aun puedan estar pendientes de cobro. Usa fechas ISO YYYY-MM-DD si se conocen. "
        f"Fecha actual: {datetime.now(UTC).date().isoformat()}.\n\n"
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
    searches_by_asset = {row["asset_id"]: row for row in searches}
    positions_by_asset: dict[str, list[dict[str, Any]]] = {}
    for position in context["positions"]:
        positions_by_asset.setdefault(position["asset_id"], []).append(position)
    rows_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    for asset_id, asset_positions in positions_by_asset.items():
        representative = asset_positions[0]
        search = searches_by_asset.get(asset_id)
        if not search:
            continue
        search = await enrich_search_with_page_excerpts(representative, search)
        events = await extract_dividend_events(representative, search)
        valid_events = [
            event
            for event in events
            if (event.get("payment_date") or event.get("ex_date"))
            and float(event.get("dividend_amount") or 0) > 0
        ]
        if not valid_events:
            estimated_event = await estimate_etf_distribution_from_history(representative)
            if estimated_event:
                valid_events = [estimated_event]
        for event in valid_events:
            for position in asset_positions:
                row = calendar_row(position, event, {"search": search, "event": event})
                key = (
                    row["asset_id"],
                    row["broker_id"],
                    row.get("ex_date"),
                    row.get("payment_date"),
                    row["dividend_amount"],
                    row["currency"],
                )
                rows_by_key[key] = row
    rows = list(rows_by_key.values())
    client.table("dividend_calendar_events").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()
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
    return {
        "status": "ok",
        "assets": len(positions_by_asset),
        "positions": len(context["positions"]),
        "events": len(inserted),
    }


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

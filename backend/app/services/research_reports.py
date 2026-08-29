from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Literal

import httpx
from supabase import Client

from app.core.config import get_settings

ReportType = Literal[
    "portfolio_periodic",
    "rebalance_opportunity",
    "portfolio_group_analysis",
    "etf_resilient_portfolio",
]
STRATEGIC_ETF_TAG = "myinvestor_resilient_etf"


@dataclass(frozen=True)
class ReportRequest:
    report_type: ReportType
    focus: str | None = None
    max_positions: int = 12
    max_web_results: int = 6
    period_start: date | None = None
    period_end: date | None = None


def portfolio_context(client: Client, max_positions: int = 250) -> dict[str, Any]:
    positions = (
        client.table("v_open_positions")
        .select("*")
        .order("market_value", desc=True)
        .limit(max_positions)
        .execute()
        .data
    )
    assets = (
        client.table("assets")
        .select("id,asset_type,name,isin,currency,country,sector,notes")
        .execute()
        .data
    )
    dividends = (
        client.table("dividends")
        .select("pay_date,net_amount,currency,asset_id,broker_id")
        .order("pay_date", desc=True)
        .limit(80)
        .execute()
        .data
    )
    asset_tags = asset_tags_by_asset(client)
    identifiers = (
        client.table("asset_identifiers")
        .select("asset_id,provider,symbol,exchange,is_primary")
        .in_("asset_id", [row["asset_id"] for row in positions] or ["00000000-0000-0000-0000-000000000000"])
        .execute()
        .data
    )
    symbol_by_asset: dict[str, str] = {}
    identifiers_by_asset: dict[str, list[dict[str, Any]]] = {}
    for row in identifiers:
        identifiers_by_asset.setdefault(row["asset_id"], []).append(
            {
                "provider": row.get("provider"),
                "symbol": row.get("symbol"),
                "exchange": row.get("exchange"),
                "is_primary": row.get("is_primary"),
            }
        )
        if row.get("is_primary") and row["asset_id"] not in symbol_by_asset:
            symbol_by_asset[row["asset_id"]] = row["symbol"]

    total_market = sum(float(row.get("market_value") or 0) for row in positions)
    total_cost = sum(float(row.get("cost_basis_naive") or 0) for row in positions)
    asset_by_id = {row["id"]: row for row in assets}
    positions_out = []
    for row in positions:
        market_value = float(row.get("market_value") or 0)
        cost_basis = float(row.get("cost_basis_naive") or 0)
        asset = asset_by_id.get(row["asset_id"], {})
        positions_out.append(
            {
                "asset_id": row["asset_id"],
                "symbol": symbol_by_asset.get(row["asset_id"], row.get("name", "")),
                "name": row.get("name"),
                "asset_type": row.get("asset_type"),
                "isin": asset.get("isin"),
                "country": asset.get("country"),
                "sector": asset.get("sector"),
                "tags": asset_tags.get(row["asset_id"], []),
                "identifiers": identifiers_by_asset.get(row["asset_id"], []),
                "broker": row.get("broker"),
                "quantity": float(row.get("quantity") or 0),
                "currency": row.get("price_currency"),
                "market_value_eur": market_value,
                "cost_basis_eur": cost_basis,
                "latent_gain_eur": market_value - cost_basis,
                "weight": market_value / total_market if total_market else 0,
            }
        )
    groups = {
        asset_type: summarize_group([row for row in positions_out if row["asset_type"] == asset_type], total_market)
        for asset_type in ("stock", "etf", "fund")
    }
    strategic_etfs = [
        row
        for row in positions_out
        if row["asset_type"] == "etf"
        and (STRATEGIC_ETF_TAG in row["tags"] or row.get("broker", "").casefold() == "myinvestor")
    ]

    return {
        "as_of": datetime.now(UTC).isoformat(),
        "totals": {
            "market_value_eur": total_market,
            "cost_basis_eur": total_cost,
            "latent_gain_eur": total_market - total_cost,
        },
        "groups": groups,
        "positions": positions_out,
        "strategic_etf_policy": {
            "tag": STRATEGIC_ETF_TAG,
            "description": (
                "Cartera de ETFs MyInvestor orientada a resistencia en todos los entornos "
                "macroeconomicos de largo plazo, dividendo esperado de inflacion +2% aprox. "
                "y crecimiento esperado de +4/6% anual."
            ),
            "positions": strategic_etfs,
        },
        "recent_dividends": dividends,
    }


def asset_tags_by_asset(client: Client) -> dict[str, list[str]]:
    try:
        rows = client.table("asset_tags").select("asset_id,tag").execute().data
    except Exception:  # noqa: BLE001 - allows first run before migration 011 exists.
        return {}
    tags: dict[str, list[str]] = {}
    for row in rows:
        tags.setdefault(row["asset_id"], []).append(row["tag"])
    return tags


def summarize_group(rows: list[dict[str, Any]], total_market: float) -> dict[str, Any]:
    market_value = sum(row["market_value_eur"] for row in rows)
    cost_basis = sum(row["cost_basis_eur"] for row in rows)
    return {
        "count": len(rows),
        "market_value_eur": market_value,
        "cost_basis_eur": cost_basis,
        "latent_gain_eur": market_value - cost_basis,
        "portfolio_weight": market_value / total_market if total_market else 0,
        "positions": rows,
    }


def build_queries(context: dict[str, Any], request: ReportRequest) -> list[str]:
    focus = f" {request.focus}" if request.focus else ""
    if request.report_type == "portfolio_group_analysis":
        return [
            "global equity market outlook rates inflation earnings risk premium",
            "ETF market outlook fixed income equities commodities inflation",
            "mutual funds Europe market outlook rates credit equity allocation",
        ][: request.max_web_results]
    if request.report_type == "etf_resilient_portfolio":
        etfs = context.get("strategic_etf_policy", {}).get("positions", [])
        tickers = [row["symbol"] for row in etfs if row.get("symbol")]
        if not tickers:
            return [
                "all weather ETF portfolio inflation dividend growth long term macro regimes",
            ]
        return [
            f"{symbol} ETF holdings yield duration inflation outlook macro role{focus}"
            for symbol in tickers[: request.max_web_results]
        ]
    positions = context.get("positions", [])[: request.max_positions]
    tickers = [row["symbol"] for row in positions if row.get("symbol")]
    if request.report_type == "rebalance_opportunity":
        return [
            f"{symbol} stock ETF valuation earnings balance sheet outlook{focus}"
            for symbol in tickers[: request.max_web_results]
        ]
    return [f"{symbol} latest news earnings guidance valuation" for symbol in tickers[: request.max_web_results]]


async def brave_search(query: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.brave_search_api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY missing")
    async with httpx.AsyncClient(timeout=settings.research_request_timeout_seconds) as http:
        response = await http.get(
            settings.brave_search_endpoint,
            params={"q": query, "count": 5, "freshness": "pm"},
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": settings.brave_search_api_key,
            },
        )
        response.raise_for_status()
        data = response.json()
    return {
        "query": query,
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "description": item.get("description"),
                "age": item.get("age"),
            }
            for item in (data.get("web", {}).get("results") or [])[:5]
        ],
    }


async def collect_web_context(context: dict[str, Any], request: ReportRequest) -> list[dict[str, Any]]:
    searches = []
    for query in build_queries(context, request):
        try:
            searches.append(await brave_search(query))
        except Exception as exc:
            if "BRAVE_SEARCH_API_KEY missing" in str(exc):
                raise
            searches.append({"query": query, "error": str(exc), "results": []})
    if searches and all(not search.get("results") for search in searches):
        raise RuntimeError("Brave search did not return usable web context")
    return searches


def system_prompt() -> str:
    return (
        "Eres un analista de cartera personal. No das asesoramiento financiero personalizado "
        "como mandato; produces un informe razonado, prudente y auditable. Distingue hechos, "
        "inferencias e incertidumbre. La busqueda web se ha hecho exclusivamente con Brave; "
        "usa esos resultados solo como contexto y cita URLs cuando apoyen una observacion. "
        "Se conciso, util y orientado a revision periodica. Responde en espanol."
    )


def user_prompt(context: dict[str, Any], web_context: list[dict[str, Any]], request: ReportRequest) -> str:
    if request.report_type == "portfolio_group_analysis":
        purpose = (
            "Genera un analisis de la cartera actual por grupos: Acciones, ETF y Fondos. "
            "Para cada grupo explica peso, concentracion, rendimiento latente, riesgos, divisas, "
            "calidad de los datos y puntos concretos a revisar. No mezcles grupos."
        )
        output_format = (
            "Formato: titulo, resumen ejecutivo en 5 bullets, tabla por grupo, analisis de Acciones, "
            "analisis de ETF, analisis de Fondos, alertas de datos, acciones sugeridas, fuentes."
        )
    elif request.report_type == "etf_resilient_portfolio":
        purpose = (
            "Genera un resumen sencillo de todos los ETF etiquetados como cartera ETF MyInvestor "
            "resistente. Analiza cada ETF individualmente y despues el conjunto. El enfoque conjunto "
            "es largo plazo, resistencia en todos los entornos macroeconomicos, dividendo esperado "
            "aproximado de inflacion +2% y crecimiento esperado de +4/6% anual. Evalua rol macro, "
            "estado actual, perspectivas, riesgos, solapamientos y si ayuda o no al objetivo."
        )
        output_format = (
            "Formato: titulo, resumen ejecutivo, lectura del conjunto, tabla ETF por ETF con rol/estado/"
            "perspectiva/riesgo, huecos de la cartera, senales a vigilar, fuentes."
        )
    elif request.report_type == "rebalance_opportunity":
        purpose = (
            "Genera una recomendacion de donde ponderar nuevas aportaciones, comparando pesos "
            "actuales, concentracion, coste, moneda, balances/fundamentales iniciales disponibles "
            "en la busqueda web y posibles ofertas de precio. No recomiendes vender salvo riesgo claro."
        )
        output_format = "Formato: titulo, resumen ejecutivo, candidatos a ponderar, evitar por ahora, riesgos, fuentes."
    else:
        purpose = (
            "Genera un informe periodico de cartera: cambios relevantes, riesgos, concentracion, "
            "dividendos, divisas, posiciones que revisar y lista de seguimiento para la proxima revision."
        )
        output_format = "Formato: titulo, resumen ejecutivo, observaciones por activo, riesgos, acciones sugeridas, fuentes."
    return (
        f"{purpose}\n\n"
        f"Foco adicional del usuario: {request.focus or 'ninguno'}\n\n"
        f"Contexto de cartera JSON:\n{context}\n\n"
        f"Contexto web obtenido con Brave JSON:\n{web_context}\n\n"
        f"{output_format}\n\n"
        "No inventes datos que no esten en la cartera o en las fuentes. Si falta una fuente para un ETF, dilo."
    )


async def call_openai(prompt: str) -> str:
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
                "instructions": system_prompt(),
                "input": [
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": prompt}],
                    }
                ],
                "store": False,
                "temperature": 0.2,
                "max_output_tokens": settings.openai_report_max_output_tokens,
            },
        )
        response.raise_for_status()
    data = response.json()
    if data.get("output_text"):
        return data["output_text"]
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"]
    raise RuntimeError("OpenAI response did not include output text")


async def generate_research_report(client: Client, request: ReportRequest) -> dict[str, Any]:
    context = portfolio_context(client, request.max_positions)
    web_context = await collect_web_context(context, request)
    prompt = user_prompt(context, web_context, request)
    content = await call_openai(prompt)
    title = report_title(request.report_type)
    row = {
        "report_type": request.report_type,
        "title": title,
        "period_start": request.period_start.isoformat() if request.period_start else None,
        "period_end": (
            request.period_end.isoformat()
            if request.period_end
            else datetime.now(UTC).date().isoformat()
        ),
        "prompt": prompt,
        "portfolio_context": context,
        "web_context": {"provider": "brave", "searches": web_context},
        "content_markdown": content,
        "model": get_settings().openai_model,
    }
    inserted = client.table("research_reports").insert(row).execute().data[0]
    return {"status": "ok", "report": inserted}


def report_title(report_type: ReportType) -> str:
    titles = {
        "portfolio_periodic": "Informe periodico de cartera",
        "rebalance_opportunity": "Recomendacion de ponderacion",
        "portfolio_group_analysis": "Analisis de cartera por grupo",
        "etf_resilient_portfolio": "Revision cartera ETF resistente MyInvestor",
    }
    return titles[report_type]

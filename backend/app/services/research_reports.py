from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any, Literal

import httpx

from app.core.config import get_settings

if TYPE_CHECKING:
    from supabase import Client


ReportType = Literal["portfolio_periodic", "rebalance_opportunity"]


@dataclass(frozen=True)
class ReportRequest:
    report_type: ReportType
    focus: str | None = None
    max_positions: int = 12
    max_web_results: int = 6
    period_start: date | None = None
    period_end: date | None = None


def portfolio_context(client: "Client", max_positions: int = 12) -> dict[str, Any]:
    positions = (
        client.table("v_open_positions")
        .select("*")
        .order("market_value", desc=True)
        .limit(max_positions)
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
    identifiers = (
        client.table("asset_identifiers")
        .select("asset_id,provider,symbol,is_primary")
        .in_("asset_id", [row["asset_id"] for row in positions] or ["00000000-0000-0000-0000-000000000000"])
        .execute()
        .data
    )
    symbol_by_asset: dict[str, str] = {}
    for row in identifiers:
        if row.get("is_primary") and row["asset_id"] not in symbol_by_asset:
            symbol_by_asset[row["asset_id"]] = row["symbol"]

    total_market = sum(float(row.get("market_value") or 0) for row in positions)
    total_cost = sum(float(row.get("cost_basis_naive") or 0) for row in positions)
    positions_out = []
    for row in positions:
        market_value = float(row.get("market_value") or 0)
        cost_basis = float(row.get("cost_basis_naive") or 0)
        positions_out.append(
            {
                "asset_id": row["asset_id"],
                "symbol": symbol_by_asset.get(row["asset_id"], row.get("name", "")),
                "name": row.get("name"),
                "asset_type": row.get("asset_type"),
                "broker": row.get("broker"),
                "quantity": float(row.get("quantity") or 0),
                "currency": row.get("price_currency"),
                "market_value_eur": market_value,
                "cost_basis_eur": cost_basis,
                "latent_gain_eur": market_value - cost_basis,
                "weight": market_value / total_market if total_market else 0,
            }
        )

    return {
        "as_of": datetime.now(UTC).isoformat(),
        "totals": {
            "market_value_eur": total_market,
            "cost_basis_eur": total_cost,
            "latent_gain_eur": total_market - total_cost,
        },
        "positions": positions_out,
        "recent_dividends": dividends,
    }


def build_queries(context: dict[str, Any], request: ReportRequest) -> list[str]:
    positions = context.get("positions", [])[: request.max_positions]
    tickers = [row["symbol"] for row in positions if row.get("symbol")]
    if request.report_type == "rebalance_opportunity":
        focus = f" {request.focus}" if request.focus else ""
        return [
            f"{symbol} stock ETF valuation earnings balance sheet outlook{focus}"
            for symbol in tickers[: request.max_web_results]
        ]
    return [
        f"{symbol} latest news earnings guidance valuation"
        for symbol in tickers[: request.max_web_results]
    ]


async def brave_search(query: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.brave_search_api_key:
        return {"query": query, "error": "BRAVE_SEARCH_API_KEY missing", "results": []}
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
            searches.append({"query": query, "error": str(exc), "results": []})
    return searches


def system_prompt() -> str:
    return (
        "Eres un analista de cartera personal. No das asesoramiento financiero personalizado "
        "como mandato; produces un informe razonado, prudente y auditable. Distingue hechos, "
        "inferencias e incertidumbre. Usa los resultados web solo como contexto y cita URLs "
        "cuando apoyen una observacion. Responde en espanol."
    )


def user_prompt(context: dict[str, Any], web_context: list[dict[str, Any]], request: ReportRequest) -> str:
    if request.report_type == "rebalance_opportunity":
        purpose = (
            "Genera una recomendacion de donde ponderar nuevas aportaciones, comparando pesos "
            "actuales, concentracion, coste, moneda, balances/fundamentales iniciales disponibles "
            "en la busqueda web y posibles ofertas de precio. No recomiendes vender salvo riesgo claro."
        )
    else:
        purpose = (
            "Genera un informe periodico de cartera: cambios relevantes, riesgos, concentracion, "
            "dividendos, divisas, posiciones que revisar y lista de seguimiento para la proxima revision."
        )
    return (
        f"{purpose}\n\n"
        f"Foco adicional del usuario: {request.focus or 'ninguno'}\n\n"
        f"Contexto de cartera JSON:\n{context}\n\n"
        f"Contexto web obtenido con Brave JSON:\n{web_context}\n\n"
        "Formato: titulo, resumen ejecutivo, observaciones por activo, riesgos, acciones sugeridas, fuentes."
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


async def generate_research_report(client: "Client", request: ReportRequest) -> dict[str, Any]:
    context = portfolio_context(client, request.max_positions)
    web_context = await collect_web_context(context, request)
    prompt = user_prompt(context, web_context, request)
    content = await call_openai(prompt)
    title = (
        "Informe periodico de cartera"
        if request.report_type == "portfolio_periodic"
        else "Recomendacion de ponderacion"
    )
    row = {
        "report_type": request.report_type,
        "title": title,
        "period_start": request.period_start.isoformat() if request.period_start else None,
        "period_end": request.period_end.isoformat() if request.period_end else date.today().isoformat(),
        "prompt": prompt,
        "portfolio_context": context,
        "web_context": {"provider": "brave", "searches": web_context},
        "content_markdown": content,
        "model": get_settings().openai_model,
    }
    inserted = client.table("research_reports").insert(row).execute().data[0]
    return {"status": "ok", "report": inserted}

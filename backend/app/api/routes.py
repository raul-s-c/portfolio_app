from fastapi import APIRouter, File, Form, UploadFile

from app.core.supabase_client import service_client
from app.services.asset_onboarding import find_existing_asset, upsert_manual_asset
from app.services.import_service import import_movements, parse_file
from app.services.portfolio import calculate_open_positions
from app.services.prices import update_price_snapshots

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/positions")
def positions() -> list[dict]:
    client = service_client()
    return [
        {
            "asset_id": row.asset_id,
            "broker_id": row.broker_id,
            "quantity": str(row.quantity),
            "cost_basis": str(row.cost_basis),
            "average_cost": str(row.average_cost),
        }
        for row in calculate_open_positions(client)
    ]


@router.get("/assets/resolve")
def resolve_asset(symbol: str | None = None, isin: str | None = None) -> dict:
    client = service_client()
    existing = find_existing_asset(client, symbol, isin)
    return {"status": "resolved" if existing else "pending", "asset": existing}


@router.post("/assets/manual")
def create_manual_asset(payload: dict) -> dict:
    client = service_client()
    asset = upsert_manual_asset(
        client,
        symbol=payload.get("symbol"),
        isin=payload.get("isin"),
        name=payload.get("name"),
        currency=payload.get("currency"),
        asset_type=payload.get("asset_type"),
        yahoo_symbol=payload.get("yahoo_symbol"),
    )
    return {"status": "ok", "asset": asset}


@router.post("/imports/{source}")
async def import_file(
    source: str,
    file: UploadFile = File(...),
    dry_run: bool = Form(True),
) -> dict:
    content = await file.read()
    client = service_client()
    movements = parse_file(source, content, file.filename or "upload.csv")
    return import_movements(client, movements, dry_run=dry_run)


@router.post("/prices/refresh")
async def refresh_prices() -> dict:
    client = service_client()
    return await update_price_snapshots(client)

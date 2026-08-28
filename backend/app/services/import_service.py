from decimal import Decimal
from typing import TYPE_CHECKING

from app.importers.ibkr import parse_ibkr
from app.importers.models import ParsedMovement
from app.importers.myinvestor import parse_myinvestor
from app.importers.trade_republic import parse_trade_republic
from app.services.asset_resolver import resolve_asset, resolve_broker, serialise_raw_payload

if TYPE_CHECKING:
    from supabase import Client


PARSERS = {
    "myinvestor": parse_myinvestor,
    "ibkr": parse_ibkr,
    "trade_republic": parse_trade_republic,
}


def parse_file(source: str, content: bytes, filename: str) -> list[ParsedMovement]:
    parser = PARSERS[source]
    return parser(content, filename)


def import_movements(client: "Client", movements: list[ParsedMovement], dry_run: bool = True) -> dict:
    parsed = len(movements)
    transactions = []
    dividends = []
    skipped_duplicates = 0

    for movement in movements:
        if not movement.symbol and not movement.isin:
            continue

        if dry_run:
            target = dividends if movement.movement_type == "dividend" else transactions
            target.append(
                {
                    "broker": movement.broker,
                    "date": movement.date.isoformat(),
                    "type": movement.movement_type,
                    "symbol": movement.symbol,
                    "isin": movement.isin,
                    "name": movement.raw_name,
                    "quantity": str(movement.quantity),
                    "gross_amount": str(movement.gross_amount),
                    "currency": movement.currency,
                    "source_row_hash": movement.row_hash,
                }
            )
            continue

        asset_id = resolve_asset(client, movement)
        broker_id = resolve_broker(client, movement.broker)
        exists_tx = client.table("transactions").select("id").eq("source_row_hash", movement.row_hash).limit(1).execute().data
        exists_div = client.table("dividends").select("id").eq("source_row_hash", movement.row_hash).limit(1).execute().data
        if exists_tx or exists_div:
            skipped_duplicates += 1
            continue

        if movement.movement_type == "dividend":
            row = {
                "asset_id": asset_id,
                "broker_id": broker_id,
                "pay_date": movement.date.isoformat(),
                "gross_amount": str(movement.gross_amount),
                "tax": str(movement.tax),
                "net_amount": str(movement.net_amount or movement.gross_amount),
                "currency": movement.currency,
                "source_file": movement.source_file,
                "source_row_hash": movement.row_hash,
                "raw_payload": serialise_raw_payload(movement),
            }
            client.table("dividends").insert(row).execute()
            dividends.append(row)
        else:
            quantity = movement.quantity
            if movement.movement_type == "sell":
                quantity = -abs(quantity)
            elif movement.movement_type == "buy":
                quantity = abs(quantity)
            row = {
                "asset_id": asset_id,
                "broker_id": broker_id,
                "trade_date": movement.date.isoformat(),
                "type": movement.movement_type,
                "quantity": str(quantity),
                "gross_amount": str(movement.gross_amount),
                "fees": str(movement.fees),
                "tax": str(movement.tax),
                "currency": movement.currency,
                "source_file": movement.source_file,
                "source_row_hash": movement.row_hash,
                "raw_payload": serialise_raw_payload(movement),
            }
            client.table("transactions").insert(row).execute()
            transactions.append(row)

    return {
        "parsed": parsed,
        "transactions": len(transactions),
        "dividends": len(dividends),
        "skipped_duplicates": skipped_duplicates,
        "dry_run": dry_run,
        "transaction_rows": transactions if dry_run else [],
        "dividend_rows": dividends if dry_run else [],
    }


def decimal_or_zero(value: object) -> Decimal:
    return Decimal(str(value or "0"))

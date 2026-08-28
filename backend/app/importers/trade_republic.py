from decimal import Decimal

from app.importers.common import date_from_text, decimal_from_text, first_present, read_csv_bytes, upper_symbol
from app.importers.models import ParsedMovement


def parse_trade_republic(content: bytes, source_file: str) -> list[ParsedMovement]:
    rows = read_csv_bytes(content)
    movements: list[ParsedMovement] = []

    for row in rows:
        event = first_present(row, ["Type", "Tipo", "Transaction Type"])
        name = first_present(row, ["Security name", "Name", "Nombre", "Description"])
        symbol = upper_symbol(first_present(row, ["Ticker", "Symbol"]))
        isin = first_present(row, ["ISIN", "Isin"]) or None
        date_value = date_from_text(first_present(row, ["Date", "Fecha"]))
        quantity = decimal_from_text(first_present(row, ["Shares", "Quantity", "Titulos"]))
        amount = decimal_from_text(first_present(row, ["Amount", "Importe", "Cash amount"]))
        fees = decimal_from_text(first_present(row, ["Fee", "Fees", "Comision"]))
        tax = decimal_from_text(first_present(row, ["Tax", "Taxes", "Impuesto"]))
        currency = first_present(row, ["Currency", "Divisa", "Moneda"]) or "EUR"

        lower = event.lower()
        if "dividend" in lower or "dividendo" in lower:
            movements.append(
                ParsedMovement(
                    broker="Trade Republic",
                    date=date_value,
                    movement_type="dividend",
                    raw_name=name or event,
                    symbol=symbol,
                    isin=isin,
                    quantity=Decimal("0"),
                    gross_amount=amount,
                    fees=Decimal("0"),
                    tax=tax,
                    net_amount=amount - tax,
                    currency=currency,
                    source_file=source_file,
                    source_row=row,
                )
            )
            continue

        if "sell" in lower or "venta" in lower:
            movement_type = "sell"
            signed_quantity = -abs(quantity)
        elif "buy" in lower or "compra" in lower:
            movement_type = "buy"
            signed_quantity = abs(quantity)
        else:
            continue

        movements.append(
            ParsedMovement(
                broker="Trade Republic",
                date=date_value,
                movement_type=movement_type,
                raw_name=name or event,
                symbol=symbol,
                isin=isin,
                quantity=signed_quantity,
                gross_amount=amount,
                fees=fees,
                tax=tax,
                net_amount=None,
                currency=currency,
                source_file=source_file,
                source_row=row,
            )
        )

    return movements

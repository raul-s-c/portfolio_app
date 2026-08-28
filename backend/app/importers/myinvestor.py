from decimal import Decimal

from app.importers.common import date_from_text, decimal_from_text, first_present, read_csv_bytes, upper_symbol
from app.importers.models import ParsedMovement


def parse_myinvestor(content: bytes, source_file: str) -> list[ParsedMovement]:
    rows = read_csv_bytes(content)
    movements: list[ParsedMovement] = []

    for row in rows:
        concept = first_present(row, ["Concepto", "Description", "Descripcion", "Movimiento"])
        amount = decimal_from_text(first_present(row, ["Importe", "Amount", "Efectivo"]))
        date_value = date_from_text(first_present(row, ["Fecha", "Date", "F. operacion"]))
        symbol = upper_symbol(first_present(row, ["Ticker", "Symbol"]))
        isin = first_present(row, ["ISIN", "Isin"]) or None
        quantity = decimal_from_text(first_present(row, ["Titulos", "Participaciones", "Quantity"]))
        currency = first_present(row, ["Divisa", "Currency", "Moneda"]) or "EUR"

        lower = concept.lower()
        if any(word in lower for word in ["dividendo", "dividend"]):
            movements.append(
                ParsedMovement(
                    broker="MyInvestor",
                    date=date_value,
                    movement_type="dividend",
                    raw_name=concept,
                    symbol=symbol,
                    isin=isin,
                    quantity=Decimal("0"),
                    gross_amount=amount,
                    fees=Decimal("0"),
                    tax=Decimal("0"),
                    net_amount=amount,
                    currency=currency,
                    source_file=source_file,
                    source_row=row,
                )
            )
            continue

        if any(word in lower for word in ["venta", "reembolso", "sell"]):
            movement_type = "sell"
            signed_quantity = -abs(quantity)
        elif any(word in lower for word in ["compra", "suscripcion", "subscription", "buy"]):
            movement_type = "buy"
            signed_quantity = abs(quantity)
        else:
            continue

        movements.append(
            ParsedMovement(
                broker="MyInvestor",
                date=date_value,
                movement_type=movement_type,
                raw_name=concept,
                symbol=symbol,
                isin=isin,
                quantity=signed_quantity,
                gross_amount=amount,
                fees=Decimal("0"),
                tax=Decimal("0"),
                net_amount=None,
                currency=currency,
                source_file=source_file,
                source_row=row,
            )
        )

    return movements

from decimal import Decimal

from app.importers.common import date_from_text, decimal_from_text, first_present, read_csv_bytes, upper_symbol
from app.importers.models import ParsedMovement


def parse_ibkr(content: bytes, source_file: str) -> list[ParsedMovement]:
    rows = read_csv_bytes(content)
    movements: list[ParsedMovement] = []

    for row in rows:
        row_type = first_present(row, ["DataDiscriminator", "Type", "Category"])
        description = first_present(row, ["Description", "Security Description", "Symbol"])
        symbol = upper_symbol(first_present(row, ["Symbol", "Ticker"]))
        date_value = date_from_text(first_present(row, ["Date/Time", "TradeDate", "Date"]))
        quantity = decimal_from_text(first_present(row, ["Quantity", "Qty"]))
        amount = decimal_from_text(first_present(row, ["Proceeds", "Amount", "Net Cash", "Value"]))
        fees = decimal_from_text(first_present(row, ["Commission", "Fees"]))
        currency = first_present(row, ["Currency", "CurrencyPrimary"]) or "EUR"

        lower = f"{row_type} {description}".lower()
        if "dividend" in lower:
            movements.append(
                ParsedMovement(
                    broker="IBKR",
                    date=date_value,
                    movement_type="dividend",
                    raw_name=description,
                    symbol=symbol,
                    isin=None,
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

        if "trade" not in lower and not quantity:
            continue

        movement_type = "sell" if quantity < 0 else "buy"
        movements.append(
            ParsedMovement(
                broker="IBKR",
                date=date_value,
                movement_type=movement_type,
                raw_name=description,
                symbol=symbol,
                isin=None,
                quantity=quantity,
                gross_amount=amount,
                fees=fees,
                tax=Decimal("0"),
                net_amount=None,
                currency=currency,
                source_file=source_file,
                source_row=row,
            )
        )

    return movements

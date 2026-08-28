from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from hashlib import sha256
from typing import Literal


MovementType = Literal["buy", "sell", "transfer_in", "transfer_out", "dividend"]


@dataclass(frozen=True)
class ParsedMovement:
    broker: str
    date: date
    movement_type: MovementType
    raw_name: str
    symbol: str | None
    isin: str | None
    quantity: Decimal
    gross_amount: Decimal
    fees: Decimal
    tax: Decimal
    net_amount: Decimal | None
    currency: str
    source_file: str
    source_row: dict[str, str]

    @property
    def row_hash(self) -> str:
        raw = "|".join(
            [
                self.broker,
                self.date.isoformat(),
                self.movement_type,
                self.raw_name,
                self.symbol or "",
                self.isin or "",
                str(self.quantity),
                str(self.gross_amount),
                str(self.fees),
                str(self.tax),
                self.currency,
                self.source_file,
                repr(sorted(self.source_row.items())),
            ]
        )
        return sha256(raw.encode("utf-8")).hexdigest()

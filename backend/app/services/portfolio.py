from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client


@dataclass
class OpenPosition:
    asset_id: str
    broker_id: str
    quantity: Decimal
    cost_basis: Decimal
    average_cost: Decimal


def calculate_open_positions(client: "Client") -> list[OpenPosition]:
    rows = (
        client.table("transactions")
        .select("asset_id,broker_id,trade_date,type,quantity,gross_amount,fees")
        .order("trade_date")
        .execute()
        .data
    )

    state: dict[tuple[str, str], dict[str, Decimal]] = defaultdict(
        lambda: {"quantity": Decimal("0"), "cost_basis": Decimal("0")}
    )

    for row in rows:
        key = (row["asset_id"], row["broker_id"])
        bucket = state[key]
        movement_type = row["type"]
        quantity = Decimal(str(row["quantity"] or "0"))
        gross_amount = Decimal(str(row["gross_amount"] or "0"))
        fees = Decimal(str(row["fees"] or "0"))

        if movement_type in ("buy", "transfer_in"):
            bucket["quantity"] += abs(quantity)
            bucket["cost_basis"] += abs(gross_amount) + abs(fees)
            continue

        if movement_type in ("sell", "transfer_out"):
            sell_quantity = abs(quantity)
            if bucket["quantity"] <= 0:
                continue
            matched_quantity = min(sell_quantity, bucket["quantity"])
            average_cost = bucket["cost_basis"] / bucket["quantity"]
            bucket["quantity"] -= matched_quantity
            bucket["cost_basis"] -= average_cost * matched_quantity

    positions = []
    for (asset_id, broker_id), bucket in state.items():
        quantity = bucket["quantity"]
        if quantity <= Decimal("0.00000001"):
            continue
        cost_basis = bucket["cost_basis"]
        positions.append(
            OpenPosition(
                asset_id=asset_id,
                broker_id=broker_id,
                quantity=quantity,
                cost_basis=cost_basis,
                average_cost=cost_basis / quantity if quantity else Decimal("0"),
            )
        )
    return positions

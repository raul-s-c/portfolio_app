from decimal import Decimal

from app.services.portfolio import calculate_open_positions


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args):
        return self

    def order(self, *_args):
        return self

    def execute(self):
        return type("Result", (), {"data": self.rows})()


class FakeClient:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        assert name == "transactions"
        return FakeQuery(self.rows)


def test_sales_reduce_cost_basis_by_average_cost():
    client = FakeClient(
        [
            {
                "asset_id": "asset-1",
                "broker_id": "broker-1",
                "trade_date": "2026-01-01",
                "type": "buy",
                "quantity": "10",
                "gross_amount": "1000",
                "fees": "0",
            },
            {
                "asset_id": "asset-1",
                "broker_id": "broker-1",
                "trade_date": "2026-02-01",
                "type": "sell",
                "quantity": "-4",
                "gross_amount": "600",
                "fees": "0",
            },
        ]
    )

    positions = calculate_open_positions(client)

    assert len(positions) == 1
    assert positions[0].quantity == Decimal("6")
    assert positions[0].cost_basis == Decimal("600")
    assert positions[0].average_cost == Decimal("100")

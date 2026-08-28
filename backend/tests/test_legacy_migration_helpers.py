from scripts.legacy_common import canonical_broker, canonical_symbol
from scripts.export_legacy_html_state import build_export
from scripts.migrate_legacy_to_supabase import build_plan, stable_asset_id, validate_export


def test_known_ticker_aliases_are_canonicalised():
    assert canonical_symbol("IHYG") == "EUNW"
    assert canonical_symbol("IQQJ.DE") == "IJPN.DE"


def test_broker_aliases_keep_ibkr_separate():
    assert canonical_broker("IB") == "IBKR"
    assert canonical_broker("Trade republi") == "Trade Republic"
    assert canonical_broker("Trade Republic") == "Trade Republic"


def test_validation_flags_non_canonical_final_symbols():
    result = validate_export(
        {
            "transactions": [
                {"symbol": "EUNW", "broker": "MyInvestor", "source_row_hash": "a"},
                {"symbol": "IHYG", "broker": "IBKR", "source_row_hash": "b"},
            ],
            "dividends": [{"symbol": "IJPN", "broker": "MyInvestor", "source_row_hash": "c"}],
        }
    )

    assert result["ihyg_final_rows"] == 1
    assert result["iqqj_final_rows"] == 0
    assert result["eunw_exists"] is True
    assert result["ijpn_exists"] is True


def test_html_seed_export_and_plan_preserve_stable_asset_ids():
    html = """
    <script>
    const SEED={"version":1,"actions":[
      {"id":1,"date":"2026-01-01","ticker":"IHYG","name":"old","type":"Compra acciones","quantity":2,"eurCost":100,"localCost":100,"eurPrice":50,"localPrice":50,"currency":"EUR","broker":"IB"},
      {"id":2,"date":"2026-01-02","ticker":"EUNW","name":"new","type":"Venta acciones","quantity":-1,"eurCost":-60,"localCost":-60,"eurPrice":60,"localPrice":60,"currency":"EUR","broker":"IB"}
    ],"dividends":[],"mappings":[],"etfs":[
      {"ISIN":"IE00B66F4759","Ticker":"EUNW","Proveedor":"iShares"}
    ],"manualPrices":{},"quoteAliases":{}};
    </script>
    """
    export = build_export(html, source_file=__import__("pathlib").Path("legacy.html"))
    plan = build_plan(export)

    expected_id = stable_asset_id("isin:IE00B66F4759")
    assert export["validation"]["ihyg_final_rows"] == 0
    assert len(plan["assets"]) == 1
    assert plan["assets"][0]["id"] == expected_id
    assert {row["asset_id"] for row in plan["transactions"]} == {expected_id}

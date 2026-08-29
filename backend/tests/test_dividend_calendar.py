from datetime import UTC, datetime, timedelta

from app.services.dividend_calendar import (
    calculate_expected_amount,
    clean_date,
    dividend_calendar_query_variants,
    infer_next_distribution_from_history,
    normalize_currency,
    normalize_event,
    parse_json_response,
    position_search_terms,
)


def test_calculate_expected_amount_uses_position_quantity():
    assert calculate_expected_amount(12.5, 0.82) == 10.25


def test_normalize_event_clamps_confidence_and_dates():
    event = normalize_event(
        {
            "ex_date": "2026-09-15T00:00:00Z",
            "payment_date": "bad-date",
            "dividend_amount": "1.25",
            "currency": "usd",
            "confidence": 2,
        }
    )

    assert event["ex_date"] == "2026-09-15"
    assert event["payment_date"] is None
    assert event["dividend_amount"] == 1.25
    assert event["currency"] == "USD"
    assert event["confidence"] == 1.0


def test_parse_json_response_accepts_fenced_json_text():
    parsed = parse_json_response(
        {
            "output_text": '```json\n{"events":[{"dividend_amount":0.5,"currency":"EUR"}]}\n```',
        }
    )

    assert parsed["events"][0]["dividend_amount"] == 0.5


def test_clean_date_and_currency_fallbacks():
    assert clean_date("2026-12-01") == "2026-12-01"
    assert clean_date("12/01/2026") is None
    assert normalize_currency("EURO") == "EUR"


def test_etf_queries_include_isin_and_distribution_language():
    position = {
        "asset_type": "etf",
        "symbol": "VHYL",
        "name": "Vanguard FTSE All-World High Dividend Yield UCITS ETF",
        "isin": "IE00B8GKDB10",
        "identifiers": [{"symbol": "VHYL.AS"}, {"symbol": "VGWD.DE"}],
    }

    queries = dividend_calendar_query_variants(position, request=type("Request", (), {"focus": None})())

    assert any("IE00B8GKDB10" in query for query in queries)
    assert any("distribution" in query for query in queries)
    assert any("justetf.com" in query for query in queries)


def test_position_search_terms_deduplicates_identifiers():
    terms = position_search_terms(
        {
            "symbol": "IQQJ",
            "isin": "IE00B1FZS350",
            "name": "iShares MSCI Japan",
            "identifiers": [{"symbol": "IQQJ"}, {"symbol": "IJPN.L"}],
        }
    )

    assert terms["symbols"] == ["IQQJ", "IJPN.L"]


def test_infer_next_distribution_from_history_marks_estimate():
    today = datetime.now(UTC).date()
    estimate = infer_next_distribution_from_history(
        [
            {"ex_date": today - timedelta(days=180), "dividend_amount": 0.11},
            {"ex_date": today - timedelta(days=90), "dividend_amount": 0.12},
            {"ex_date": today - timedelta(days=1), "dividend_amount": 0.13},
        ]
    )

    assert estimate is not None
    assert estimate["status"] == "estimated_from_history"
    assert estimate["dividend_amount"] == 0.13

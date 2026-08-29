from app.services.dividend_calendar import (
    calculate_expected_amount,
    clean_date,
    normalize_currency,
    normalize_event,
    parse_json_response,
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

from app.services.research_reports import (
    STRATEGIC_ETF_TAG,
    ReportRequest,
    build_queries,
    report_title,
    summarize_group,
)


def test_group_report_queries_are_group_level():
    context = {"positions": [{"symbol": "AAPL"}, {"symbol": "IWDA"}]}

    queries = build_queries(context, ReportRequest(report_type="portfolio_group_analysis"))

    assert len(queries) == 3
    assert "equity market outlook" in queries[0]
    assert "ETF market outlook" in queries[1]


def test_etf_resilient_report_uses_strategic_tagged_positions():
    context = {
        "strategic_etf_policy": {
            "positions": [
                {"symbol": "IWDA", "tags": [STRATEGIC_ETF_TAG]},
                {"symbol": "EUNA", "tags": [STRATEGIC_ETF_TAG]},
            ]
        }
    }

    queries = build_queries(
        context,
        ReportRequest(report_type="etf_resilient_portfolio", focus="inflacion"),
    )

    assert queries == [
        "IWDA ETF holdings yield duration inflation outlook macro role inflacion",
        "EUNA ETF holdings yield duration inflation outlook macro role inflacion",
    ]


def test_summarize_group_keeps_group_totals_separate():
    summary = summarize_group(
        [
            {"market_value_eur": 100.0, "cost_basis_eur": 80.0},
            {"market_value_eur": 50.0, "cost_basis_eur": 60.0},
        ],
        total_market=300.0,
    )

    assert summary["count"] == 2
    assert summary["market_value_eur"] == 150.0
    assert summary["latent_gain_eur"] == 10.0
    assert summary["portfolio_weight"] == 0.5


def test_report_titles_cover_new_report_types():
    assert report_title("portfolio_group_analysis") == "Analisis de cartera por grupo"
    assert report_title("etf_resilient_portfolio") == "Revision cartera ETF resistente MyInvestor"

from app.services.asset_resolver import canonical_symbol


def test_known_ticker_changes_are_canonicalised():
    assert canonical_symbol("IHYG") == "EUNW"
    assert canonical_symbol("IHYG.DE") == "EUNW.DE"
    assert canonical_symbol("IQQJ") == "IJPN"
    assert canonical_symbol("IQQJ.DE") == "IJPN.DE"

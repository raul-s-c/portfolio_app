import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


def read_csv_bytes(content: bytes) -> list[dict[str, str]]:
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [{str(k).strip(): str(v).strip() for k, v in row.items()} for row in reader]


def decimal_from_text(value: str | None) -> Decimal:
    if not value:
        return Decimal("0")
    cleaned = value.strip().replace("\u00a0", "").replace(" ", "")
    cleaned = re.sub(r"[^0-9,\.\-]", "", cleaned)
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned or "0")
    except InvalidOperation:
        return Decimal("0")


def date_from_text(value: str) -> date:
    cleaned = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(cleaned[:10], fmt).date()
        except ValueError:
            pass
    return datetime.fromisoformat(cleaned.replace("Z", "+00:00")).date()


def first_present(row: dict[str, str], names: list[str]) -> str:
    lowered = {k.lower(): v for k, v in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value:
            return value
    return ""


def upper_symbol(symbol: str | None) -> str | None:
    if not symbol:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9\.\-]", "", symbol).upper()
    return cleaned or None

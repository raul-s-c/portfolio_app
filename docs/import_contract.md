# Import Contract

The importers should preserve broker facts and avoid financial interpretation beyond identifying the movement type.

## Parser Responsibility

Parsers should extract:

- Broker
- Date
- Movement type
- Raw asset name
- Symbol
- ISIN
- Quantity
- Gross amount
- Fees
- Tax
- Currency
- Source file
- Raw row

## Resolver Responsibility

The resolver maps symbol, ISIN or raw name to `asset_id`.

Known canonical mappings:

```text
IHYG -> EUNW
IQQJ -> IJPN
```

## Portfolio Responsibility

Portfolio calculations decide:

- Open quantity
- Average cost
- Cost basis after sales
- Realized and unrealized gain

This prevents CSV parsers from corrupting accounting logic.

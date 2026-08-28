# Supabase Setup

## 1. Create Project

Create or reuse a Supabase project.

## 2. Run Migrations

Open Supabase SQL Editor and run:

1. `supabase/migrations/001_portfolio_core.sql`
2. `supabase/migrations/002_seed_known_aliases.sql`

## 3. Secrets

Add these GitHub Actions secrets:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Only the backend and GitHub Actions use `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Frontend Access

The frontend can use:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Protect private data with Supabase Auth and RLS. Do not put the service role key in frontend code.

## 5. Asset Identity

Use `assets.id` as the identity in all movements.

Use `asset_identifiers` for:

- Current ticker
- Old ticker
- Yahoo symbol
- ISIN
- Broker-specific names

This prevents ticker changes from breaking the portfolio history.

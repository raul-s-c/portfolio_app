# Portfolio App

Sistema personal de cartera basado en Supabase, GitHub y scripts Python.

Este proyecto nace para sustituir el HTML monolitico actual por una app mantenible:

- Supabase guarda la base de datos real.
- GitHub guarda codigo, migraciones y jobs.
- Python importa CSV, resuelve activos y calcula cartera.
- El frontend solo muestra y edita datos, no debe ser la fuente de verdad.

## Estado Actual

Este repo fue preparado inicialmente fuera del PC principal porque el conector de GitHub no tenia acceso al repo privado `raul-s-c/portfolio_app`.

Estado local creado:

- Commit local inicial preparado: `43bb7fb`
- Rama local: `main`
- Zip de respaldo generado: `outputs/portfolio_app_supabase_foundation.zip`
- Repo objetivo: `https://github.com/raul-s-c/portfolio_app`

Cuando se abra desde Codex en el PC, el siguiente paso es subir este contenido al repo privado y continuar desde ahi.

## Objetivo Funcional

La app debe permitir:

1. Registrar compras, ventas, dividendos y traspasos.
2. Importar CSV mensuales de MyInvestor, IBKR y Trade Republic.
3. Resolver activos por ticker, ISIN, nombre o asignacion manual.
4. Mantener un ID interno estable por activo.
5. Soportar cambios de ticker sin romper historico.
6. Guardar snapshots historicos de precios y cartera.
7. Calcular posiciones abiertas por broker.
8. Calcular coste medio correctamente despues de ventas.
9. Mostrar dashboard con precio vivo, cierre anterior, variacion diaria, P&G latente y P&G del dia.
10. Ejecutar scripts nocturnos para actualizar precios y generar alertas.

## Principio Clave

El ticker no es la identidad del activo.

El activo se identifica por `assets.id`.

Los tickers, ISINs, simbolos de Yahoo, nombres de broker y aliases historicos viven en `asset_identifiers`.

Ejemplo:

```text
asset_id: uuid estable
nombre: iShares Euro High Yield Corporate Bond UCITS ETF
identificadores:
  IHYG
  IHYG.DE
  EUNW
  EUNW.DE
```

Si el ticker cambia, no se reescribe la historia. Se anade otro identificador al mismo `asset_id`.

## Cambios De Ticker Ya Conocidos

Estos mappings ya estan incluidos:

```text
IHYG -> EUNW
IQQJ -> IJPN
```

Estan implementados en:

- `supabase/migrations/002_seed_known_aliases.sql`
- `backend/app/services/asset_resolver.py`

## Estructura

```text
portfolio_app/
  README.md
  .env.example
  .gitignore

  supabase/
    migrations/
      001_portfolio_core.sql
      002_seed_known_aliases.sql
      003_asset_resolution_queue.sql
      004_api_role_grants.sql
      005_harden_asset_identifier_uniqueness.sql
      006_authenticated_personal_writes.sql
      007_open_positions_eur_view.sql

  backend/
    pyproject.toml
    app/
      main.py
      api/
        routes.py
      core/
        config.py
        supabase_client.py
      importers/
        common.py
        models.py
        myinvestor.py
        ibkr.py
        trade_republic.py
      services/
        asset_resolver.py
        import_service.py
        portfolio.py
        prices.py
    tests/
      test_asset_resolver.py
      test_portfolio_cost_basis.py

  frontend/
    package.json
    index.html
    vite.config.ts
    tsconfig.json
    src/
      main.tsx
      styles.css

  scripts/
    nightly_prices.py

  docs/
    supabase_setup.md
    import_contract.md

  .github/
    workflows/
      backend_tests.yml
      nightly_prices.yml
```

## Supabase

La base esta pensada para Supabase Postgres.

Tablas principales:

| Tabla | Funcion |
|---|---|
| `assets` | Activo real, con ID estable |
| `asset_identifiers` | Tickers, ISINs, Yahoo symbols y aliases historicos |
| `brokers` | MyInvestor, IBKR, Trade Republic |
| `transactions` | Compras, ventas y traspasos |
| `dividends` | Dividendos |
| `price_snapshots` | Precios historicos |
| `portfolio_snapshots` | Foto diaria de cartera |

Vistas:

| Vista | Funcion |
|---|---|
| `v_latest_prices` | Ultimo precio por activo |
| `v_open_positions` | Posiciones abiertas operativas |

Nota: `v_open_positions` es una vista rapida. El calculo fino de coste medio tras ventas esta en Python:

```text
backend/app/services/portfolio.py
```

## Configuracion De Supabase

En Supabase SQL Editor ejecutar, por orden:

```text
supabase/migrations/001_portfolio_core.sql
supabase/migrations/002_seed_known_aliases.sql
```

Luego configurar secretos.

En local:

```bash
cp .env.example .env
```

Contenido esperado:

```text
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Regla importante:

- `SUPABASE_ANON_KEY` puede usarse en frontend con RLS.
- `SUPABASE_SERVICE_ROLE_KEY` solo backend y GitHub Actions.
- Nunca meter `SUPABASE_SERVICE_ROLE_KEY` en React, Vite, GitHub Pages o navegador.

## GitHub Secrets

En el repo de GitHub, ir a:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Crear:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Backend Local

Desde raiz:

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Git Bash, Linux o macOS:

```bash
source .venv/bin/activate
```

Instalar:

```bash
pip install -e ".[dev]"
```

Arrancar:

```bash
uvicorn app.main:app --reload
```

API local:

```text
http://127.0.0.1:8000/api/health
```

## Frontend Local

Desde raiz:

```bash
cd frontend
npm install
npm run dev
```

Crear `frontend/.env.local`:

```text
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

La app local abre normalmente en:

```text
http://localhost:5173
```

## Tests

Desde raiz:

```bash
pip install -e "backend[dev]"
pytest backend/tests
```

Tests actuales:

- `test_asset_resolver.py`: comprueba `IHYG -> EUNW` e `IQQJ -> IJPN`.
- `test_portfolio_cost_basis.py`: comprueba que una venta reduce coste base por coste medio.

Caso probado:

```text
Compra 10 por 1000
Venta 4
Resultado:
  cantidad abierta = 6
  coste base restante = 600
  coste medio = 100
```

## Importacion De CSV

Endpoint:

```text
POST /api/imports/{source}
```

Sources aceptadas:

```text
myinvestor
ibkr
trade_republic
```

Ejemplo:

```bash
curl -X POST \
  -F "file=@movimientos.csv" \
  -F "dry_run=true" \
  http://127.0.0.1:8000/api/imports/myinvestor
```

Con `dry_run=true` solo devuelve candidatos.

Con `dry_run=false` escribe en Supabase.

Regla de diseno:

Los parsers no deben hacer contabilidad compleja. Solo leen el fichero y extraen movimientos.

Responsabilidades:

| Capa | Responsabilidad |
|---|---|
| Parser | Leer CSV y detectar movimiento |
| Resolver | Convertir ticker, ISIN o nombre a `asset_id` |
| Portfolio | Calcular posiciones, coste medio y ventas |
| Supabase | Guardar datos y bloquear duplicados |

## Duplicados

Cada movimiento genera:

```text
source_row_hash
```

Ese hash es unico en:

- `transactions`
- `dividends`

Esto evita importar dos veces el mismo movimiento.

## Precios

Script:

```text
scripts/nightly_prices.py
```

Servicio:

```text
backend/app/services/prices.py
```

Actualmente usa Yahoo Chart API sobre identificadores `provider = 'yahoo'` e `is_primary = true`.

Guarda:

- Precio
- Cierre anterior
- Divisa
- Proveedor
- Timestamp

Tabla:

```text
price_snapshots
```

Endpoint manual:

```text
POST /api/prices/refresh
```

## GitHub Actions

Hay dos workflows:

```text
.github/workflows/backend_tests.yml
.github/workflows/nightly_prices.yml
```

`backend_tests.yml`:

- Instala backend.
- Ejecuta tests.

`nightly_prices.yml`:

- Corre de lunes a viernes.
- Hora UTC: `22:15`.
- Ejecuta `scripts/nightly_prices.py`.

Cron actual:

```yaml
15 22 * * 1-5
```

## Como Subir Esto A GitHub Desde Tu PC

Si el repo ya existe y esta vacio:

```bash
git remote add origin https://github.com/raul-s-c/portfolio_app.git
git push -u origin main
```

Si el repo ya tiene commits:

```bash
git remote add origin https://github.com/raul-s-c/portfolio_app.git
git fetch origin
git status
```

Luego decidir si subir a `main` o crear rama.

Recomendacion si el repo no esta vacio:

```bash
git checkout -b supabase-portfolio-foundation
git push -u origin supabase-portfolio-foundation
```

Luego abrir PR hacia `main`.

## Prompt Para Retomar En Codex En Tu PC

Pega esto en Codex desde el repo abierto:

```text
Estoy retomando el proyecto Portfolio App.

Lee README.md completo y revisa la estructura del repo.

Objetivo:
- Usar Supabase como fuente de verdad.
- Mantener asset_id estable; ticker no es identidad.
- Soportar aliases historicos como IHYG -> EUNW e IQQJ -> IJPN.
- Importar CSV de MyInvestor, IBKR y Trade Republic sin corromper la captura.
- Calcular posiciones abiertas por broker con coste medio correcto tras ventas.
- Guardar price_snapshots y portfolio_snapshots.
- Crear dashboard privado con login Supabase.

Primero:
1. Revisa git status.
2. Revisa migraciones Supabase.
3. Revisa backend/app/services/portfolio.py.
4. Revisa backend/app/services/asset_resolver.py.
5. Ejecuta tests.
6. No metas claves en GitHub.

Despues:
1. Si el repo no esta subido, crea rama supabase-portfolio-foundation y sube.
2. Crea PR draft.
3. Implementa la siguiente fase: migrar datos reales del HTML/Excel a Supabase.
```

## Siguiente Fase Recomendada

La siguiente fase no debe ser mejorar UI. Primero hay que migrar bien los datos.

Orden recomendado:

1. Crear script `scripts/export_legacy_html_state.py`.
2. Extraer del HTML actual:
   - acciones
   - dividendos
   - brokers
   - mapeos
   - precios manuales
3. Crear script `scripts/migrate_legacy_to_supabase.py`.
4. Cargar assets e identifiers.
5. Cargar transactions y dividends.
6. Comparar totales contra el HTML actual.
7. Generar reporte de diferencias.
8. Solo despues rehacer dashboard.

Estado iniciado en este repo:

- `scripts/export_legacy_html_state.py` extrae el `SEED` del HTML legacy y normaliza compras, ventas, dividendos, mappings, aliases de cotizacion y precios manuales.
- `scripts/migrate_legacy_to_supabase.py` genera un plan dry-run auditable antes de cualquier escritura en Supabase.
- Los `asset_id` de la migracion son deterministas: usan ISIN cuando existe y simbolo canonico cuando no existe ISIN.
- `POST /api/assets/manual` permite crear o confirmar manualmente un activo nuevo con ID estable.
- `GET /api/assets/resolve?symbol=...&isin=...` comprueba si un activo ya esta vinculado antes de insertarlo.

Ejemplo local:

```bash
python scripts/export_legacy_html_state.py "dashboard_personal_migrado (5).html"
python scripts/migrate_legacy_to_supabase.py data/legacy/html_state.json
```

## Validaciones Criticas Antes De Dar Por Buena La Migracion

Estas comprobaciones son obligatorias:

| Check | Resultado esperado |
|---|---|
| ETFs abiertos en IBKR | 0 |
| `IHYG` como ticker final | 0 filas |
| `IQQJ` como ticker final | 0 filas |
| `EUNW` | existe |
| `IJPN` | existe |
| Ventas | reducen cantidad |
| Ventas | reducen coste base por coste medio |
| Dividendos MyInvestor con `@` | no se convierten automaticamente en venta |
| Brokers | no se mezclan por ticker |
| Duplicados | bloqueados por `source_row_hash` |

## Cosas Que No Hay Que Repetir

No volver a hacer esto:

- No corregir ventas cambiando destructivamente los parsers.
- No mezclar posiciones de brokers distintos por ticker.
- No usar ticker como clave principal.
- No guardar cartera real dentro de un HTML.
- No meter secretos en frontend.
- No publicar datos personales en GitHub Pages sin login/RLS.

## Decisiones Pendientes

Pendiente confirmar:

1. Si el frontend final se alojara en Vercel, GitHub Pages o Supabase hosting.
2. Si los jobs nocturnos enviaran alertas por email, Telegram, Slack o solo tabla en Supabase.
3. Si los fondos sin ticker se resolveran por ISIN, nombre manual o tabla externa.
4. Si se quiere FIFO fiscal o coste medio operativo. Ahora esta implementado coste medio operativo.
5. Si se anade `owner_id` para seguridad multiusuario o se deja mono-usuario.

## Estado De Seguridad

El esquema incluye RLS para lectura autenticada y escritura con service role.

El frontend usa login con email y contrasena, no enlace magico por email. Esto evita el limite de reintentos de OTP de Supabase.

Para uso personal:

1. En Supabase, ir a `Authentication` -> `Users`.
2. Crear tu usuario con email y contrasena.
3. Si Supabase ofrece `Auto Confirm User`, dejarlo marcado para poder entrar inmediatamente.
4. Mantener las claves privadas fuera del frontend. El navegador solo debe usar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Antes de meter datos reales, revisar si quieres modelo mono-usuario simple o multiusuario.

Para uso personal, mono-usuario esta bien, pero conviene anadir columna `owner_id` si algun dia quieres compartir o separar usuarios.

## Archivos Importantes

| Archivo | Motivo |
|---|---|
| `supabase/migrations/001_portfolio_core.sql` | Modelo principal |
| `supabase/migrations/002_seed_known_aliases.sql` | Mappings IHYG/EUNW e IQQJ/IJPN |
| `supabase/migrations/003_asset_resolution_queue.sql` | Cola de activos pendientes de resolver |
| `supabase/migrations/004_api_role_grants.sql` | Permisos REST para Supabase |
| `supabase/migrations/005_harden_asset_identifier_uniqueness.sql` | Unicidad de identificadores |
| `supabase/migrations/006_authenticated_personal_writes.sql` | Escritura desde la app autenticada |
| `supabase/migrations/007_open_positions_eur_view.sql` | Posiciones abiertas con valor en EUR |
| `supabase/migrations/008_personal_app_state.sql` | Estado JSON legacy para cash y patrimonio |
| `scripts/load_legacy_app_state.mjs` | Carga cash y patrimonio legacy en Supabase |
| `backend/app/services/asset_resolver.py` | Identidad estable de activos |
| `backend/app/services/portfolio.py` | Calculo de posiciones y ventas |
| `backend/app/services/import_service.py` | Insercion de importaciones |
| `backend/app/services/prices.py` | Refresco de precios |
| `docs/import_contract.md` | Reglas para no romper importadores |
| `docs/supabase_setup.md` | Setup manual de Supabase |

Para recuperar las vistas de `Cash` y `Patrimonio` desde el HTML legacy:

```bash
node scripts/load_legacy_app_state.mjs
```

Antes de ese comando hay que ejecutar `supabase/migrations/008_personal_app_state.sql` en el SQL Editor de Supabase.

## Estado Final De Este Paquete

Preparado para ser subido a:

```text
https://github.com/raul-s-c/portfolio_app
```

Si Codex en el PC tiene permisos de GitHub, pedirle que empuje esto y abra PR draft.

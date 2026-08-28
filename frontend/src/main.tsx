import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Root, createRoot } from "react-dom/client";
import { Session, createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Broker = { id: string; name: string };

type Asset = {
  id: string;
  asset_type: "stock" | "etf" | "fund" | "cash";
  name: string;
  isin: string | null;
  currency: string;
};

type Identifier = {
  asset_id: string;
  provider: string;
  symbol: string;
  exchange: string;
  is_primary: boolean;
};

type Position = {
  asset_id: string;
  broker_id: string;
  asset_type: string;
  name: string;
  broker: string;
  quantity: number;
  price: number | null;
  previous_close: number | null;
  market_value: number | null;
  daily_gain: number | null;
  price_currency: string | null;
};

type ResolutionQueueItem = {
  id: string;
  source: string;
  raw_name: string | null;
  symbol: string | null;
  isin: string | null;
  broker: string | null;
  status: "pending" | "resolved" | "ignored";
  notes: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

type AssetForm = {
  name: string;
  symbol: string;
  isin: string;
  yahooSymbol: string;
  assetType: Asset["asset_type"];
  currency: string;
};

type TransactionForm = {
  assetId: string;
  brokerId: string;
  type: "buy" | "sell" | "transfer_in" | "transfer_out";
  tradeDate: string;
  quantity: string;
  grossAmount: string;
  fees: string;
  tax: string;
  currency: string;
  sourceNote: string;
};

const DEFAULT_ASSET_FORM: AssetForm = {
  name: "",
  symbol: "",
  isin: "",
  yahooSymbol: "",
  assetType: "stock",
  currency: "EUR",
};

const DEFAULT_TRANSACTION_FORM: TransactionForm = {
  assetId: "",
  brokerId: "",
  type: "buy",
  tradeDate: new Date().toISOString().slice(0, 10),
  quantity: "",
  grossAmount: "",
  fees: "0",
  tax: "0",
  currency: "EUR",
  sourceNote: "",
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [queue, setQueue] = useState<ResolutionQueueItem[]>([]);
  const [assetForm, setAssetForm] = useState<AssetForm>(DEFAULT_ASSET_FORM);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(DEFAULT_TRANSACTION_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadDashboardData();
      return;
    }
    setPositions([]);
    setAssets([]);
    setIdentifiers([]);
    setBrokers([]);
    setQueue([]);
  }, [session]);

  async function signIn() {
    if (!email || !password) {
      setMessage("Introduce email y contrasena.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? "No he podido iniciar sesion con ese email y contrasena." : "");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPassword("");
    setMessage("");
  }

  async function loadDashboardData() {
    if (!session) {
      return;
    }
    setLoading(true);
    const [positionsResult, assetsResult, identifiersResult, brokersResult, queueResult] = await Promise.all([
      supabase.from("v_open_positions").select("*").order("name"),
      supabase.from("assets").select("id,asset_type,name,isin,currency").order("name"),
      supabase.from("asset_identifiers").select("asset_id,provider,symbol,exchange,is_primary").order("symbol"),
      supabase.from("brokers").select("id,name").order("name"),
      supabase
        .from("asset_resolution_queue")
        .select("id,source,raw_name,symbol,isin,broker,status,notes,raw_payload,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    const error =
      positionsResult.error ||
      assetsResult.error ||
      identifiersResult.error ||
      brokersResult.error ||
      queueResult.error;
    if (error) {
      setMessage(error.message);
    } else {
      setPositions((positionsResult.data ?? []) as Position[]);
      setAssets((assetsResult.data ?? []) as Asset[]);
      setIdentifiers((identifiersResult.data ?? []) as Identifier[]);
      setBrokers((brokersResult.data ?? []) as Broker[]);
      setQueue((queueResult.data ?? []) as ResolutionQueueItem[]);
      setMessage("");
    }
    setLoading(false);
  }

  async function createAsset(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    const symbol = cleanSymbol(assetForm.symbol);
    const yahooSymbol = cleanSymbol(assetForm.yahooSymbol);
    const assetId = crypto.randomUUID();
    const { error: assetError } = await supabase.from("assets").insert({
      id: assetId,
      asset_type: assetForm.assetType,
      name: assetForm.name.trim() || symbol || assetForm.isin.trim(),
      isin: assetForm.isin.trim() || null,
      currency: assetForm.currency.trim().toUpperCase() || "EUR",
    });
    if (assetError) {
      setMessage(assetError.message);
      return;
    }

    const identifierRows = [
      symbol
        ? {
            asset_id: assetId,
            provider: "manual",
            symbol,
            exchange: "",
            is_primary: true,
          }
        : null,
      yahooSymbol
        ? {
            asset_id: assetId,
            provider: "yahoo",
            symbol: yahooSymbol,
            exchange: "",
            is_primary: true,
          }
        : null,
    ].filter(Boolean);

    if (identifierRows.length) {
      const { error: identifierError } = await supabase.from("asset_identifiers").insert(identifierRows);
      if (identifierError) {
        setMessage(identifierError.message);
        return;
      }
    }
    setAssetForm(DEFAULT_ASSET_FORM);
    setMessage("Activo guardado.");
    await loadDashboardData();
  }

  async function createTransaction(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    const selectedAsset = assets.find((asset) => asset.id === transactionForm.assetId);
    const selectedBroker = brokers.find((broker) => broker.id === transactionForm.brokerId);
    if (!selectedAsset || !selectedBroker) {
      setMessage("Selecciona activo y broker.");
      return;
    }
    const signedQuantity = signedNumber(transactionForm.quantity, transactionForm.type);
    const sourceRowHash = await digest(
      [
        "manual-app",
        transactionForm.tradeDate,
        transactionForm.type,
        transactionForm.assetId,
        transactionForm.brokerId,
        signedQuantity,
        transactionForm.grossAmount,
      ].join("|")
    );
    const { error } = await supabase.from("transactions").insert({
      asset_id: transactionForm.assetId,
      broker_id: transactionForm.brokerId,
      trade_date: transactionForm.tradeDate,
      type: transactionForm.type,
      quantity: signedQuantity,
      gross_amount: transactionForm.grossAmount,
      fees: transactionForm.fees || "0",
      tax: transactionForm.tax || "0",
      currency: transactionForm.currency.trim().toUpperCase() || selectedAsset.currency,
      source_file: "manual-app",
      source_row_hash: sourceRowHash,
      raw_payload: {
        note: transactionForm.sourceNote,
        asset: selectedAsset.name,
        broker: selectedBroker.name,
        entered_at: new Date().toISOString(),
      },
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setTransactionForm((current) => ({ ...DEFAULT_TRANSACTION_FORM, brokerId: current.brokerId }));
    setMessage("Movimiento guardado.");
    await loadDashboardData();
  }

  const primarySymbols = useMemo(() => {
    const map = new Map<string, string>();
    for (const identifier of identifiers) {
      if (identifier.is_primary && !map.has(identifier.asset_id)) {
        map.set(identifier.asset_id, identifier.symbol);
      }
    }
    return map;
  }, [identifiers]);

  const totals = useMemo(() => {
    return positions.reduce(
      (acc, row) => {
        acc.marketValue += Number(row.market_value ?? 0);
        acc.dailyGain += Number(row.daily_gain ?? 0);
        return acc;
      },
      { marketValue: 0, dailyGain: 0 }
    );
  }, [positions]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Portfolio App</p>
          <h1>Cartera privada</h1>
        </div>
        <div className="login-box">
          {session ? (
            <>
              <span>{session.user.email}</span>
              <button onClick={signOut}>Salir</button>
            </>
          ) : (
            <>
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email"
              />
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="contrasena"
              />
              <button onClick={signIn}>Entrar</button>
            </>
          )}
        </div>
      </header>

      <section className="summary-grid">
        <article>
          <span>Valor mercado EUR</span>
          <strong>{formatMoney(totals.marketValue)}</strong>
        </article>
        <article>
          <span>P&G del dia EUR</span>
          <strong className={totals.dailyGain >= 0 ? "good" : "bad"}>{formatMoney(totals.dailyGain)}</strong>
        </article>
        <article>
          <span>Posiciones abiertas</span>
          <strong>{positions.length}</strong>
        </article>
        <article>
          <span>Pendiente resolver</span>
          <strong>{queue.length}</strong>
        </article>
      </section>

      {message && <p className="message">{message}</p>}

      <section className="work-grid">
        <form className="panel form-panel" onSubmit={createTransaction}>
          <div className="panel-header">
            <h2>Registrar compra o venta</h2>
          </div>
          <label>
            Activo
            <select
              value={transactionForm.assetId}
              onChange={(event) => setTransactionForm({ ...transactionForm, assetId: event.target.value })}
            >
              <option value="">Seleccionar</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {primarySymbols.get(asset.id) ?? asset.name} - {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Broker
            <select
              value={transactionForm.brokerId}
              onChange={(event) => setTransactionForm({ ...transactionForm, brokerId: event.target.value })}
            >
              <option value="">Seleccionar</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Tipo
              <select
                value={transactionForm.type}
                onChange={(event) =>
                  setTransactionForm({ ...transactionForm, type: event.target.value as TransactionForm["type"] })
                }
              >
                <option value="buy">Compra</option>
                <option value="sell">Venta</option>
                <option value="transfer_in">Traspaso entrada</option>
                <option value="transfer_out">Traspaso salida</option>
              </select>
            </label>
            <label>
              Fecha
              <input
                type="date"
                value={transactionForm.tradeDate}
                onChange={(event) => setTransactionForm({ ...transactionForm, tradeDate: event.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Cantidad
              <input
                value={transactionForm.quantity}
                onChange={(event) => setTransactionForm({ ...transactionForm, quantity: event.target.value })}
                inputMode="decimal"
              />
            </label>
            <label>
              Importe EUR
              <input
                value={transactionForm.grossAmount}
                onChange={(event) => setTransactionForm({ ...transactionForm, grossAmount: event.target.value })}
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Comisiones
              <input
                value={transactionForm.fees}
                onChange={(event) => setTransactionForm({ ...transactionForm, fees: event.target.value })}
                inputMode="decimal"
              />
            </label>
            <label>
              Moneda
              <input
                value={transactionForm.currency}
                onChange={(event) => setTransactionForm({ ...transactionForm, currency: event.target.value })}
              />
            </label>
          </div>
          <label>
            Nota
            <input
              value={transactionForm.sourceNote}
              onChange={(event) => setTransactionForm({ ...transactionForm, sourceNote: event.target.value })}
            />
          </label>
          <button disabled={loading}>Guardar movimiento</button>
        </form>

        <form className="panel form-panel" onSubmit={createAsset}>
          <div className="panel-header">
            <h2>Alta manual de activo</h2>
          </div>
          <label>
            Nombre
            <input
              value={assetForm.name}
              onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })}
            />
          </label>
          <div className="form-row">
            <label>
              Ticker
              <input
                value={assetForm.symbol}
                onChange={(event) => setAssetForm({ ...assetForm, symbol: event.target.value })}
              />
            </label>
            <label>
              Yahoo
              <input
                value={assetForm.yahooSymbol}
                onChange={(event) => setAssetForm({ ...assetForm, yahooSymbol: event.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              ISIN
              <input
                value={assetForm.isin}
                onChange={(event) => setAssetForm({ ...assetForm, isin: event.target.value })}
              />
            </label>
            <label>
              Moneda
              <input
                value={assetForm.currency}
                onChange={(event) => setAssetForm({ ...assetForm, currency: event.target.value })}
              />
            </label>
          </div>
          <label>
            Tipo
            <select
              value={assetForm.assetType}
              onChange={(event) => setAssetForm({ ...assetForm, assetType: event.target.value as Asset["asset_type"] })}
            >
              <option value="stock">Accion</option>
              <option value="etf">ETF</option>
              <option value="fund">Fondo</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <button disabled={loading}>Guardar activo</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Posiciones abiertas</h2>
          <button onClick={loadDashboardData} disabled={loading}>
            {loading ? "Cargando" : "Actualizar"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Tipo</th>
                <th>Broker</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Divisa precio</th>
                <th>P&G dia EUR</th>
                <th>Valor EUR</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr key={`${row.asset_id}-${row.broker_id}`}>
                  <td>{row.name}</td>
                  <td>{row.asset_type}</td>
                  <td>{row.broker}</td>
                  <td>{formatNumber(row.quantity)}</td>
                  <td>{formatPlainMoney(row.price, row.price_currency ?? "EUR")}</td>
                  <td>{row.price_currency ?? "EUR"}</td>
                  <td className={Number(row.daily_gain ?? 0) >= 0 ? "good" : "bad"}>{formatMoney(row.daily_gain)}</td>
                  <td>{formatMoney(row.market_value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th>{formatMoney(totals.dailyGain)}</th>
                <th>{formatMoney(totals.marketValue)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Resoluciones pendientes</h2>
        </div>
        <div className="queue-list">
          {queue.length === 0 ? (
            <p className="empty">Sin pendientes.</p>
          ) : (
            queue.map((item) => (
              <article key={item.id} className="queue-item">
                <strong>{item.raw_name ?? item.symbol ?? "Movimiento sin activo"}</strong>
                <span>
                  {item.broker ?? "Sin broker"} · {item.source}
                </span>
                <p>{item.notes}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

function signedNumber(value: string, type: TransactionForm["type"]) {
  const number = Math.abs(Number(value.replace(",", ".")) || 0);
  return type === "sell" || type === "transfer_out" ? -number : number;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 6 });
}

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function formatPlainMoney(value: number | null | undefined, currency: string) {
  return Number(value ?? 0).toLocaleString("es-ES", { style: "currency", currency });
}

declare global {
  interface Window {
    __portfolioRoot?: Root;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element.");
}
window.__portfolioRoot = window.__portfolioRoot ?? createRoot(rootElement);
window.__portfolioRoot.render(<App />);

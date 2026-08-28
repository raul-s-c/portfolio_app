import { FormEvent, useEffect, useMemo, useState } from "react";
import { Root, createRoot } from "react-dom/client";
import { Session, SupabaseClient, createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const supabase = window.__portfolioSupabase ?? createClient(supabaseUrl, supabaseAnonKey);
window.__portfolioSupabase = supabase;

type TabId =
  | "dashboard"
  | "positions"
  | "transactions"
  | "dividends"
  | "assets"
  | "etf"
  | "cash"
  | "property"
  | "wealth"
  | "snapshots"
  | "importer"
  | "reports"
  | "queue"
  | "backup";

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
  average_cost_naive: number | null;
  cost_basis_naive: number | null;
  price: number | null;
  previous_close: number | null;
  market_value: number | null;
  daily_gain: number | null;
  price_currency: string | null;
  priced_at: string | null;
};

type Transaction = {
  id: string;
  asset_id: string;
  broker_id: string;
  trade_date: string;
  type: "buy" | "sell" | "transfer_in" | "transfer_out";
  quantity: number;
  gross_amount: number;
  fees: number;
  tax: number;
  currency: string;
  source_file: string | null;
  raw_payload: Record<string, unknown>;
};

type Dividend = {
  id: string;
  asset_id: string;
  broker_id: string;
  pay_date: string;
  gross_amount: number;
  tax: number;
  net_amount: number;
  currency: string;
  source_file: string | null;
  raw_payload: Record<string, unknown>;
};

type PriceSnapshot = {
  id: string;
  asset_id: string;
  priced_at: string;
  price: number;
  previous_close: number | null;
  currency: string;
  provider: string;
};

type PortfolioSnapshot = {
  id: string;
  snapshot_date: string;
  asset_id: string;
  broker_id: string;
  quantity: number;
  average_cost: number;
  cost_basis: number;
  market_value: number | null;
  latent_gain: number | null;
  daily_gain: number | null;
  currency: string;
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

type ResearchReport = {
  id: string;
  report_type: "portfolio_periodic" | "rebalance_opportunity";
  title: string;
  period_start: string | null;
  period_end: string | null;
  content_markdown: string;
  model: string;
  created_at: string;
};

type LegacyCash = {
  accounts?: Array<{ name: string; values?: Record<string, number>; comments?: Record<string, string> }>;
  objectives?: Array<{ name: string; target: number; current: number; targetDate?: string; simulationAdd?: number }>;
  plan?: Array<{ name: string; values?: Record<string, number>; comments?: Record<string, string> }>;
  months?: Array<{ key: string; label: string; year: number }>;
  selectedYear?: number;
};

type WealthRow = Record<string, string | number | null>;
type LegacyAppState = {
  cash?: LegacyCash;
  wealth_rows?: WealthRow[];
  wealth_summary?: WealthRow[];
  etfs?: Array<Record<string, string | number | null>>;
  property?: Array<Record<string, string | number | null>>;
  skipped?: unknown[];
  summary?: Record<string, unknown>;
  source_file?: string;
  loaded_at?: string;
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
  type: Transaction["type"];
  tradeDate: string;
  quantity: string;
  grossAmount: string;
  fees: string;
  tax: string;
  currency: string;
  sourceNote: string;
};

type DividendForm = {
  assetId: string;
  brokerId: string;
  payDate: string;
  netAmount: string;
  grossAmount: string;
  tax: string;
  currency: string;
  sourceNote: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "positions", label: "Posiciones" },
  { id: "transactions", label: "Movimientos" },
  { id: "dividends", label: "Dividendos" },
  { id: "assets", label: "Mapeos" },
  { id: "etf", label: "ETF" },
  { id: "cash", label: "Cash" },
  { id: "property", label: "Piso" },
  { id: "wealth", label: "Patrimonio" },
  { id: "snapshots", label: "Snapshots" },
  { id: "importer", label: "Importador" },
  { id: "reports", label: "Informes" },
  { id: "queue", label: "Pendientes" },
  { id: "backup", label: "Backup" },
];

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

const DEFAULT_DIVIDEND_FORM: DividendForm = {
  assetId: "",
  brokerId: "",
  payDate: new Date().toISOString().slice(0, 10),
  netAmount: "",
  grossAmount: "",
  tax: "",
  currency: "EUR",
  sourceNote: "",
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [positions, setPositions] = useState<Position[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [priceSnapshots, setPriceSnapshots] = useState<PriceSnapshot[]>([]);
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [queue, setQueue] = useState<ResolutionQueueItem[]>([]);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [legacyAppState, setLegacyAppState] = useState<LegacyAppState | null>(null);
  const [legacyStateMissing, setLegacyStateMissing] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetForm>(DEFAULT_ASSET_FORM);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(DEFAULT_TRANSACTION_FORM);
  const [dividendForm, setDividendForm] = useState<DividendForm>(DEFAULT_DIVIDEND_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [positionSearch, setPositionSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [dividendSearch, setDividendSearch] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [cashYear, setCashYear] = useState(String(new Date().getFullYear()));
  const [wealthMonth, setWealthMonth] = useState("");

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
    clearData();
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

  function clearData() {
    setPositions([]);
    setAssets([]);
    setIdentifiers([]);
    setBrokers([]);
    setTransactions([]);
    setDividends([]);
    setPriceSnapshots([]);
    setPortfolioSnapshots([]);
    setQueue([]);
    setReports([]);
    setLegacyAppState(null);
  }

  async function loadDashboardData() {
    if (!session) return;
    setLoading(true);
    const [
      positionsResult,
      assetsResult,
      identifiersResult,
      brokersResult,
      transactionsResult,
      dividendsResult,
      priceSnapshotsResult,
      portfolioSnapshotsResult,
      queueResult,
      appStateResult,
      reportsResult,
    ] = await Promise.all([
      supabase.from("v_open_positions").select("*").order("name"),
      supabase.from("assets").select("id,asset_type,name,isin,currency").order("name"),
      supabase.from("asset_identifiers").select("asset_id,provider,symbol,exchange,is_primary").order("symbol"),
      supabase.from("brokers").select("id,name").order("name"),
      supabase.from("transactions").select("*").order("trade_date", { ascending: false }).limit(500),
      supabase.from("dividends").select("*").order("pay_date", { ascending: false }).limit(500),
      supabase.from("price_snapshots").select("*").order("priced_at", { ascending: false }).limit(250),
      supabase.from("portfolio_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(500),
      supabase
        .from("asset_resolution_queue")
        .select("id,source,raw_name,symbol,isin,broker,status,notes,raw_payload,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("personal_app_state").select("payload").eq("key", "legacy_html_state").maybeSingle(),
      supabase
        .from("research_reports")
        .select("id,report_type,title,period_start,period_end,content_markdown,model,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const coreError =
      positionsResult.error ||
      assetsResult.error ||
      identifiersResult.error ||
      brokersResult.error ||
      transactionsResult.error ||
      dividendsResult.error ||
      priceSnapshotsResult.error ||
      portfolioSnapshotsResult.error ||
      queueResult.error;

    if (coreError) {
      setMessage(coreError.message);
    } else {
      setPositions((positionsResult.data ?? []) as Position[]);
      setAssets((assetsResult.data ?? []) as Asset[]);
      setIdentifiers((identifiersResult.data ?? []) as Identifier[]);
      setBrokers((brokersResult.data ?? []) as Broker[]);
      setTransactions((transactionsResult.data ?? []) as Transaction[]);
      setDividends((dividendsResult.data ?? []) as Dividend[]);
      setPriceSnapshots((priceSnapshotsResult.data ?? []) as PriceSnapshot[]);
      setPortfolioSnapshots((portfolioSnapshotsResult.data ?? []) as PortfolioSnapshot[]);
      setQueue((queueResult.data ?? []) as ResolutionQueueItem[]);
      setMessage("");
    }

    if (appStateResult.error) {
      setLegacyStateMissing(true);
      setLegacyAppState(null);
    } else {
      const payload = appStateResult.data?.payload as LegacyAppState | undefined;
      setLegacyAppState(payload ?? null);
      setLegacyStateMissing(!payload);
      if (payload?.cash?.selectedYear) setCashYear(String(payload.cash.selectedYear));
      const latestMonth = latestWealthMonth(payload?.wealth_summary ?? payload?.wealth_rows ?? []);
      if (latestMonth) setWealthMonth(latestMonth);
    }
    if (!reportsResult.error) {
      setReports((reportsResult.data ?? []) as ResearchReport[]);
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
      symbol ? { asset_id: assetId, provider: "manual", symbol, exchange: "", is_primary: true } : null,
      yahooSymbol ? { asset_id: assetId, provider: "yahoo", symbol: yahooSymbol, exchange: "", is_primary: true } : null,
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
        Date.now(),
      ].join("|")
    );
    const { error } = await supabase.from("transactions").insert({
      asset_id: transactionForm.assetId,
      broker_id: transactionForm.brokerId,
      trade_date: transactionForm.tradeDate,
      type: transactionForm.type,
      quantity: signedQuantity,
      gross_amount: toNumber(transactionForm.grossAmount),
      fees: toNumber(transactionForm.fees),
      tax: toNumber(transactionForm.tax),
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

  async function createDividend(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    const selectedAsset = assets.find((asset) => asset.id === dividendForm.assetId);
    const selectedBroker = brokers.find((broker) => broker.id === dividendForm.brokerId);
    if (!selectedAsset || !selectedBroker) {
      setMessage("Selecciona activo y broker.");
      return;
    }
    const net = toNumber(dividendForm.netAmount);
    const gross = toNumber(dividendForm.grossAmount) || net;
    const tax = toNumber(dividendForm.tax) || Math.max(0, gross - net);
    const sourceRowHash = await digest(
      ["manual-dividend", dividendForm.payDate, dividendForm.assetId, dividendForm.brokerId, net, Date.now()].join("|")
    );
    const { error } = await supabase.from("dividends").insert({
      asset_id: dividendForm.assetId,
      broker_id: dividendForm.brokerId,
      pay_date: dividendForm.payDate,
      gross_amount: gross,
      tax,
      net_amount: net,
      currency: dividendForm.currency.trim().toUpperCase() || selectedAsset.currency,
      source_file: "manual-app",
      source_row_hash: sourceRowHash,
      raw_payload: {
        note: dividendForm.sourceNote,
        asset: selectedAsset.name,
        broker: selectedBroker.name,
        entered_at: new Date().toISOString(),
      },
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setDividendForm((current) => ({ ...DEFAULT_DIVIDEND_FORM, brokerId: current.brokerId }));
    setMessage("Dividendo guardado.");
    await loadDashboardData();
  }

  function exportBackup() {
    const backup = {
      exported_at: new Date().toISOString(),
      assets,
      identifiers,
      brokers,
      transactions,
      dividends,
      price_snapshots: priceSnapshots,
      portfolio_snapshots: portfolioSnapshots,
      asset_resolution_queue: queue,
      legacy_app_state: legacyAppState,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const brokerById = useMemo(() => new Map(brokers.map((broker) => [broker.id, broker])), [brokers]);

  const primarySymbols = useMemo(() => {
    const map = new Map<string, string>();
    for (const identifier of identifiers) {
      if (identifier.is_primary && !map.has(identifier.asset_id)) map.set(identifier.asset_id, identifier.symbol);
    }
    return map;
  }, [identifiers]);

  const totals = useMemo(() => {
    const marketValue = positions.reduce((acc, row) => acc + Number(row.market_value ?? 0), 0);
    const costBasis = positions.reduce((acc, row) => acc + Number(row.cost_basis_naive ?? 0), 0);
    const dailyGain = positions.reduce((acc, row) => acc + Number(row.daily_gain ?? 0), 0);
    const dividendsNet = dividends.reduce((acc, row) => acc + Number(row.net_amount ?? 0), 0);
    return { marketValue, costBasis, dailyGain, dividendsNet, latentGain: marketValue - costBasis };
  }, [positions, dividends]);

  const enrichedPositions = useMemo(
    () =>
      positions.map((row) => ({
        ...row,
        symbol: primarySymbols.get(row.asset_id) ?? row.name,
        costBasis: Number(row.cost_basis_naive ?? 0),
        marketValue: Number(row.market_value ?? 0),
        dailyGain: Number(row.daily_gain ?? 0),
        latentGain: Number(row.market_value ?? 0) - Number(row.cost_basis_naive ?? 0),
      })),
    [positions, primarySymbols]
  );

  const filteredPositions = useMemo(() => {
    const q = positionSearch.trim().toLowerCase();
    return enrichedPositions.filter(
      (row) =>
        (!q || [row.symbol, row.name, row.broker, row.asset_type].some((value) => value.toLowerCase().includes(q))) &&
        (!brokerFilter || row.broker === brokerFilter) &&
        (!typeFilter || row.asset_type === typeFilter)
    );
  }, [enrichedPositions, positionSearch, brokerFilter, typeFilter]);

  const transactionRows = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    return transactions
      .map((row) => ({
        ...row,
        asset: assetById.get(row.asset_id),
        broker: brokerById.get(row.broker_id),
      }))
      .filter((row) => {
        const symbol = primarySymbols.get(row.asset_id) ?? "";
        return !q || [symbol, row.asset?.name, row.broker?.name, row.type, row.source_file].some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [transactions, movementSearch, assetById, brokerById, primarySymbols]);

  const dividendRows = useMemo(() => {
    const q = dividendSearch.trim().toLowerCase();
    return dividends
      .map((row) => ({
        ...row,
        asset: assetById.get(row.asset_id),
        broker: brokerById.get(row.broker_id),
      }))
      .filter((row) => {
        const symbol = primarySymbols.get(row.asset_id) ?? "";
        return !q || [symbol, row.asset?.name, row.broker?.name, row.source_file].some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [dividends, dividendSearch, assetById, brokerById, primarySymbols]);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      const symbols = identifiers.filter((identifier) => identifier.asset_id === asset.id).map((identifier) => identifier.symbol);
      return !q || [asset.name, asset.asset_type, asset.isin, asset.currency, ...symbols].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [assets, identifiers, assetSearch]);

  const brokerNames = [...new Set(enrichedPositions.map((row) => row.broker))].sort();
  const assetTypes = [...new Set(enrichedPositions.map((row) => row.asset_type))].sort();
  const cash = legacyAppState?.cash;
  const wealthSummary = legacyAppState?.wealth_summary ?? [];
  const wealthRows = legacyAppState?.wealth_rows ?? [];

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
              <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" />
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

      <nav className="tabs" aria-label="Vistas de cartera">
        {TABS.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="summary-grid">
        <Metric label="Valor mercado EUR" value={formatMoney(totals.marketValue)} />
        <Metric label="Coste EUR" value={formatMoney(totals.costBasis)} />
        <Metric label="P&G latente" value={formatMoney(totals.latentGain)} tone={totals.latentGain >= 0 ? "good" : "bad"} />
        <Metric label="Dividendos netos" value={formatMoney(totals.dividendsNet)} />
      </section>

      {message && <p className="message">{message}</p>}
      {legacyStateMissing && ["cash", "wealth", "property", "etf", "backup"].includes(activeTab) && (
        <p className="message">
          Falta cargar el estado legacy JSON. Ejecuta la migracion 008 y luego `node scripts/load_legacy_app_state.mjs`.
        </p>
      )}

      {activeTab === "dashboard" && (
        <DashboardView
          positions={enrichedPositions}
          totals={totals}
          queueCount={queue.length}
          onRefresh={loadDashboardData}
          loading={loading}
        />
      )}
      {activeTab === "positions" && (
        <PositionsView
          rows={filteredPositions}
          brokerNames={brokerNames}
          assetTypes={assetTypes}
          brokerFilter={brokerFilter}
          typeFilter={typeFilter}
          search={positionSearch}
          setBrokerFilter={setBrokerFilter}
          setTypeFilter={setTypeFilter}
          setSearch={setPositionSearch}
        />
      )}
      {activeTab === "transactions" && (
        <TransactionsView
          rows={transactionRows}
          assets={assets}
          brokers={brokers}
          primarySymbols={primarySymbols}
          form={transactionForm}
          setForm={setTransactionForm}
          onSubmit={createTransaction}
          search={movementSearch}
          setSearch={setMovementSearch}
          loading={loading}
        />
      )}
      {activeTab === "dividends" && (
        <DividendsView
          rows={dividendRows}
          assets={assets}
          brokers={brokers}
          primarySymbols={primarySymbols}
          form={dividendForm}
          setForm={setDividendForm}
          onSubmit={createDividend}
          search={dividendSearch}
          setSearch={setDividendSearch}
          loading={loading}
        />
      )}
      {activeTab === "assets" && (
        <AssetsView
          assets={filteredAssets}
          allAssets={assets}
          identifiers={identifiers}
          search={assetSearch}
          setSearch={setAssetSearch}
          form={assetForm}
          setForm={setAssetForm}
          onSubmit={createAsset}
          loading={loading}
        />
      )}
      {activeTab === "etf" && <EtfView positions={enrichedPositions} etfs={legacyAppState?.etfs ?? []} />}
      {activeTab === "cash" && <CashView cash={cash} year={cashYear} setYear={setCashYear} />}
      {activeTab === "property" && <PropertyView property={legacyAppState?.property ?? []} />}
      {activeTab === "wealth" && <WealthView rows={wealthRows} summary={wealthSummary} month={wealthMonth} setMonth={setWealthMonth} />}
      {activeTab === "snapshots" && (
        <SnapshotsView
          portfolioSnapshots={portfolioSnapshots}
          priceSnapshots={priceSnapshots}
          assetById={assetById}
          brokerById={brokerById}
          primarySymbols={primarySymbols}
        />
      )}
      {activeTab === "importer" && <ImporterView />}
      {activeTab === "reports" && <ReportsView reports={reports} />}
      {activeTab === "queue" && <QueueView queue={queue} />}
      {activeTab === "backup" && (
        <BackupView
          onExport={exportBackup}
          legacyAppState={legacyAppState}
          counts={{
            assets: assets.length,
            transactions: transactions.length,
            dividends: dividends.length,
            prices: priceSnapshots.length,
            snapshots: portfolioSnapshots.length,
          }}
        />
      )}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  return (
    <article>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  );
}

function DashboardView({
  positions,
  totals,
  queueCount,
  onRefresh,
  loading,
}: {
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  totals: { marketValue: number; costBasis: number; dailyGain: number; dividendsNet: number; latentGain: number };
  queueCount: number;
  onRefresh: () => void;
  loading: boolean;
}) {
  const byType = groupPositions(positions, (row) => assetTypeLabel(row.asset_type));
  const byBroker = groupPositions(positions, (row) => row.broker);
  const byCurrency = groupPositions(positions, (row) => row.price_currency ?? "EUR");
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Vista general</h2>
          <button onClick={onRefresh} disabled={loading}>
            {loading ? "Cargando" : "Actualizar"}
          </button>
        </div>
        <div className="summary-grid compact">
          <Metric label="P&G del dia" value={formatMoney(totals.dailyGain)} tone={totals.dailyGain >= 0 ? "good" : "bad"} />
          <Metric label="Rentabilidad latente" value={formatPercent(totals.costBasis ? totals.latentGain / totals.costBasis : 0)} tone={totals.latentGain >= 0 ? "good" : "bad"} />
          <Metric label="Posiciones abiertas" value={positions.length} />
          <Metric label="Pendiente resolver" value={queueCount} />
        </div>
      </section>
      <section className="three-grid">
        <AllocationPanel title="Asignacion por tipo" rows={byType} />
        <AllocationPanel title="Asignacion por broker" rows={byBroker} />
        <AllocationPanel title="Exposicion por moneda" rows={byCurrency} />
      </section>
      <section className="panel">
        <h2>Mayores posiciones</h2>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Peso", "P&G"]}
          rows={positions.slice(0, 12).map((row) => [
            row.symbol,
            row.name,
            row.broker,
            formatMoney(row.marketValue),
            formatPercent(totals.marketValue ? row.marketValue / totals.marketValue : 0),
            <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          ])}
        />
      </section>
    </>
  );
}

function PositionsView({
  rows,
  brokerNames,
  assetTypes,
  brokerFilter,
  typeFilter,
  search,
  setBrokerFilter,
  setTypeFilter,
  setSearch,
}: {
  rows: Array<Position & { symbol: string; costBasis: number; marketValue: number; dailyGain: number; latentGain: number }>;
  brokerNames: string[];
  assetTypes: string[];
  brokerFilter: string;
  typeFilter: string;
  search: string;
  setBrokerFilter: (value: string) => void;
  setTypeFilter: (value: string) => void;
  setSearch: (value: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Operaciones abiertas</h2>
        <div className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar" />
          <select value={brokerFilter} onChange={(event) => setBrokerFilter(event.target.value)}>
            <option value="">Todos los brokers</option>
            {brokerNames.map((broker) => (
              <option key={broker}>{broker}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Todos los tipos</option>
            {assetTypes.map((type) => (
              <option key={type} value={type}>
                {assetTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SimpleTable
        columns={[
          "Ticker",
          "Activo",
          "Tipo",
          "Broker",
          "Cantidad",
          "Precio",
          "Moneda",
          "Valor EUR",
          "Coste EUR",
          "P&G",
          "P&G dia",
          "Actualizado",
        ]}
        rows={rows.map((row) => [
          row.symbol,
          row.name,
          assetTypeLabel(row.asset_type),
          row.broker,
          formatNumber(row.quantity),
          formatPlainMoney(row.price, row.price_currency ?? "EUR"),
          row.price_currency ?? "EUR",
          formatMoney(row.marketValue),
          formatMoney(row.costBasis),
          <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          <span className={row.dailyGain >= 0 ? "good" : "bad"}>{formatMoney(row.dailyGain)}</span>,
          row.priced_at ? new Date(row.priced_at).toLocaleString("es-ES") : "",
        ])}
      />
    </section>
  );
}

function TransactionsView({
  rows,
  assets,
  brokers,
  primarySymbols,
  form,
  setForm,
  onSubmit,
  search,
  setSearch,
  loading,
}: {
  rows: Array<Transaction & { asset?: Asset; broker?: Broker }>;
  assets: Asset[];
  brokers: Broker[];
  primarySymbols: Map<string, string>;
  form: TransactionForm;
  setForm: (value: TransactionForm) => void;
  onSubmit: (event: FormEvent) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
}) {
  return (
    <>
      <TransactionFormPanel assets={assets} brokers={brokers} primarySymbols={primarySymbols} form={form} setForm={setForm} onSubmit={onSubmit} loading={loading} />
      <section className="panel">
        <div className="panel-header">
          <h2>Base de datos acciones</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar movimientos" />
        </div>
        <SimpleTable
          columns={["Fecha", "Ticker", "Activo", "Tipo", "Cantidad", "Importe", "Fees", "Moneda", "Broker", "Fuente"]}
          rows={rows.map((row) => [
            row.trade_date,
            primarySymbols.get(row.asset_id) ?? "",
            row.asset?.name ?? "",
            movementLabel(row.type),
            formatNumber(row.quantity),
            formatPlainMoney(row.gross_amount, row.currency),
            formatPlainMoney(row.fees, row.currency),
            row.currency,
            row.broker?.name ?? "",
            row.source_file ?? "",
          ])}
        />
      </section>
    </>
  );
}

function TransactionFormPanel({
  assets,
  brokers,
  primarySymbols,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  assets: Asset[];
  brokers: Broker[];
  primarySymbols: Map<string, string>;
  form: TransactionForm;
  setForm: (value: TransactionForm) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
}) {
  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <h2>Anadir movimiento</h2>
      <div className="form-row">
        <label>
          Activo
          <select value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })}>
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
          <select value={form.brokerId} onChange={(event) => setForm({ ...form, brokerId: event.target.value })}>
            <option value="">Seleccionar</option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Tipo
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as TransactionForm["type"] })}>
            <option value="buy">Compra</option>
            <option value="sell">Venta</option>
            <option value="transfer_in">Traspaso entrada</option>
            <option value="transfer_out">Traspaso salida</option>
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={form.tradeDate} onChange={(event) => setForm({ ...form, tradeDate: event.target.value })} />
        </label>
        <label>
          Cantidad
          <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} inputMode="decimal" />
        </label>
        <label>
          Importe
          <input value={form.grossAmount} onChange={(event) => setForm({ ...form, grossAmount: event.target.value })} inputMode="decimal" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Comisiones
          <input value={form.fees} onChange={(event) => setForm({ ...form, fees: event.target.value })} inputMode="decimal" />
        </label>
        <label>
          Impuestos
          <input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} inputMode="decimal" />
        </label>
        <label>
          Moneda
          <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
        </label>
        <label>
          Nota
          <input value={form.sourceNote} onChange={(event) => setForm({ ...form, sourceNote: event.target.value })} />
        </label>
      </div>
      <button disabled={loading}>Guardar movimiento</button>
    </form>
  );
}

function DividendsView({
  rows,
  assets,
  brokers,
  primarySymbols,
  form,
  setForm,
  onSubmit,
  search,
  setSearch,
  loading,
}: {
  rows: Array<Dividend & { asset?: Asset; broker?: Broker }>;
  assets: Asset[];
  brokers: Broker[];
  primarySymbols: Map<string, string>;
  form: DividendForm;
  setForm: (value: DividendForm) => void;
  onSubmit: (event: FormEvent) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
}) {
  const totalNet = rows.reduce((acc, row) => acc + Number(row.net_amount ?? 0), 0);
  const totalTax = rows.reduce((acc, row) => acc + Number(row.tax ?? 0), 0);
  return (
    <>
      <form className="panel form-panel" onSubmit={onSubmit}>
        <h2>Anadir dividendo</h2>
        <div className="form-row">
          <label>
            Activo
            <select value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })}>
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
            <select value={form.brokerId} onChange={(event) => setForm({ ...form, brokerId: event.target.value })}>
              <option value="">Seleccionar</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Fecha
            <input type="date" value={form.payDate} onChange={(event) => setForm({ ...form, payDate: event.target.value })} />
          </label>
          <label>
            Neto
            <input value={form.netAmount} onChange={(event) => setForm({ ...form, netAmount: event.target.value })} inputMode="decimal" />
          </label>
          <label>
            Bruto
            <input value={form.grossAmount} onChange={(event) => setForm({ ...form, grossAmount: event.target.value })} inputMode="decimal" />
          </label>
          <label>
            Tax
            <input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} inputMode="decimal" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Moneda
            <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
          </label>
          <label>
            Nota
            <input value={form.sourceNote} onChange={(event) => setForm({ ...form, sourceNote: event.target.value })} />
          </label>
        </div>
        <button disabled={loading}>Guardar dividendo</button>
      </form>
      <section className="panel">
        <div className="panel-header">
          <h2>Base de datos dividendos</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar dividendos" />
        </div>
        <div className="summary-grid compact">
          <Metric label="Neto visible" value={formatMoney(totalNet)} />
          <Metric label="Retencion visible" value={formatMoney(totalTax)} />
          <Metric label="Filas" value={rows.length} />
          <Metric label="Media neta" value={formatMoney(rows.length ? totalNet / rows.length : 0)} />
        </div>
        <SimpleTable
          columns={["Fecha", "Ticker", "Activo", "Bruto", "Tax", "Neto", "Moneda", "Broker", "Fuente"]}
          rows={rows.map((row) => [
            row.pay_date,
            primarySymbols.get(row.asset_id) ?? "",
            row.asset?.name ?? "",
            formatPlainMoney(row.gross_amount, row.currency),
            formatPlainMoney(row.tax, row.currency),
            formatPlainMoney(row.net_amount, row.currency),
            row.currency,
            row.broker?.name ?? "",
            row.source_file ?? "",
          ])}
        />
      </section>
    </>
  );
}

function AssetsView({
  assets,
  allAssets,
  identifiers,
  search,
  setSearch,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  assets: Asset[];
  allAssets: Asset[];
  identifiers: Identifier[];
  search: string;
  setSearch: (value: string) => void;
  form: AssetForm;
  setForm: (value: AssetForm) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
}) {
  return (
    <>
      <form className="panel form-panel" onSubmit={onSubmit}>
        <h2>Alta manual de activo</h2>
        <div className="form-row">
          <label>
            Nombre
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Ticker
            <input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} />
          </label>
          <label>
            Yahoo
            <input value={form.yahooSymbol} onChange={(event) => setForm({ ...form, yahooSymbol: event.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label>
            ISIN
            <input value={form.isin} onChange={(event) => setForm({ ...form, isin: event.target.value })} />
          </label>
          <label>
            Moneda
            <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
          </label>
          <label>
            Tipo
            <select value={form.assetType} onChange={(event) => setForm({ ...form, assetType: event.target.value as Asset["asset_type"] })}>
              <option value="stock">Accion</option>
              <option value="etf">ETF</option>
              <option value="fund">Fondo</option>
              <option value="cash">Cash</option>
            </select>
          </label>
        </div>
        <button disabled={loading}>Guardar activo</button>
      </form>
      <section className="panel">
        <div className="panel-header">
          <h2>Activos y mapeos broker a ticker</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar activos" />
        </div>
        <SimpleTable
          columns={["Activo", "Tipo", "Moneda", "ISIN", "Identificadores"]}
          rows={assets.map((asset) => [
            asset.name,
            assetTypeLabel(asset.asset_type),
            asset.currency,
            asset.isin ?? "",
            identifiers
              .filter((identifier) => identifier.asset_id === asset.id)
              .map((identifier) => `${identifier.provider}:${identifier.symbol}`)
              .join(", "),
          ])}
        />
        <p className="muted">{allAssets.length} activos totales.</p>
      </section>
    </>
  );
}

function EtfView({
  positions,
  etfs,
}: {
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  etfs: Array<Record<string, string | number | null>>;
}) {
  const etfPositions = positions.filter((row) => row.asset_type === "etf");
  const total = etfPositions.reduce((acc, row) => acc + row.marketValue, 0);
  return (
    <>
      <section className="panel">
        <h2>Rebalanceo ETF</h2>
        <div className="summary-grid compact">
          <Metric label="ETF abiertos" value={etfPositions.length} />
          <Metric label="Valor ETF" value={formatMoney(total)} />
          <Metric label="Universo legacy" value={etfs.length} />
          <Metric label="Peso mayor ETF" value={formatPercent(total ? Math.max(...etfPositions.map((row) => row.marketValue)) / total : 0)} />
        </div>
        <AllocationPanel title="Peso actual ETF" rows={groupPositions(etfPositions, (row) => row.symbol)} />
      </section>
      <section className="panel">
        <h2>Detalle ETF legacy</h2>
        <SimpleTable
          columns={["Ticker", "Nombre", "ISIN", "Peso objetivo", "Proveedor"]}
          rows={etfs.map((row) => [
            row.symbol ?? row.ticker ?? "",
            row.provider_name ?? row.name ?? "",
            row.isin ?? "",
            row.targetWeight != null ? formatPercent(Number(row.targetWeight)) : "",
            row.provider ?? "",
          ])}
        />
      </section>
    </>
  );
}

function CashView({ cash, year, setYear }: { cash?: LegacyCash; year: string; setYear: (value: string) => void }) {
  const accounts = cash?.accounts ?? [];
  const plan = cash?.plan ?? [];
  const objectives = cash?.objectives ?? [];
  const months = (cash?.months ?? []).filter((month) => String(month.year) === year);
  const years = [...new Set((cash?.months ?? []).map((month) => String(month.year)))].sort();
  const latestMonth = latestMonthWithAccountValue(accounts) ?? months.at(-1)?.key ?? "";
  const cashTotal = accounts.reduce((acc, account) => acc + Number(account.values?.[latestMonth] ?? 0), 0);
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Cash</h2>
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            {years.length === 0 && <option>{year}</option>}
            {years.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="summary-grid compact">
          <Metric label={`Saldo ${latestMonth || year}`} value={formatMoney(cashTotal)} />
          <Metric label="Cuentas" value={accounts.length} />
          <Metric label="Objetivos" value={objectives.length} />
          <Metric label="Lineas plan" value={plan.length} />
        </div>
      </section>
      <section className="two-grid">
        <div className="panel">
          <h2>Objetivos cash</h2>
          <SimpleTable
            columns={["Objetivo", "Actual", "Meta", "Fecha", "Mensual"]}
            rows={objectives.map((row) => [
              row.name,
              formatMoney(row.current),
              formatMoney(row.target),
              row.targetDate ?? "",
              formatMoney(row.simulationAdd),
            ])}
          />
        </div>
        <div className="panel">
          <h2>Cuentas</h2>
          <SimpleTable
            columns={["Cuenta", latestMonth || "Ultimo mes"]}
            rows={accounts.map((account) => [account.name, formatMoney(account.values?.[latestMonth] ?? 0)])}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Costes e ingresos previstos</h2>
        <WideMatrix
          firstColumn="Concepto"
          columns={months.map((month) => month.label ?? month.key)}
          rows={plan.map((row) => ({
            label: row.name,
            values: months.map((month) => formatMoney(row.values?.[month.key] ?? 0)),
          }))}
        />
      </section>
    </>
  );
}

function PropertyView({ property }: { property: Array<Record<string, string | number | null>> }) {
  return (
    <section className="panel">
      <h2>Seguimiento piso</h2>
      <SimpleTable
        columns={["Fecha", "Valor piso", "Hipoteca", "Deuda familiar", "Equity"]}
        rows={property.map((row) => [
          row.date ?? row.Fecha ?? "",
          formatMoney(Number(row.propertyValue ?? row["Valor piso"] ?? 0)),
          formatMoney(Number(row.mortgage ?? row.Hipoteca ?? 0)),
          formatMoney(Number(row.familyDebt ?? row["Deuda familiar"] ?? 0)),
          formatMoney(Number(row.equity ?? row.Equity ?? 0)),
        ])}
      />
    </section>
  );
}

function WealthView({ rows, summary, month, setMonth }: { rows: WealthRow[]; summary: WealthRow[]; month: string; setMonth: (value: string) => void }) {
  const months = [...new Set(rows.map((row) => monthKey(row.Fecha)).filter(Boolean))].sort();
  const selectedMonth = month || months.at(-1) || "";
  const monthRows = rows.filter((row) => monthKey(row.Fecha) === selectedMonth);
  const latest = summary.at(-1);
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Patrimonio mensual</h2>
          <input type="month" value={selectedMonth} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="summary-grid compact">
          <Metric label="Valor mercado" value={formatMoney(Number(latest?.["Total valor mercado"] ?? 0))} />
          <Metric label="Aportaciones" value={formatMoney(Number(latest?.["total aportaciones"] ?? 0))} />
          <Metric label="Rendimiento" value={formatPercent(Number(latest?.Rendimiento ?? 0))} tone={Number(latest?.Rendimiento ?? 0) >= 0 ? "good" : "bad"} />
          <Metric label="Meses" value={summary.length} />
        </div>
        <LineChart rows={summary} metric="Total valor mercado" />
      </section>
      <section className="panel">
        <h2>Detalle del mes</h2>
        <SimpleTable
          columns={["Tipo", "Liquido", "Fecha", "Aportaciones", "Mercado", "Dividendos", "Rendimiento"]}
          rows={monthRows.map((row) => [
            row.Tipo ?? "",
            row["Liquido / No"] ?? "",
            row.Fecha ?? "",
            formatMoney(Number(row["Valor aportaciones"] ?? 0)),
            formatMoney(Number(row["Valor mercado"] ?? 0)),
            formatMoney(Number(row["Dividendos recibidos"] ?? 0)),
            formatPercent(Number(row.Rendimiento ?? 0)),
          ])}
        />
      </section>
    </>
  );
}

function SnapshotsView({
  portfolioSnapshots,
  priceSnapshots,
  assetById,
  brokerById,
  primarySymbols,
}: {
  portfolioSnapshots: PortfolioSnapshot[];
  priceSnapshots: PriceSnapshot[];
  assetById: Map<string, Asset>;
  brokerById: Map<string, Broker>;
  primarySymbols: Map<string, string>;
}) {
  return (
    <>
      <section className="panel">
        <h2>Snapshots de cartera</h2>
        <SimpleTable
          columns={["Fecha", "Ticker", "Activo", "Broker", "Cantidad", "Coste", "Mercado", "P&G", "Moneda"]}
          rows={portfolioSnapshots.map((row) => [
            row.snapshot_date,
            primarySymbols.get(row.asset_id) ?? "",
            assetById.get(row.asset_id)?.name ?? "",
            brokerById.get(row.broker_id)?.name ?? "",
            formatNumber(row.quantity),
            formatMoney(row.cost_basis),
            formatMoney(row.market_value),
            formatMoney(row.latent_gain),
            row.currency,
          ])}
        />
      </section>
      <section className="panel">
        <h2>Snapshots de precios</h2>
        <SimpleTable
          columns={["Fecha", "Ticker", "Activo", "Precio", "Anterior", "Moneda", "Proveedor"]}
          rows={priceSnapshots.map((row) => [
            new Date(row.priced_at).toLocaleString("es-ES"),
            primarySymbols.get(row.asset_id) ?? "",
            assetById.get(row.asset_id)?.name ?? "",
            formatPlainMoney(row.price, row.currency),
            formatPlainMoney(row.previous_close, row.currency),
            row.currency,
            row.provider,
          ])}
        />
      </section>
    </>
  );
}

function ImporterView() {
  return (
    <section className="panel">
      <h2>Importador mensual auditado</h2>
      <div className="summary-grid compact">
        <Metric label="MyInvestor CSV" value="Preparado" />
        <Metric label="Trade Republic CSV" value="Preparado" />
        <Metric label="IBKR CSV" value="Preparado" />
        <Metric label="Estado" value="Pendiente API" />
      </div>
      <p className="muted">
        La vista ya esta reservada en la app. El parser legacy existe en el HTML y el siguiente paso es moverlo a un script/API para validar candidatos antes de insertarlos en Supabase.
      </p>
    </section>
  );
}

function ReportsView({ reports }: { reports: ResearchReport[] }) {
  const periodic = reports.filter((report) => report.report_type === "portfolio_periodic");
  const rebalance = reports.filter((report) => report.report_type === "rebalance_opportunity");
  const latest = reports[0];
  return (
    <>
      <section className="panel">
        <h2>Informes y ponderacion</h2>
        <div className="summary-grid compact">
          <Metric label="Informes periodicos" value={periodic.length} />
          <Metric label="Recomendaciones" value={rebalance.length} />
          <Metric label="Ultimo modelo" value={latest?.model ?? ""} />
          <Metric label="Ultima fecha" value={latest ? new Date(latest.created_at).toLocaleDateString("es-ES") : ""} />
        </div>
        <p className="muted">
          Los informes se generan desde backend/GitHub Actions con Brave Search para contexto web y OpenAI para el analisis. La app solo lee los resultados guardados.
        </p>
      </section>
      <section className="panel">
        <h2>Ultimos informes</h2>
        <div className="report-list">
          {reports.length === 0 ? (
            <p className="empty">Sin informes todavia.</p>
          ) : (
            reports.map((report) => (
              <article className="report-card" key={report.id}>
                <header>
                  <strong>{report.title}</strong>
                  <span>
                    {report.report_type === "portfolio_periodic" ? "Informe periodico" : "Ponderacion"} -{" "}
                    {new Date(report.created_at).toLocaleString("es-ES")}
                  </span>
                </header>
                <pre>{report.content_markdown}</pre>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function QueueView({ queue }: { queue: ResolutionQueueItem[] }) {
  return (
    <section className="panel">
      <h2>Resoluciones pendientes</h2>
      <div className="queue-list">
        {queue.length === 0 ? (
          <p className="empty">Sin pendientes.</p>
        ) : (
          queue.map((item) => (
            <article key={item.id} className="queue-item">
              <strong>{item.raw_name ?? item.symbol ?? "Movimiento sin activo"}</strong>
              <span>
                {item.broker ?? "Sin broker"} - {item.source}
              </span>
              <p>{item.notes}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function BackupView({
  onExport,
  legacyAppState,
  counts,
}: {
  onExport: () => void;
  legacyAppState: LegacyAppState | null;
  counts: Record<string, number>;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Importar / exportar</h2>
        <button onClick={onExport}>Exportar JSON</button>
      </div>
      <SimpleTable
        columns={["Bloque", "Filas"]}
        rows={[
          ["Activos", counts.assets],
          ["Movimientos", counts.transactions],
          ["Dividendos", counts.dividends],
          ["Precios", counts.prices],
          ["Snapshots", counts.snapshots],
          ["Cash legacy", legacyAppState?.cash ? Object.keys(legacyAppState.cash).length : 0],
          ["Patrimonio legacy", legacyAppState?.wealth_rows?.length ?? 0],
        ]}
      />
      <pre className="json-preview">{JSON.stringify(legacyAppState ?? {}, null, 2).slice(0, 12000)}</pre>
    </section>
  );
}

function AllocationPanel({ title, rows }: { title: string; rows: Array<{ name: string; value: number; weight: number }> }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="mini-bars">
        {rows.map((row) => (
          <div className="bar-row" key={row.name}>
            <span>{row.name}</span>
            <div className="bar">
              <span style={{ width: `${Math.min(100, Math.max(0, row.weight * 100))}%` }} />
            </div>
            <b>{formatPercent(row.weight)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                Sin datos.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function WideMatrix({ firstColumn, columns, rows }: { firstColumn: string; columns: string[]; rows: Array<{ label: string; values: string[] }> }) {
  return (
    <div className="table-wrap">
      <table className="wide-table">
        <thead>
          <tr>
            <th>{firstColumn}</th>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {row.values.map((value, index) => (
                <td key={index}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineChart({ rows, metric }: { rows: WealthRow[]; metric: string }) {
  const values = rows
    .map((row) => ({ date: String(row.Mes ?? ""), value: Number(row[metric] ?? 0) }))
    .filter((row) => row.date && Number.isFinite(row.value));
  if (values.length === 0) return <p className="empty">Sin datos para graficar.</p>;
  const width = 960;
  const height = 260;
  const pad = 28;
  const min = Math.min(...values.map((row) => row.value));
  const max = Math.max(...values.map((row) => row.value));
  const x = (index: number) => pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  const points = values.map((row, index) => `${x(index)},${y(row.value)}`).join(" ");
  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={metric}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
      <polyline points={points} />
      <text x={pad} y={20}>
        {metric}: {formatMoney(values.at(-1)?.value ?? 0)}
      </text>
    </svg>
  );
}

function groupPositions<T extends { marketValue: number }>(rows: T[], keyFn: (row: T) => string) {
  const total = rows.reduce((acc, row) => acc + row.marketValue, 0) || 1;
  const map = new Map<string, number>();
  for (const row of rows) map.set(keyFn(row), (map.get(keyFn(row)) ?? 0) + row.marketValue);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, weight: value / total }));
}

function latestMonthWithAccountValue(accounts: NonNullable<LegacyCash["accounts"]>) {
  return [...new Set(accounts.flatMap((account) => Object.keys(account.values ?? {})))]
    .sort()
    .reverse()
    .find((month) => accounts.some((account) => Number(account.values?.[month] ?? 0) !== 0));
}

function latestWealthMonth(rows: WealthRow[]) {
  return rows
    .map((row) => monthKey(row.Mes ?? row.Fecha))
    .filter(Boolean)
    .sort()
    .at(-1);
}

function monthKey(value: unknown) {
  const raw = String(value ?? "");
  const match = raw.match(/^(\d{4})-(\d{2})/) ?? raw.match(/^(\d{1,2})\/(\d{4})/);
  if (!match) return "";
  if (match[1].length === 4) return `${match[1]}-${match[2]}`;
  return `${match[2]}-${match[1].padStart(2, "0")}`;
}

function assetTypeLabel(value: string) {
  const labels: Record<string, string> = { stock: "Accion", etf: "ETF", fund: "Fondo", cash: "Cash" };
  return labels[value] ?? value;
}

function movementLabel(value: Transaction["type"]) {
  const labels: Record<Transaction["type"], string> = {
    buy: "Compra",
    sell: "Venta",
    transfer_in: "Traspaso entrada",
    transfer_out: "Traspaso salida",
  };
  return labels[value];
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

function signedNumber(value: string, type: TransactionForm["type"]) {
  const number = Math.abs(toNumber(value));
  return type === "sell" || type === "transfer_out" ? -number : number;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value ?? "").replace(",", ".")) || 0;
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

function formatPercent(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-ES", { style: "percent", maximumFractionDigits: 2 });
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
    __portfolioSupabase?: SupabaseClient;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element.");
}
window.__portfolioRoot = window.__portfolioRoot ?? createRoot(rootElement);
window.__portfolioRoot.render(<App />);

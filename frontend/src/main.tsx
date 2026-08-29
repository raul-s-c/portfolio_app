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

type AssetTag = {
  asset_id: string;
  tag: string;
  notes: string | null;
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
  report_type: "portfolio_periodic" | "rebalance_opportunity" | "portfolio_group_analysis" | "etf_resilient_portfolio";
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
  updated_from_app_at?: string;
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

type TotalColumn = number | { index: number; format?: "money" | "number" | "percent" };
type CashSection = "month" | "objectives" | "annualPlan" | "annualAccounts";
type WealthSection = "period" | "chart" | "history";

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
  const [assetTags, setAssetTags] = useState<AssetTag[]>([]);
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
  const [savingState, setSavingState] = useState(false);
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
    setAssetTags([]);
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
      assetTagsResult,
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
      supabase.from("asset_tags").select("asset_id,tag,notes").order("tag"),
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
      setMessage(friendlySupabaseError(coreError.message));
    } else {
      setPositions((positionsResult.data ?? []) as Position[]);
      setAssets((assetsResult.data ?? []) as Asset[]);
      setIdentifiers((identifiersResult.data ?? []) as Identifier[]);
      setAssetTags(assetTagsResult.error ? [] : ((assetTagsResult.data ?? []) as AssetTag[]));
      setBrokers((brokersResult.data ?? []) as Broker[]);
      setTransactions((transactionsResult.data ?? []) as Transaction[]);
      setDividends((dividendsResult.data ?? []) as Dividend[]);
      setPriceSnapshots((priceSnapshotsResult.data ?? []) as PriceSnapshot[]);
      setPortfolioSnapshots((portfolioSnapshotsResult.data ?? []) as PortfolioSnapshot[]);
      setQueue((queueResult.data ?? []) as ResolutionQueueItem[]);
      setMessage("");
    }

    if (appStateResult.error) {
      setMessage(friendlySupabaseError(appStateResult.error.message));
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

  async function toggleStrategicEtfTag(assetId: string, enabled: boolean) {
    if (!session) {
      setMessage("Entra con tu email antes de cambiar tags.");
      return;
    }
    const tag = "myinvestor_resilient_etf";
    if (enabled) {
      const { error } = await supabase.from("asset_tags").upsert(
        {
          asset_id: assetId,
          tag,
          notes: "ETF de MyInvestor para cartera resistente: largo plazo, inflacion +2%, crecimiento +4/6%.",
        },
        { onConflict: "asset_id,tag" }
      );
      if (error) {
        setMessage(friendlySupabaseError(error.message));
        return;
      }
    } else {
      const { error } = await supabase.from("asset_tags").delete().eq("asset_id", assetId).eq("tag", tag);
      if (error) {
        setMessage(friendlySupabaseError(error.message));
        return;
      }
    }
    setMessage(enabled ? "ETF anadido a cartera resistente." : "ETF quitado de cartera resistente.");
    await loadDashboardData();
  }

  async function saveLegacyAppState(nextState = legacyAppState) {
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    if (!nextState) {
      setMessage("No hay estado legacy cargado para guardar.");
      return;
    }
    const updatedAt = new Date().toISOString();
    setSavingState(true);
    const { error } = await supabase.from("personal_app_state").upsert(
      {
        key: "legacy_html_state",
        payload: { ...nextState, updated_from_app_at: updatedAt },
      },
      { onConflict: "key" }
    );
    setSavingState(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setLegacyAppState({ ...nextState, updated_from_app_at: updatedAt });
    setMessage("Cambios guardados.");
  }

  function patchLegacyAppState(patch: Partial<LegacyAppState>) {
    setLegacyAppState((current) => ({ ...(current ?? {}), ...patch }));
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

  async function updateTransaction(id: string, form: TransactionForm) {
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    const selectedAsset = assets.find((asset) => asset.id === form.assetId);
    if (!selectedAsset) {
      setMessage("Selecciona activo.");
      return;
    }
    const currentRow = transactions.find((row) => row.id === id);
    const signedQuantity = signedNumber(form.quantity, form.type);
    const { error } = await supabase
      .from("transactions")
      .update({
        asset_id: form.assetId,
        broker_id: form.brokerId,
        trade_date: form.tradeDate,
        type: form.type,
        quantity: signedQuantity,
        gross_amount: toNumber(form.grossAmount),
        fees: toNumber(form.fees),
        tax: toNumber(form.tax),
        currency: form.currency.trim().toUpperCase() || selectedAsset.currency,
        raw_payload: {
          ...(currentRow?.raw_payload ?? {}),
          note: form.sourceNote,
          edited_at: new Date().toISOString(),
        },
      })
      .eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Movimiento actualizado.");
    await loadDashboardData();
  }

  async function deleteTransaction(id: string) {
    if (!session) {
      setMessage("Entra con tu email antes de borrar.");
      return;
    }
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Movimiento borrado.");
    await loadDashboardData();
  }

  async function updateDividend(id: string, form: DividendForm) {
    if (!session) {
      setMessage("Entra con tu email antes de guardar.");
      return;
    }
    const selectedAsset = assets.find((asset) => asset.id === form.assetId);
    if (!selectedAsset) {
      setMessage("Selecciona activo.");
      return;
    }
    const currentRow = dividends.find((row) => row.id === id);
    const net = toNumber(form.netAmount);
    const gross = toNumber(form.grossAmount) || net;
    const tax = toNumber(form.tax) || Math.max(0, gross - net);
    const { error } = await supabase
      .from("dividends")
      .update({
        asset_id: form.assetId,
        broker_id: form.brokerId,
        pay_date: form.payDate,
        gross_amount: gross,
        tax,
        net_amount: net,
        currency: form.currency.trim().toUpperCase() || selectedAsset.currency,
        raw_payload: {
          ...(currentRow?.raw_payload ?? {}),
          note: form.sourceNote,
          edited_at: new Date().toISOString(),
        },
      })
      .eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Dividendo actualizado.");
    await loadDashboardData();
  }

  async function deleteDividend(id: string) {
    if (!session) {
      setMessage("Entra con tu email antes de borrar.");
      return;
    }
    const { error } = await supabase.from("dividends").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Dividendo borrado.");
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
          onUpdate={updateTransaction}
          onDelete={deleteTransaction}
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
          onUpdate={updateDividend}
          onDelete={deleteDividend}
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
          assetTags={assetTags}
          search={assetSearch}
          setSearch={setAssetSearch}
          form={assetForm}
          setForm={setAssetForm}
          onSubmit={createAsset}
          loading={loading}
        />
      )}
      {activeTab === "etf" && (
        <EtfView
          positions={enrichedPositions}
          etfs={legacyAppState?.etfs ?? []}
          assetTags={assetTags}
          onChange={(nextEtfs) => patchLegacyAppState({ etfs: nextEtfs })}
          onSave={() => saveLegacyAppState()}
          onToggleStrategicTag={toggleStrategicEtfTag}
          saving={savingState}
        />
      )}
      {activeTab === "cash" && (
        <CashView
          cash={cash}
          year={cashYear}
          setYear={setCashYear}
          onChange={(nextCash) => patchLegacyAppState({ cash: nextCash })}
          onSave={() => saveLegacyAppState()}
          saving={savingState}
        />
      )}
      {activeTab === "property" && (
        <PropertyView
          property={legacyAppState?.property ?? []}
          wealthRows={wealthRows}
          onChange={(nextProperty) => patchLegacyAppState({ property: nextProperty })}
          onSave={() => saveLegacyAppState()}
          saving={savingState}
        />
      )}
      {activeTab === "wealth" && (
        <WealthView
          rows={wealthRows}
          summary={wealthSummary}
          month={wealthMonth}
          setMonth={setWealthMonth}
          positions={enrichedPositions}
          onChange={(nextRows, nextSummary) => patchLegacyAppState({ wealth_rows: nextRows, wealth_summary: nextSummary })}
          onSave={() => saveLegacyAppState()}
          saving={savingState}
        />
      )}
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
  const etfPositions = positions.filter((row) => row.asset_type === "etf");
  const etfTotal = etfPositions.reduce((acc, row) => acc + row.marketValue, 0);
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
        <h2>Todas las posiciones</h2>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Peso", "P&G"]}
          totalColumns={[{ index: 3, format: "money" }, { index: 5, format: "money" }]}
          rows={positions.map((row) => [
            row.symbol,
            row.name,
            row.broker,
            formatMoney(row.marketValue),
            formatPercent(totals.marketValue ? row.marketValue / totals.marketValue : 0),
            <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          ])}
        />
      </section>
      <section className="panel">
        <h2>Resumen ETF</h2>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Peso ETF", "P&G"]}
          totalColumns={[{ index: 3, format: "money" }, { index: 5, format: "money" }]}
          rows={etfPositions.map((row) => [
            row.symbol,
            row.name,
            row.broker,
            formatMoney(row.marketValue),
            formatPercent(etfTotal ? row.marketValue / etfTotal : 0),
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
        totalColumns={[{ index: 7, format: "money" }, { index: 8, format: "money" }, { index: 9, format: "money" }, { index: 10, format: "money" }]}
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
  onUpdate,
  onDelete,
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
  onUpdate: (id: string, form: TransactionForm) => void;
  onDelete: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, TransactionForm>>({});
  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, transactionFormFromRow(row)])));
  }, [rows]);
  const visibleTotal = rows.reduce((acc, row) => acc + Number(row.gross_amount ?? 0), 0);
  return (
    <>
      <TransactionFormPanel assets={assets} brokers={brokers} primarySymbols={primarySymbols} form={form} setForm={setForm} onSubmit={onSubmit} loading={loading} />
      <section className="panel">
        <div className="panel-header">
          <h2>Base de datos acciones</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar movimientos" />
        </div>
        <div className="summary-grid compact">
          <Metric label="Importe visible" value={formatMoney(visibleTotal)} />
          <Metric label="Filas visibles" value={rows.length} />
          <Metric label="Compras" value={rows.filter((row) => row.type === "buy").length} />
          <Metric label="Ventas" value={rows.filter((row) => row.type === "sell").length} />
        </div>
        <EditableTable
          columns={["Fecha", "Ticker", "Tipo", "Cantidad", "Importe", "Fees", "Tax", "Moneda", "Broker", "Nota", ""]}
          totalColumns={[{ index: 3, format: "number" }, { index: 4, format: "money" }, { index: 5, format: "money" }, { index: 6, format: "money" }]}
          rows={rows.map((row) => {
            const draft = drafts[row.id] ?? transactionFormFromRow(row);
            const setDraft = (patch: Partial<TransactionForm>) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, ...patch } }));
            return [
              <input type="date" value={draft.tradeDate} onChange={(event) => setDraft({ tradeDate: event.target.value })} />,
              <select value={draft.assetId} onChange={(event) => setDraft({ assetId: event.target.value })}>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {primarySymbols.get(asset.id) ?? asset.name} - {asset.name}
                  </option>
                ))}
              </select>,
              <select value={draft.type} onChange={(event) => setDraft({ type: event.target.value as TransactionForm["type"] })}>
                <option value="buy">Compra</option>
                <option value="sell">Venta</option>
                <option value="transfer_in">Traspaso entrada</option>
                <option value="transfer_out">Traspaso salida</option>
              </select>,
              <input value={draft.quantity} onChange={(event) => setDraft({ quantity: event.target.value })} inputMode="decimal" />,
              <input value={draft.grossAmount} onChange={(event) => setDraft({ grossAmount: event.target.value })} inputMode="decimal" />,
              <input value={draft.fees} onChange={(event) => setDraft({ fees: event.target.value })} inputMode="decimal" />,
              <input value={draft.tax} onChange={(event) => setDraft({ tax: event.target.value })} inputMode="decimal" />,
              <input value={draft.currency} onChange={(event) => setDraft({ currency: event.target.value.toUpperCase() })} />,
              <select value={draft.brokerId} onChange={(event) => setDraft({ brokerId: event.target.value })}>
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.name}
                  </option>
                ))}
              </select>,
              <input value={draft.sourceNote} onChange={(event) => setDraft({ sourceNote: event.target.value })} />,
              <div className="row-actions">
                <button onClick={() => onUpdate(row.id, draft)} disabled={loading}>
                  Guardar
                </button>
                <button className="ghost danger" onClick={() => onDelete(row.id)} disabled={loading}>
                  Borrar
                </button>
              </div>,
            ];
          })}
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
  onUpdate,
  onDelete,
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
  onUpdate: (id: string, form: DividendForm) => void;
  onDelete: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, DividendForm>>({});
  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, dividendFormFromRow(row)])));
  }, [rows]);
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
        <EditableTable
          columns={["Fecha", "Ticker", "Bruto", "Tax", "Neto", "Moneda", "Broker", "Nota", ""]}
          totalColumns={[{ index: 2, format: "money" }, { index: 3, format: "money" }, { index: 4, format: "money" }]}
          rows={rows.map((row) => {
            const draft = drafts[row.id] ?? dividendFormFromRow(row);
            const setDraft = (patch: Partial<DividendForm>) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, ...patch } }));
            return [
              <input type="date" value={draft.payDate} onChange={(event) => setDraft({ payDate: event.target.value })} />,
              <select value={draft.assetId} onChange={(event) => setDraft({ assetId: event.target.value })}>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {primarySymbols.get(asset.id) ?? asset.name} - {asset.name}
                  </option>
                ))}
              </select>,
              <input value={draft.grossAmount} onChange={(event) => setDraft({ grossAmount: event.target.value })} inputMode="decimal" />,
              <input value={draft.tax} onChange={(event) => setDraft({ tax: event.target.value })} inputMode="decimal" />,
              <input value={draft.netAmount} onChange={(event) => setDraft({ netAmount: event.target.value })} inputMode="decimal" />,
              <input value={draft.currency} onChange={(event) => setDraft({ currency: event.target.value.toUpperCase() })} />,
              <select value={draft.brokerId} onChange={(event) => setDraft({ brokerId: event.target.value })}>
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.name}
                  </option>
                ))}
              </select>,
              <input value={draft.sourceNote} onChange={(event) => setDraft({ sourceNote: event.target.value })} />,
              <div className="row-actions">
                <button onClick={() => onUpdate(row.id, draft)} disabled={loading}>
                  Guardar
                </button>
                <button className="ghost danger" onClick={() => onDelete(row.id)} disabled={loading}>
                  Borrar
                </button>
              </div>,
            ];
          })}
        />
      </section>
    </>
  );
}

function AssetsView({
  assets,
  allAssets,
  identifiers,
  assetTags,
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
  assetTags: AssetTag[];
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
          columns={["Activo", "Tipo", "Moneda", "ISIN", "Tags", "Identificadores"]}
          rows={assets.map((asset) => [
            asset.name,
            assetTypeLabel(asset.asset_type),
            asset.currency,
            asset.isin ?? "",
            assetTags
              .filter((tag) => tag.asset_id === asset.id)
              .map((tag) => tag.tag)
              .join(", "),
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
  assetTags,
  onChange,
  onSave,
  onToggleStrategicTag,
  saving,
}: {
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  etfs: Array<Record<string, string | number | null>>;
  assetTags: AssetTag[];
  onChange: (value: Array<Record<string, string | number | null>>) => void;
  onSave: () => void;
  onToggleStrategicTag: (assetId: string, enabled: boolean) => void;
  saving: boolean;
}) {
  const etfPositions = positions.filter((row) => row.asset_type === "etf");
  const total = etfPositions.reduce((acc, row) => acc + row.marketValue, 0);
  const bySymbol = new Map(etfPositions.map((row) => [row.symbol, row]));
  const strategicAssetIds = new Set(assetTags.filter((row) => row.tag === "myinvestor_resilient_etf").map((row) => row.asset_id));
  const strategicCount = etfPositions.filter((row) => strategicAssetIds.has(row.asset_id)).length;
  const changeEtf = (index: number, key: string, value: string) => {
    const next = etfs.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            [key]: key === "targetWeight" ? toNumber(value) / 100 : value,
          }
        : row
    );
    onChange(next);
  };
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Rebalanceo ETF</h2>
          <button onClick={onSave} disabled={saving}>
            {saving ? "Guardando" : "Guardar objetivos"}
          </button>
        </div>
        <div className="summary-grid compact">
          <Metric label="ETF abiertos" value={etfPositions.length} />
          <Metric label="Valor ETF" value={formatMoney(total)} />
          <Metric label="ETF cartera resistente" value={strategicCount} />
          <Metric label="Peso mayor ETF" value={formatPercent(total ? Math.max(...etfPositions.map((row) => row.marketValue)) / total : 0)} />
        </div>
        <AllocationPanel title="Peso actual ETF" rows={groupPositions(etfPositions, (row) => row.symbol)} />
      </section>
      <section className="panel">
        <h2>Objetivos ETF</h2>
        <EditableTable
          columns={["Ticker", "Nombre", "ISIN", "Proveedor", "Resistente", "Peso actual", "Peso objetivo %", "Diferencia", "EUR aprox."]}
          totalColumns={[{ index: 8, format: "money" }]}
          rows={etfs.map((row, index) => {
            const symbol = String(row.symbol ?? row.ticker ?? "");
            const position = bySymbol.get(symbol);
            const actualWeight = total ? Number(position?.marketValue ?? 0) / total : 0;
            const targetWeight = Number(row.targetWeight ?? 0);
            const delta = targetWeight - actualWeight;
            const isStrategic = position ? strategicAssetIds.has(position.asset_id) : false;
            return [
              <input value={symbol} onChange={(event) => changeEtf(index, "symbol", event.target.value.toUpperCase())} />,
              <input value={String(row.provider_name ?? row.name ?? "")} onChange={(event) => changeEtf(index, "provider_name", event.target.value)} />,
              <input value={String(row.isin ?? "")} onChange={(event) => changeEtf(index, "isin", event.target.value.toUpperCase())} />,
              <input value={String(row.provider ?? "")} onChange={(event) => changeEtf(index, "provider", event.target.value)} />,
              position ? (
                <input
                  aria-label="ETF cartera resistente"
                  checked={isStrategic}
                  onChange={(event) => onToggleStrategicTag(position.asset_id, event.target.checked)}
                  type="checkbox"
                />
              ) : (
                ""
              ),
              formatPercent(actualWeight),
              <input value={targetWeight ? String(Math.round(targetWeight * 10000) / 100) : ""} onChange={(event) => changeEtf(index, "targetWeight", event.target.value)} inputMode="decimal" />,
              <span className={delta >= 0 ? "good" : "bad"}>{formatPercent(delta)}</span>,
              <span className={delta >= 0 ? "good" : "bad"}>{formatMoney(delta * total)}</span>,
            ];
          })}
        />
      </section>
    </>
  );
}

function CashView({
  cash,
  year,
  setYear,
  onChange,
  onSave,
  saving,
}: {
  cash?: LegacyCash;
  year: string;
  setYear: (value: string) => void;
  onChange: (value: LegacyCash) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [section, setSection] = useState<CashSection>("month");
  const accounts = cash?.accounts ?? [];
  const plan = cash?.plan ?? [];
  const objectives = cash?.objectives ?? [];
  const allMonths = cash?.months ?? [];
  const months = allMonths.filter((month) => String(month.year) === year);
  const years = [...new Set((cash?.months ?? []).map((month) => String(month.year)))].sort();
  const latestMonth = latestMonthWithAccountValue(accounts) ?? months.at(-1)?.key ?? "";
  const [selectedMonth, setSelectedMonth] = useState(latestMonth || months.at(-1)?.key || "");
  const activeMonth = selectedMonth || latestMonth || months.at(-1)?.key || "";
  const cashTotal = accounts.reduce((acc, account) => acc + toNumber(account.values?.[activeMonth] ?? 0), 0);
  const plannedNet = plan.reduce((acc, row) => acc + toNumber(row.values?.[activeMonth] ?? 0), 0);
  const plannedIncome = plan.reduce((acc, row) => acc + Math.max(0, toNumber(row.values?.[activeMonth] ?? 0)), 0);
  const plannedExpenses = plan.reduce((acc, row) => acc + Math.min(0, toNumber(row.values?.[activeMonth] ?? 0)), 0);
  const applyCash = (mutator: (draft: LegacyCash) => void) => {
    const draft = cloneCash(cash);
    mutator(draft);
    onChange(draft);
  };
  const ensureYear = (targetYear: string) => applyCash((draft) => ensureCashYear(draft, Number(targetYear)));
  const ensureMonth = (month: string) => {
    if (!month) return;
    const targetYear = Number(month.slice(0, 4));
    setYear(String(targetYear));
    setSelectedMonth(month);
    applyCash((draft) => {
      ensureCashYear(draft, targetYear);
      draft.selectedYear = targetYear;
    });
  };
  const changeObjective = (index: number, key: string, value: string) =>
    applyCash((draft) => {
      const row = draft.objectives?.[index];
      if (!row) return;
      if (["target", "current", "simulationAdd"].includes(key)) {
        row[key as "target" | "current" | "simulationAdd"] = toNumber(value);
      } else {
        row[key as "name" | "targetDate"] = value;
      }
      row.simulationAdd = monthlyObjectiveAdd(row);
    });
  const changePlan = (index: number, month: string, value: string, comment?: string) =>
    applyCash((draft) => {
      const row = draft.plan?.[index];
      if (!row) return;
      row.values = row.values ?? {};
      row.comments = row.comments ?? {};
      if (comment != null) row.comments[month] = comment;
      else row.values[month] = toNumber(value);
    });
  const changeAccount = (index: number, month: string, value: string, comment?: string) =>
    applyCash((draft) => {
      const row = draft.accounts?.[index];
      if (!row) return;
      row.values = row.values ?? {};
      row.comments = row.comments ?? {};
      if (comment != null) row.comments[month] = comment;
      else row.values[month] = toNumber(value);
    });
  const addAccount = (monthlyOnly = true) =>
    applyCash((draft) => {
      draft.accounts = draft.accounts ?? [];
      draft.accounts.push({
        name: "nueva cuenta",
        values: monthlyOnly ? { [activeMonth]: 0 } : Object.fromEntries(months.map((month) => [month.key, 0])),
        comments: monthlyOnly ? { [activeMonth]: "" } : {},
      });
    });
  const addPlanLine = (monthlyOnly = true) =>
    applyCash((draft) => {
      draft.plan = draft.plan ?? [];
      draft.plan.push({
        name: "nuevo concepto",
        values: monthlyOnly ? { [activeMonth]: 0 } : Object.fromEntries(months.map((month) => [month.key, 0])),
        comments: monthlyOnly ? { [activeMonth]: "" } : {},
      });
    });
  const addObjective = () =>
    applyCash((draft) => {
      draft.objectives = draft.objectives ?? [];
      draft.objectives.push({ name: "nuevo objetivo", target: 0, current: 0, targetDate: `${year}-12`, simulationAdd: 0 });
    });
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Cash mensual</h2>
          <div className="toolbar">
            <input type="month" value={activeMonth} onChange={(event) => ensureMonth(event.target.value)} />
            <button
              onClick={() => {
                const nextYear = String(Number(year) + 1);
                setYear(nextYear);
                ensureYear(nextYear);
                setSelectedMonth(`${nextYear}-01`);
              }}
            >
              Anadir ano
            </button>
            <button onClick={onSave} disabled={saving}>
              {saving ? "Guardando" : "Guardar cash"}
            </button>
          </div>
        </div>
        <div className="summary-grid compact">
          <Metric label={`Saldo ${activeMonth || year}`} value={formatMoney(cashTotal)} />
          <Metric label="Flujo previsto" value={formatMoney(plannedNet)} tone={plannedNet >= 0 ? "good" : "bad"} />
          <Metric label="Ingresos previstos" value={formatMoney(plannedIncome)} />
          <Metric label="Gastos previstos" value={formatMoney(Math.abs(plannedExpenses))} />
        </div>
      </section>
      <SectionTabs
        tabs={[
          { id: "month", label: "Mes" },
          { id: "objectives", label: "Objetivos" },
          { id: "annualPlan", label: "Plan anual" },
          { id: "annualAccounts", label: "Cuentas anual" },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === "month" && (
      <section className="two-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Saldos del mes</h2>
            <button onClick={() => addAccount(true)}>Anadir cuenta</button>
          </div>
          <EditableTable
            columns={["Cuenta", "Saldo"]}
            totalColumns={[{ index: 1, format: "money" }]}
            rows={accounts.map((account, index) => [
              <input
                value={account.name}
                onChange={(event) =>
                  applyCash((draft) => {
                    if (draft.accounts?.[index]) draft.accounts[index].name = event.target.value;
                  })
                }
              />,
              <input value={formatInputNumber(account.values?.[activeMonth] ?? 0)} onChange={(event) => changeAccount(index, activeMonth, event.target.value)} inputMode="decimal" />,
            ])}
          />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2>Flujos previstos</h2>
            <button onClick={() => addPlanLine(true)}>Anadir linea</button>
          </div>
          <EditableTable
            columns={["Concepto", "Importe"]}
            totalColumns={[{ index: 1, format: "money" }]}
            rows={plan.map((row, index) => [
              <input
                value={row.name}
                onChange={(event) =>
                  applyCash((draft) => {
                    if (draft.plan?.[index]) draft.plan[index].name = event.target.value;
                  })
                }
              />,
              <input value={formatInputNumber(row.values?.[activeMonth] ?? 0)} onChange={(event) => changePlan(index, activeMonth, event.target.value)} inputMode="decimal" />,
            ])}
          />
        </div>
      </section>
      )}
      {section === "objectives" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Objetivos cash</h2>
          <button onClick={addObjective}>Anadir objetivo</button>
        </div>
        <EditableTable
          columns={["Objetivo", "Actual", "Meta", "Fecha", "Mensual", ""]}
          totalColumns={[{ index: 1, format: "money" }, { index: 2, format: "money" }, { index: 4, format: "money" }]}
          rows={objectives.map((row, index) => [
            <input value={row.name} onChange={(event) => changeObjective(index, "name", event.target.value)} />,
            <input value={formatInputNumber(row.current ?? 0)} onChange={(event) => changeObjective(index, "current", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(row.target ?? 0)} onChange={(event) => changeObjective(index, "target", event.target.value)} inputMode="decimal" />,
            <input value={row.targetDate ?? ""} onChange={(event) => changeObjective(index, "targetDate", event.target.value)} placeholder="YYYY-MM" />,
            formatMoney(monthlyObjectiveAdd(row)),
            <button
              className="ghost danger"
              onClick={() =>
                applyCash((draft) => {
                  draft.objectives = (draft.objectives ?? []).filter((_, rowIndex) => rowIndex !== index);
                })
              }
            >
              Borrar
            </button>,
          ])}
        />
      </section>
      )}
      {section === "annualPlan" && (
      <section className="panel">
        <div className="panel-header soft">
          <h2>Plan anual {year}</h2>
          <select
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              ensureYear(event.target.value);
            }}
          >
            {years.length === 0 && <option>{year}</option>}
            {years.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="summary-grid compact">
          <Metric label="Lineas plan" value={plan.length} />
          <Metric label="Flujo seleccionado" value={formatMoney(plannedNet)} tone={plannedNet >= 0 ? "good" : "bad"} />
          <Metric label="Ingresos seleccionados" value={formatMoney(plannedIncome)} />
          <Metric label="Gastos seleccionados" value={formatMoney(Math.abs(plannedExpenses))} />
        </div>
        <div className="panel-header">
          <h2>Costes e ingresos previstos</h2>
          <button onClick={() => addPlanLine(false)}>Anadir linea</button>
        </div>
        <div className="table-wrap">
          <table className="wide-table">
            <thead>
              <tr>
                <th>Concepto</th>
                {months.map((month) => (
                  <th key={month.key}>{month.label ?? month.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      value={row.name}
                      onChange={(event) =>
                        applyCash((draft) => {
                          if (draft.plan?.[index]) draft.plan[index].name = event.target.value;
                        })
                      }
                    />
                  </td>
                  {months.map((month) => (
                    <td key={month.key}>
                      <input value={formatInputNumber(row.values?.[month.key] ?? 0)} onChange={(event) => changePlan(index, month.key, event.target.value)} inputMode="decimal" />
                      <input
                        className="comment-input"
                        value={row.comments?.[month.key] ?? ""}
                        onChange={(event) => changePlan(index, month.key, "", event.target.value)}
                        placeholder="comentario"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {section === "annualAccounts" && (
      <section className="panel">
        <div className="panel-header soft">
          <h2>Cuentas anual {year}</h2>
          <select
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              ensureYear(event.target.value);
            }}
          >
            {years.length === 0 && <option>{year}</option>}
            {years.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="summary-grid compact">
          <Metric label="Cuentas" value={accounts.length} />
          <Metric label={`Saldo ${activeMonth || year}`} value={formatMoney(cashTotal)} />
          <Metric label="Objetivos" value={objectives.length} />
          <Metric label="Meses cargados" value={allMonths.length} />
        </div>
        <div className="panel-header">
          <h2>Cuentas bancarias y cash</h2>
          <button onClick={() => addAccount(false)}>Anadir cuenta</button>
        </div>
        <div className="table-wrap">
          <table className="wide-table">
            <thead>
              <tr>
                <th>Cuenta</th>
                {months.map((month) => (
                  <th key={month.key}>{month.label ?? month.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => (
                <tr key={index}>
                  <td>
                    <input
                      value={account.name}
                      onChange={(event) =>
                        applyCash((draft) => {
                          if (draft.accounts?.[index]) draft.accounts[index].name = event.target.value;
                        })
                      }
                    />
                  </td>
                  {months.map((month) => (
                    <td key={month.key}>
                      <input value={formatInputNumber(account.values?.[month.key] ?? 0)} onChange={(event) => changeAccount(index, month.key, event.target.value)} inputMode="decimal" />
                      <input
                        className="comment-input"
                        value={account.comments?.[month.key] ?? ""}
                        onChange={(event) => changeAccount(index, month.key, "", event.target.value)}
                        placeholder="comentario"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </>
  );
}

function PropertyView({
  property,
  wealthRows,
  onChange,
  onSave,
  saving,
}: {
  property: Array<Record<string, string | number | null>>;
  wealthRows: WealthRow[];
  onChange: (value: Array<Record<string, string | number | null>>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const rows = property.length > 0 ? property : propertyRowsFromWealth(wealthRows);
  const latest = rows.at(-1);
  const latestPropertyValue = propertyValue(latest);
  const latestMortgage = propertyMortgage(latest);
  const latestFamilyDebt = propertyFamilyDebt(latest);
  const latestEquity = propertyEquity(latest);
  const replaceRows = (nextRows: Array<Record<string, string | number | null>>) => onChange(nextRows.map(normalizePropertyRow));
  const updateRow = (index: number, key: string, value: string) => {
    replaceRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: key === "date" ? value : toNumber(value) } : row)));
  };
  const addRow = () => {
    const last = rows.at(-1);
    replaceRows([
      ...rows,
      normalizePropertyRow({
        date: new Date().toISOString().slice(0, 10),
        propertyValue: propertyValue(last),
        mortgage: propertyMortgage(last),
        familyDebt: propertyFamilyDebt(last),
      }),
    ]);
  };
  const deleteRow = (index: number) => replaceRows(rows.filter((_, rowIndex) => rowIndex !== index));
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Seguimiento piso</h2>
          <div className="toolbar">
            <button onClick={addRow}>Anadir linea</button>
            <button onClick={onSave} disabled={saving}>
              {saving ? "Guardando" : "Guardar piso"}
            </button>
          </div>
        </div>
        <div className="summary-grid compact">
          <Metric label="Valor piso actual" value={formatMoney(latestPropertyValue)} />
          <Metric label="Hipoteca actual" value={formatMoney(latestMortgage)} />
          <Metric label="Deuda familiar" value={formatMoney(latestFamilyDebt)} />
          <Metric label="Equity calculado" value={formatMoney(latestEquity)} />
        </div>
      </section>
      <section className="panel">
        <EditableTable
          columns={["Fecha", "Valor piso", "Hipoteca", "Deuda familiar", "Equity calculado", ""]}
          rows={rows.map((row, index) => [
            <input value={String(row.date ?? "")} onChange={(event) => updateRow(index, "date", event.target.value)} type="date" />,
            <input value={formatInputNumber(propertyValue(row))} onChange={(event) => updateRow(index, "propertyValue", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(propertyMortgage(row))} onChange={(event) => updateRow(index, "mortgage", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(propertyFamilyDebt(row))} onChange={(event) => updateRow(index, "familyDebt", event.target.value)} inputMode="decimal" />,
            formatMoney(propertyEquity(row)),
            <button className="ghost danger" onClick={() => deleteRow(index)}>
              Borrar
            </button>,
          ])}
        />
      </section>
    </>
  );
}

function WealthView({
  rows,
  summary,
  month,
  setMonth,
  positions,
  onChange,
  onSave,
  saving,
}: {
  rows: WealthRow[];
  summary: WealthRow[];
  month: string;
  setMonth: (value: string) => void;
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  onChange: (rows: WealthRow[], summary: WealthRow[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [section, setSection] = useState<WealthSection>("period");
  const months = [...new Set(rows.map((row) => monthKey(row.Fecha)).filter(Boolean))].sort();
  const selectedMonth = month || months.at(-1) || "";
  const monthRows = rows.filter((row) => monthKey(row.Fecha) === selectedMonth);
  const currentSummary = summary.find((row) => monthKey(row.Mes) === selectedMonth) ?? summary.at(-1);
  const selectedDate = selectedMonth ? monthEndDate(selectedMonth) : new Date().toISOString().slice(0, 10);
  const stockPositions = positions.filter((row) => row.asset_type === "stock");
  const stockCost = stockPositions.reduce((acc, row) => acc + row.costBasis, 0);
  const stockMarket = stockPositions.reduce((acc, row) => acc + row.marketValue, 0);
  const stockGain = stockMarket - stockCost;
  const actionsRow = monthRows.find((row) => String(row.Tipo ?? "").trim().toLowerCase() === "acciones");
  const actionsImputedCost = toNumber(actionsRow?.["Valor aportaciones"] ?? 0);
  const actionsImputedMarket = toNumber(actionsRow?.["Valor mercado"] ?? 0);
  const actionsMarketDelta = stockMarket - actionsImputedMarket;
  const updateRows = (nextRows: WealthRow[]) => onChange(nextRows, recomputeWealthSummary(nextRows));
  const updateMonthRow = (rowIndex: number, key: string, value: string) => {
    const absoluteIndex = rows.findIndex((row) => row === monthRows[rowIndex]);
    if (absoluteIndex < 0) return;
    const next = rows.map((row, index) =>
      index === absoluteIndex
        ? {
            ...row,
            [key]: isWealthNumericField(key) ? toNumber(value) : value,
          }
        : row
    );
    updateRows(next);
  };
  const addType = () => {
    const next = [
      ...rows,
      {
        Tipo: "Nuevo",
        "Liquido / No": "Si",
        Fecha: selectedMonth ? monthEndDate(selectedMonth) : new Date().toISOString().slice(0, 10),
        "Valor aportaciones": 0,
        "Valor mercado": 0,
        "Dividendos recibidos": 0,
        "Dividendos recibidos en el mes": 0,
        Rendimiento: 0,
      },
    ];
    updateRows(next);
  };
  const applySelectedDate = (nextMonth: string) => {
    setMonth(nextMonth);
    const nextDate = monthEndDate(nextMonth);
    const next = rows.map((row) =>
      monthKey(row.Fecha) === selectedMonth
        ? { ...row, Fecha: nextDate, Mes: Number(nextMonth.slice(5, 7)), "Año": Number(nextMonth.slice(0, 4)), Code: `${nextMonth.slice(5, 7)}/${nextMonth.slice(0, 4)}` }
        : row
    );
    updateRows(next);
  };
  const syncActionsFromDashboard = () => {
    const existingIndex = rows.findIndex((row) => monthKey(row.Fecha) === selectedMonth && String(row.Tipo ?? "").trim().toLowerCase() === "acciones");
    const row = {
      Tipo: "Acciones",
      "Liquido / No": "No",
      Fecha: selectedDate,
      Mes: Number(selectedMonth.slice(5, 7)),
      "Año": Number(selectedMonth.slice(0, 4)),
      Code: `${selectedMonth.slice(5, 7)}/${selectedMonth.slice(0, 4)}`,
      "Valor aportaciones": stockCost,
      "Valor mercado": stockMarket,
      "Dividendos recibidos": 0,
      "Dividendos recibidos en el mes": 0,
      Rendimiento: stockCost ? stockMarket / stockCost - 1 : 0,
    };
    updateRows(existingIndex >= 0 ? rows.map((item, index) => (index === existingIndex ? { ...item, ...row } : item)) : [...rows, row]);
  };
  const copyPreviousMonth = () => {
    const previousMonth = months.filter((item) => item < selectedMonth).at(-1);
    const sourceRows = rows.filter((row) => monthKey(row.Fecha) === previousMonth);
    if (!selectedMonth || sourceRows.length === 0) return;
    const existingTypes = new Set(monthRows.map((row) => String(row.Tipo ?? "")));
    const copies = sourceRows
      .filter((row) => !existingTypes.has(String(row.Tipo ?? "")))
      .map((row) => ({ ...row, Fecha: monthEndDate(selectedMonth), Mes: Number(selectedMonth.slice(5, 7)), "Año": Number(selectedMonth.slice(0, 4)), Code: `${selectedMonth.slice(5, 7)}/${selectedMonth.slice(0, 4)}` }));
    updateRows([...rows, ...copies]);
  };
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Patrimonio mensual</h2>
          <div className="toolbar">
            <input type="month" value={selectedMonth} onChange={(event) => applySelectedDate(event.target.value)} />
            <button onClick={copyPreviousMonth}>Copiar mes anterior</button>
            <button onClick={syncActionsFromDashboard}>Actualizar acciones desde dashboard</button>
            <button onClick={addType}>Anadir tipo</button>
            <button onClick={onSave} disabled={saving}>
              {saving ? "Guardando" : "Guardar patrimonio"}
            </button>
          </div>
        </div>
        <div className="summary-grid compact">
          <Metric label="Valor mercado periodo" value={formatMoney(toNumber(currentSummary?.["Total valor mercado"] ?? 0))} />
          <Metric label="Aportaciones periodo" value={formatMoney(toNumber(currentSummary?.["total aportaciones"] ?? 0))} />
          <Metric label="Acciones calculadas" value={formatMoney(stockMarket)} />
          <Metric label="Diferencia acciones" value={formatMoney(actionsMarketDelta)} tone={Math.abs(actionsMarketDelta) < 1 ? "good" : "bad"} />
        </div>
      </section>
      <SectionTabs
        tabs={[
          { id: "period", label: "Periodo" },
          { id: "chart", label: "Evolucion" },
          { id: "history", label: "Historico" },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === "chart" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Evolucion patrimonio</h2>
          <span className="muted-inline">{summary.length} periodos</span>
        </div>
        <LineChart rows={summary} metric="Total valor mercado" />
      </section>
      )}
      {section === "period" && (
      <>
      <section className="panel">
        <div className="panel-header">
          <h2>Conciliacion de acciones</h2>
          <button onClick={syncActionsFromDashboard}>Usar calculo en patrimonio</button>
        </div>
        <div className="summary-grid compact">
          <Metric label="Coste dashboard" value={formatMoney(stockCost)} />
          <Metric label="Mercado dashboard" value={formatMoney(stockMarket)} />
          <Metric label="Mercado imputado" value={formatMoney(actionsImputedMarket)} />
          <Metric label="Diferencia" value={formatMoney(actionsMarketDelta)} tone={Math.abs(actionsMarketDelta) < 1 ? "good" : "bad"} />
        </div>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Coste", "Mercado", "P&G"]}
          totalColumns={[{ index: 3, format: "money" }, { index: 4, format: "money" }, { index: 5, format: "money" }]}
          rows={stockPositions.map((row) => [
            row.symbol,
            row.name,
            row.broker,
            formatMoney(row.costBasis),
            formatMoney(row.marketValue),
            <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          ])}
        />
        <p className="muted">
          Acciones imputadas en patrimonio: coste {formatMoney(actionsImputedCost)}, mercado {formatMoney(actionsImputedMarket)}. El boton actualiza o crea la fila "Acciones" del periodo seleccionado.
        </p>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Detalle imputado en {selectedMonth}</h2>
          <span className="muted-inline">Fecha comun: {selectedDate} - {monthRows.length} filas</span>
        </div>
        <EditableTable
          columns={["Tipo", "Liquido", "Aportaciones", "Mercado", "Dividendos", "Rendimiento"]}
          totalColumns={[{ index: 2, format: "money" }, { index: 3, format: "money" }, { index: 4, format: "money" }]}
          rows={monthRows.map((row, index) => [
            <input value={String(row.Tipo ?? "")} onChange={(event) => updateMonthRow(index, "Tipo", event.target.value)} />,
            <input value={String(row["Liquido / No"] ?? "")} onChange={(event) => updateMonthRow(index, "Liquido / No", event.target.value)} />,
            <input value={formatInputNumber(row["Valor aportaciones"] ?? 0)} onChange={(event) => updateMonthRow(index, "Valor aportaciones", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(row["Valor mercado"] ?? 0)} onChange={(event) => updateMonthRow(index, "Valor mercado", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(row["Dividendos recibidos"] ?? 0)} onChange={(event) => updateMonthRow(index, "Dividendos recibidos", event.target.value)} inputMode="decimal" />,
            <input value={formatInputNumber(row.Rendimiento ?? 0)} onChange={(event) => updateMonthRow(index, "Rendimiento", event.target.value)} inputMode="decimal" />,
          ])}
        />
      </section>
      </>
      )}
      {section === "history" && (
      <section className="panel">
        <h2>Historico completo importado</h2>
        <SimpleTable
          columns={["Mes", "Aportaciones", "Valor mercado", "Rendimiento", "Dividendos", "Incremento mensual"]}
          rows={summary.map((row) => [
            row.Mes ?? row.Code ?? "",
            formatMoney(toNumber(row["total aportaciones"] ?? 0)),
            formatMoney(toNumber(row["Total valor mercado"] ?? 0)),
            formatPercent(toNumber(row.Rendimiento ?? 0)),
            formatMoney(toNumber(row["Dividendos recibidos"] ?? 0)),
            formatMoney(toNumber(row["incremento mensual"] ?? 0)),
          ])}
        />
      </section>
      )}
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
  const groupAnalysis = reports.filter((report) => report.report_type === "portfolio_group_analysis");
  const etfAnalysis = reports.filter((report) => report.report_type === "etf_resilient_portfolio");
  const latest = reports[0];
  return (
    <>
      <section className="panel">
        <h2>Informes y ponderacion</h2>
        <div className="summary-grid compact">
          <Metric label="Por grupo" value={groupAnalysis.length} />
          <Metric label="ETF resistente" value={etfAnalysis.length} />
          <Metric label="Periodicos legacy" value={periodic.length} />
          <Metric label="Ponderacion" value={rebalance.length} />
        </div>
        <div className="summary-grid compact">
          <Metric label="Ultimo modelo" value={latest?.model ?? ""} />
          <Metric label="Ultima fecha" value={latest ? new Date(latest.created_at).toLocaleDateString("es-ES") : ""} />
          <Metric label="Busquedas" value="Brave" />
          <Metric label="Razonamiento" value="OpenAI" />
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
                    {reportTypeLabel(report.report_type)} - {new Date(report.created_at).toLocaleString("es-ES")}
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

function reportTypeLabel(type: ResearchReport["report_type"]) {
  const labels: Record<ResearchReport["report_type"], string> = {
    portfolio_periodic: "Informe periodico",
    rebalance_opportunity: "Ponderacion",
    portfolio_group_analysis: "Analisis por grupo",
    etf_resilient_portfolio: "ETF resistente",
  };
  return labels[type];
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

function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav className="section-tabs" aria-label="Secciones">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function SimpleTable({
  columns,
  rows,
  totalColumns = [],
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  totalColumns?: TotalColumn[];
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        columns.every((_, index) => {
          const query = (filters[index] ?? "").trim().toLowerCase();
          return !query || cellText(row[index]).toLowerCase().includes(query);
        })
      ),
    [rows, columns, filters]
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
          <tr className="filter-row">
            {columns.map((column, index) => (
              <th key={`${column}-filter`}>
                <input
                  value={filters[index] ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, [index]: event.target.value }))}
                  placeholder="filtrar"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                Sin datos.
              </td>
            </tr>
          ) : (
            filteredRows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totalColumns.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-total`}>{index === 0 ? "Subtotal filtrado" : formatTableTotal(filteredRows, totalColumns, index)}</th>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function EditableTable({
  columns,
  rows,
  totalColumns = [],
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  totalColumns?: TotalColumn[];
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        columns.every((_, index) => {
          const query = (filters[index] ?? "").trim().toLowerCase();
          return !query || cellText(row[index]).toLowerCase().includes(query);
        })
      ),
    [rows, columns, filters]
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
          <tr className="filter-row">
            {columns.map((column, index) => (
              <th key={`${column}-filter`}>
                <input
                  value={filters[index] ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, [index]: event.target.value }))}
                  placeholder="filtrar"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                Sin datos.
              </td>
            </tr>
          ) : (
            filteredRows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totalColumns.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((column, index) => (
                <th key={`${column}-total`}>{index === 0 ? "Subtotal filtrado" : formatTableTotal(filteredRows, totalColumns, index)}</th>
              ))}
            </tr>
          </tfoot>
        )}
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
    .map((row) => ({ date: String(row.Mes ?? ""), value: toNumber(row[metric] ?? 0) }))
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

function transactionFormFromRow(row: Transaction): TransactionForm {
  return {
    assetId: row.asset_id,
    brokerId: row.broker_id,
    type: row.type,
    tradeDate: row.trade_date,
    quantity: formatInputNumber(Math.abs(toNumber(row.quantity ?? 0))),
    grossAmount: formatInputNumber(row.gross_amount),
    fees: formatInputNumber(row.fees),
    tax: formatInputNumber(row.tax),
    currency: row.currency,
    sourceNote: noteFromRaw(row.raw_payload),
  };
}

function dividendFormFromRow(row: Dividend): DividendForm {
  return {
    assetId: row.asset_id,
    brokerId: row.broker_id,
    payDate: row.pay_date,
    netAmount: formatInputNumber(row.net_amount),
    grossAmount: formatInputNumber(row.gross_amount),
    tax: formatInputNumber(row.tax),
    currency: row.currency,
    sourceNote: noteFromRaw(row.raw_payload),
  };
}

function noteFromRaw(raw: Record<string, unknown> | null | undefined) {
  return String(raw?.note ?? "");
}

function friendlySupabaseError(message: string) {
  if (message.toLowerCase().includes("jwt issued at future")) {
    return "La sesion de Supabase tiene una hora invalida. Pulsa Salir, entra de nuevo y revisa que la hora del PC este sincronizada si vuelve a pasar.";
  }
  return message;
}

function sumColumn(rows: Array<Array<React.ReactNode>>, index: number) {
  return rows.reduce((acc, row) => acc + numericCellValue(row[index]), 0);
}

function formatTableTotal(rows: Array<Array<React.ReactNode>>, totalColumns: TotalColumn[], index: number) {
  const config = totalColumns.map((column) => (typeof column === "number" ? { index: column, format: "money" as const } : column)).find((column) => column.index === index);
  if (!config) return "";
  const value = sumColumn(rows, index);
  if (config.format === "number") return formatNumber(value);
  if (config.format === "percent") return formatPercent(value);
  return formatMoney(value);
}

function numericCellValue(value: React.ReactNode): number {
  return parseLocaleNumber(cellText(value));
}

function cloneCash(cash?: LegacyCash): LegacyCash {
  return {
    accounts: (cash?.accounts ?? []).map((row) => ({ ...row, values: { ...(row.values ?? {}) }, comments: { ...(row.comments ?? {}) } })),
    objectives: (cash?.objectives ?? []).map((row) => ({ ...row })),
    plan: (cash?.plan ?? []).map((row) => ({ ...row, values: { ...(row.values ?? {}) }, comments: { ...(row.comments ?? {}) } })),
    months: (cash?.months ?? []).map((row) => ({ ...row })),
    selectedYear: cash?.selectedYear ?? new Date().getFullYear(),
  };
}

function ensureCashYear(cash: LegacyCash, year: number) {
  const labels = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  cash.months = cash.months ?? [];
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (!cash.months.some((row) => row.key === key)) {
      cash.months.push({ key, label: labels[month - 1], year });
    }
  }
  cash.months.sort((a, b) => a.key.localeCompare(b.key));
  for (const row of cash.plan ?? []) {
    row.values = row.values ?? {};
    row.comments = row.comments ?? {};
    for (const month of cash.months.filter((item) => item.year === year)) row.values[month.key] = row.values[month.key] ?? 0;
  }
  for (const row of cash.accounts ?? []) {
    row.values = row.values ?? {};
    row.comments = row.comments ?? {};
    for (const month of cash.months.filter((item) => item.year === year)) row.values[month.key] = row.values[month.key] ?? 0;
  }
  cash.selectedYear = year;
}

function monthlyObjectiveAdd(row: NonNullable<LegacyCash["objectives"]>[number]) {
  const target = toNumber(row.target) || 0;
  const current = toNumber(row.current) || 0;
  const remaining = Math.max(0, target - current);
  const targetDate = String(row.targetDate ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(targetDate)) return toNumber(row.simulationAdd) || remaining;
  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth() + 1;
  const [targetYear, targetMonth] = targetDate.split("-").map(Number);
  const months = Math.max(1, (targetYear - startYear) * 12 + (targetMonth - startMonth) + 1);
  return remaining / months;
}

function monthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}

function isWealthNumericField(key: string) {
  return [
    "Valor aportaciones",
    "Valor mercado",
    "Dividendos recibidos",
    "Cantidad dividendo",
    "Yield on cost",
    "Yield",
    "Rendimiento",
    "Dividendos recibidos en el mes",
    "Mes",
    "Año",
  ].includes(key);
}

function recomputeWealthSummary(rows: WealthRow[]) {
  const months = [...new Set(rows.map((row) => monthKey(row.Fecha)).filter(Boolean))].sort();
  return months.map((month, index) => {
    const monthRows = rows.filter((row) => monthKey(row.Fecha) === month);
    const aportaciones = monthRows.reduce((acc, row) => acc + toNumber(row["Valor aportaciones"] ?? 0), 0);
    const mercado = monthRows.reduce((acc, row) => acc + toNumber(row["Valor mercado"] ?? 0), 0);
    const dividendos = monthRows.reduce((acc, row) => acc + toNumber(row["Dividendos recibidos en el mes"] ?? 0), 0);
    const previous = index > 0 ? rows.filter((row) => monthKey(row.Fecha) === months[index - 1]).reduce((acc, row) => acc + toNumber(row["Valor mercado"] ?? 0), 0) : null;
    return {
      Code: Number(`${month.slice(5, 7)}${month.slice(0, 4)}`),
      Mes: monthEndDate(month),
      "total aportaciones": aportaciones,
      "Total valor mercado": mercado,
      Rendimiento: aportaciones ? mercado / aportaciones - 1 : 0,
      "incremento mensual": previous == null ? null : mercado - previous,
      "Dividendos recibidos": dividendos,
      "RTO total": aportaciones ? (mercado + dividendos) / aportaciones - 1 : 0,
    };
  });
}

function propertyRowsFromWealth(rows: WealthRow[]) {
  return rows
    .filter((row) => String(row.Tipo ?? "").trim().toLowerCase() === "piso")
    .map((row) =>
      normalizePropertyRow({
        date: row.Fecha ?? row.Mes ?? "",
        propertyValue: row["Valor mercado"] ?? 0,
        mortgage: row["Valor aportaciones"] ?? 0,
        familyDebt: row["Deuda familiar"] ?? 0,
      })
    );
}

function normalizePropertyRow(row: Record<string, string | number | null>) {
  const normalized = {
    date: String(row.date ?? row.Fecha ?? row.Mes ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
    propertyValue: propertyValue(row),
    mortgage: propertyMortgage(row),
    familyDebt: propertyFamilyDebt(row),
  };
  return {
    ...normalized,
    equity: normalized.propertyValue - normalized.mortgage - normalized.familyDebt,
  };
}

function propertyValue(row: Record<string, string | number | null> | undefined) {
  return toNumber(row?.propertyValue ?? row?.["Valor piso"] ?? row?.["Valor mercado"] ?? 0);
}

function propertyMortgage(row: Record<string, string | number | null> | undefined) {
  return toNumber(row?.mortgage ?? row?.Hipoteca ?? row?.["Valor aportaciones"] ?? 0);
}

function propertyFamilyDebt(row: Record<string, string | number | null> | undefined) {
  return toNumber(row?.familyDebt ?? row?.["Deuda familiar"] ?? 0);
}

function propertyEquity(row: Record<string, string | number | null> | undefined) {
  return propertyValue(row) - propertyMortgage(row) - propertyFamilyDebt(row);
}

function cellText(value: React.ReactNode): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cellText).join(" ");
  if (typeof value === "object" && "props" in value) {
    const props = value.props as { children?: React.ReactNode; value?: string | number };
    return String(props.value ?? cellText(props.children));
  }
  return "";
}

function latestMonthWithAccountValue(accounts: NonNullable<LegacyCash["accounts"]>) {
  return [...new Set(accounts.flatMap((account) => Object.keys(account.values ?? {})))]
    .sort()
    .reverse()
    .find((month) => accounts.some((account) => toNumber(account.values?.[month] ?? 0) !== 0));
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
  return parseLocaleNumber(value);
}

function formatInputNumber(value: string | number | null | undefined) {
  const number = toNumber(value);
  return Number.isFinite(number) ? number.toLocaleString("es-ES", { maximumFractionDigits: 6 }) : "";
}

function parseLocaleNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/%/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = raw.length - lastComma - 1;
    normalized = decimals === 3 && raw.slice(0, lastComma).length > 0 ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (lastDot >= 0) {
    const decimals = raw.length - lastDot - 1;
    normalized = decimals === 3 && raw.slice(0, lastDot).length > 0 ? raw.replace(/\./g, "") : raw;
  }
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatNumber(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("es-ES", { maximumFractionDigits: 6 });
}

function formatPercent(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("es-ES", { style: "percent", maximumFractionDigits: 2 });
}

function formatMoney(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function formatPlainMoney(value: string | number | null | undefined, currency: string) {
  return toNumber(value).toLocaleString("es-ES", { style: "currency", currency: normalizeCurrency(currency) });
}

function normalizeCurrency(currency: string | null | undefined) {
  const value = String(currency ?? "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "EUR";
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

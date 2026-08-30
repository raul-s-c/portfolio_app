import { FormEvent, useEffect, useMemo, useState } from "react";
import { Root, createRoot } from "react-dom/client";
import { Session, SupabaseClient, createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api").replace(/\/$/, "");
const supabase = window.__portfolioSupabase ?? createClient(supabaseUrl, supabaseAnonKey);
window.__portfolioSupabase = supabase;

type TabId =
  | "dashboard"
  | "positions"
  | "transactions"
  | "dividends"
  | "dividendCalendar"
  | "virtualPortfolios"
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
  to_eur: number | null;
  priced_at: string | null;
  total_purchases?: number | null;
  total_sale_proceeds?: number | null;
  realized_gain?: number | null;
};

type PortfolioReconciliation = {
  total_purchases_eur: number;
  total_sale_proceeds_eur: number;
  realized_gain_eur: number;
  open_cost_basis_eur: number;
  reconciliation_difference_eur: number;
  open_positions: number;
  asset_broker_ledgers: number;
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

type DividendCalendarEvent = {
  id: string;
  asset_id: string;
  broker_id: string;
  symbol: string | null;
  asset_name: string | null;
  asset_type: "stock" | "etf";
  broker: string | null;
  quantity: number;
  declaration_date: string | null;
  ex_date: string | null;
  record_date: string | null;
  payment_date: string | null;
  dividend_amount: number;
  currency: string;
  expected_gross_amount: number;
  status: string;
  confidence: number;
  source_url: string | null;
  source_title: string | null;
  notes: string | null;
  updated_at: string;
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

type PortfolioStrategy = {
  id: string;
  name: string;
  objective: string | null;
  target_return_min: number | null;
  target_return_max: number | null;
  target_income_spread_over_inflation: number | null;
};

type VirtualPortfolio = {
  id: string;
  name: string;
  strategy_id: string | null;
  base_currency: string;
  notes: string | null;
};

type VirtualPortfolioAssignment = {
  id: string;
  virtual_portfolio_id: string;
  asset_id: string;
  broker_id: string;
  target_weight: number | null;
  notes: string | null;
};

type PriceRefreshIssue = {
  asset_id: string;
  name?: string;
  asset_type?: string;
  stage?: "current" | "history";
  symbols?: string[];
  error: string;
};

type EnrichedDividend = Dividend & { asset?: Asset; broker?: Broker };

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
type DashboardSection = "executive" | "allocation" | "positions" | "etf";
type DividendSection = "analysis" | "evolution" | "assets" | "edit";
type WealthSection = "period" | "chart" | "history";
type DividendAggregate = { name: string; gross: number; tax: number; net: number; count: number; weight: number };
type CalendarAggregate = { name: string; currency: string; expected: number; count: number; averageConfidence: number; weight: number };
type ReportType = ResearchReport["report_type"];

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "positions", label: "Posiciones" },
  { id: "transactions", label: "Movimientos" },
  { id: "dividends", label: "Dividendos" },
  { id: "dividendCalendar", label: "Calendario dividendos" },
  { id: "virtualPortfolios", label: "Carteras" },
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

type NavGroupId = "overview" | "portfolio" | "income" | "activity" | "planning" | "reports";

const NAV_GROUPS: Array<{ id: NavGroupId; label: string; defaultTab: TabId; tabs: TabId[] }> = [
  { id: "overview", label: "Overview", defaultTab: "dashboard", tabs: ["dashboard"] },
  { id: "portfolio", label: "Portfolio", defaultTab: "positions", tabs: ["positions", "virtualPortfolios", "assets", "etf"] },
  { id: "income", label: "Income", defaultTab: "dividends", tabs: ["dividends", "dividendCalendar"] },
  { id: "activity", label: "Activity", defaultTab: "transactions", tabs: ["transactions", "queue", "importer"] },
  { id: "planning", label: "Planning", defaultTab: "cash", tabs: ["cash", "property", "wealth", "snapshots"] },
  { id: "reports", label: "Reports", defaultTab: "reports", tabs: ["reports", "backup"] },
];

const tabLabelById = new Map(TABS.map((tab) => [tab.id, tab.label]));

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
  const [portfolioReconciliation, setPortfolioReconciliation] = useState<PortfolioReconciliation | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [assetTags, setAssetTags] = useState<AssetTag[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [dividendCalendar, setDividendCalendar] = useState<DividendCalendarEvent[]>([]);
  const [priceSnapshots, setPriceSnapshots] = useState<PriceSnapshot[]>([]);
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [queue, setQueue] = useState<ResolutionQueueItem[]>([]);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [strategies, setStrategies] = useState<PortfolioStrategy[]>([]);
  const [virtualPortfolios, setVirtualPortfolios] = useState<VirtualPortfolio[]>([]);
  const [virtualAssignments, setVirtualAssignments] = useState<VirtualPortfolioAssignment[]>([]);
  const [legacyAppState, setLegacyAppState] = useState<LegacyAppState | null>(null);
  const [legacyStateMissing, setLegacyStateMissing] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetForm>(DEFAULT_ASSET_FORM);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(DEFAULT_TRANSACTION_FORM);
  const [dividendForm, setDividendForm] = useState<DividendForm>(DEFAULT_DIVIDEND_FORM);
  const [loading, setLoading] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [refreshingDividendCalendar, setRefreshingDividendCalendar] = useState(false);
  const [generatingReportType, setGeneratingReportType] = useState<ReportType | "">("");
  const [refreshingPriceHistory, setRefreshingPriceHistory] = useState(false);
  const [priceRefreshIssues, setPriceRefreshIssues] = useState<PriceRefreshIssue[]>([]);
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
    setPortfolioReconciliation(null);
    setAssets([]);
    setIdentifiers([]);
    setAssetTags([]);
    setBrokers([]);
    setTransactions([]);
    setDividends([]);
    setDividendCalendar([]);
    setPriceSnapshots([]);
    setPortfolioSnapshots([]);
    setPriceRefreshIssues([]);
    setQueue([]);
    setReports([]);
    setStrategies([]);
    setVirtualPortfolios([]);
    setVirtualAssignments([]);
    setLegacyAppState(null);
  }

  async function loadDashboardData() {
    if (!session) return;
    setLoading(true);
    const [
      positionsResult,
      reconciliationResult,
      assetsResult,
      identifiersResult,
      assetTagsResult,
      brokersResult,
      transactionsResult,
      dividendsResult,
      dividendCalendarResult,
      priceSnapshotsResult,
      portfolioSnapshotsResult,
      queueResult,
      appStateResult,
      reportsResult,
      strategiesResult,
      virtualPortfoliosResult,
      virtualAssignmentsResult,
    ] = await Promise.all([
      supabase.from("v_open_positions").select("*").order("name"),
      supabase.from("v_portfolio_reconciliation").select("*").maybeSingle(),
      supabase.from("assets").select("id,asset_type,name,isin,currency").order("name"),
      supabase.from("asset_identifiers").select("asset_id,provider,symbol,exchange,is_primary").order("symbol"),
      supabase.from("asset_tags").select("asset_id,tag,notes").order("tag"),
      supabase.from("brokers").select("id,name").order("name"),
      loadAllRows<Transaction>("transactions", "trade_date"),
      loadAllRows<Dividend>("dividends", "pay_date"),
      supabase
        .from("dividend_calendar_events")
        .select("*")
        .order("payment_date", { ascending: true, nullsFirst: false })
        .limit(250),
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
      supabase
        .from("portfolio_strategies")
        .select("id,name,objective,target_return_min,target_return_max,target_income_spread_over_inflation")
        .order("name"),
      supabase.from("virtual_portfolios").select("id,name,strategy_id,base_currency,notes").order("name"),
      supabase
        .from("virtual_portfolio_assignments")
        .select("id,virtual_portfolio_id,asset_id,broker_id,target_weight,notes")
        .order("created_at", { ascending: false }),
    ]);

    const coreError =
      positionsResult.error ||
      reconciliationResult.error ||
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
      setPortfolioReconciliation((reconciliationResult.data ?? null) as PortfolioReconciliation | null);
      setAssets((assetsResult.data ?? []) as Asset[]);
      setIdentifiers((identifiersResult.data ?? []) as Identifier[]);
      setAssetTags(assetTagsResult.error ? [] : ((assetTagsResult.data ?? []) as AssetTag[]));
      setBrokers((brokersResult.data ?? []) as Broker[]);
      setTransactions((transactionsResult.data ?? []) as Transaction[]);
      setDividends((dividendsResult.data ?? []) as Dividend[]);
      setDividendCalendar(dividendCalendarResult.error ? [] : ((dividendCalendarResult.data ?? []) as DividendCalendarEvent[]));
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
    setStrategies(strategiesResult.error ? [] : ((strategiesResult.data ?? []) as PortfolioStrategy[]));
    setVirtualPortfolios(virtualPortfoliosResult.error ? [] : ((virtualPortfoliosResult.data ?? []) as VirtualPortfolio[]));
    setVirtualAssignments(virtualAssignmentsResult.error ? [] : ((virtualAssignmentsResult.data ?? []) as VirtualPortfolioAssignment[]));
    setLoading(false);
  }

  async function refreshDividendCalendar() {
    if (!session) {
      setMessage("Entra con tu email antes de actualizar el calendario.");
      return;
    }
    setRefreshingDividendCalendar(true);
    setMessage("Actualizando calendario de dividendos con Brave + OpenAI...");
    try {
      const response = await fetch(`${apiBaseUrl}/dividend-calendar/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          max_positions: 120,
          max_web_results: 8,
          focus:
            "prioriza fuentes oficiales, issuer ETF page, justETF, dividend announcements, declared distributions and payment date",
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await response.json();
      await loadDashboardData();
      setMessage(`Calendario actualizado: ${result.events ?? 0} eventos para ${result.positions ?? 0} posiciones.`);
    } catch (error) {
      setMessage(
        `No he podido actualizar el calendario. Comprueba que el backend esta disponible en ${apiBaseUrl}. ${
          error instanceof Error ? error.message : ""
        }`
      );
    } finally {
      setRefreshingDividendCalendar(false);
    }
  }

  async function generateReport(reportType: ReportType) {
    if (!session) {
      setMessage("Entra con tu email antes de generar informes.");
      return;
    }
    setGeneratingReportType(reportType);
    setMessage("Generando informe con Brave + OpenAI...");
    try {
      const response = await fetch(`${apiBaseUrl}/reports/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ report_type: reportType }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await response.json();
      await loadDashboardData();
      setMessage(`Informe generado: ${result.title ?? reportType}.`);
      setActiveTab("reports");
    } catch (error) {
      setMessage(`No he podido generar el informe. ${error instanceof Error ? error.message : ""}`);
    } finally {
      setGeneratingReportType("");
    }
  }

  async function refreshPriceHistory() {
    if (!session) {
      setMessage("Entra con tu email antes de actualizar historicos.");
      return;
    }
    setRefreshingPriceHistory(true);
    setMessage("Actualizando precios e historico desde backend remoto...");
    try {
      const response = await fetch(`${apiBaseUrl}/prices/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ years: 5, max_assets: 250 }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const result = await readJsonResponse(response);
      await loadDashboardData();
      const issues = Array.isArray(result.errors) ? (result.errors as PriceRefreshIssue[]) : [];
      setPriceRefreshIssues(issues);
      const issueAssets = [...new Set(issues.map((issue) => issue.name || issue.asset_id))];
      setMessage(
        `Precios actualizados: ${result.current_rows ?? 0} actuales y ${result.rows ?? 0} historicos para ${result.assets ?? 0} activos${issues.length ? `. Incidencias: ${issueAssets.join(", ")}` : ". Sin incidencias"}`
      );
    } catch (error) {
      setMessage(`No he podido actualizar historicos. ${error instanceof Error ? error.message : ""}`);
    } finally {
      setRefreshingPriceHistory(false);
    }
  }

  async function createVirtualPortfolio(name: string, strategyId: string) {
    if (!session) {
      setMessage("Entra con tu email antes de guardar carteras.");
      return;
    }
    const cleanName = name.trim();
    if (!cleanName) {
      setMessage("Pon un nombre a la cartera virtual.");
      return;
    }
    const { error } = await supabase.from("virtual_portfolios").insert({
      name: cleanName,
      strategy_id: strategyId || null,
      base_currency: "EUR",
      notes: "Cartera virtual creada desde la app.",
    });
    if (error) {
      setMessage(friendlySupabaseError(error.message));
      return;
    }
    setMessage("Cartera virtual creada.");
    await loadDashboardData();
  }

  async function saveVirtualAssignment(assetId: string, brokerId: string, virtualPortfolioId: string, targetWeight: string, notes: string) {
    if (!session) {
      setMessage("Entra con tu email antes de asignar activos.");
      return;
    }
    if (!virtualPortfolioId) {
      const { error } = await supabase.from("virtual_portfolio_assignments").delete().eq("asset_id", assetId).eq("broker_id", brokerId);
      if (error) {
        setMessage(friendlySupabaseError(error.message));
        return;
      }
      setMessage("Asignacion eliminada.");
      await loadDashboardData();
      return;
    }
    const { error } = await supabase.from("virtual_portfolio_assignments").upsert(
      {
        asset_id: assetId,
        broker_id: brokerId,
        virtual_portfolio_id: virtualPortfolioId,
        target_weight: targetWeight.trim() ? parseLocaleNumber(targetWeight) / 100 : null,
        notes: notes.trim() || null,
      },
      { onConflict: "asset_id,broker_id" }
    );
    if (error) {
      setMessage(friendlySupabaseError(error.message));
      return;
    }
    setMessage("Asignacion guardada.");
    await loadDashboardData();
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

  async function saveManualPrice(assetId: string, price: string, currency: string, pricedOn: string) {
    if (!session) {
      setMessage("Entra con tu email antes de guardar un valor.");
      return false;
    }
    const numericPrice = parseLocaleNumber(price);
    if (!assetId || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setMessage("Selecciona un activo e introduce un valor mayor que cero.");
      return false;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/prices/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ asset_id: assetId, price: numericPrice, currency, priced_on: pricedOn }),
      });
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      await loadDashboardData();
      setMessage("Valor liquidativo guardado y anadido al historico.");
      return true;
    } catch (error) {
      setMessage(`No he podido guardar el valor. ${error instanceof Error ? error.message : ""}`);
      return false;
    }
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
      gross_amount: signedNumber(transactionForm.grossAmount, transactionForm.type),
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
        gross_amount: signedNumber(form.grossAmount, form.type),
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

  async function updateQueueItem(id: string, patch: Partial<ResolutionQueueItem>) {
    if (!session) {
      setMessage("Entra con tu email antes de editar pendientes.");
      return;
    }
    const { error } = await supabase
      .from("asset_resolution_queue")
      .update({
        raw_name: patch.raw_name ?? null,
        symbol: patch.symbol ? cleanSymbol(patch.symbol) : null,
        isin: patch.isin?.trim().toUpperCase() || null,
        broker: patch.broker?.trim() || null,
        status: patch.status ?? "pending",
        notes: patch.notes?.trim() || null,
      })
      .eq("id", id);
    if (error) {
      setMessage(friendlySupabaseError(error.message));
      return;
    }
    setMessage("Pendiente actualizado.");
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

  const enrichedDividends = useMemo<EnrichedDividend[]>(
    () =>
      dividends.map((row) => ({
        ...row,
        asset: assetById.get(row.asset_id),
        broker: brokerById.get(row.broker_id),
      })),
    [dividends, assetById, brokerById]
  );

  const dividendRows = useMemo(() => {
    const q = dividendSearch.trim().toLowerCase();
    return enrichedDividends.filter((row) => {
        const symbol = primarySymbols.get(row.asset_id) ?? "";
        return !q || [symbol, row.asset?.name, row.broker?.name, row.source_file].some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [enrichedDividends, dividendSearch, primarySymbols]);

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
  const activeGroup = NAV_GROUPS.find((group) => group.tabs.includes(activeTab)) ?? NAV_GROUPS[0];
  const activeSubtabs = activeGroup.tabs.map((tab) => ({ id: tab, label: tabLabelById.get(tab) ?? tab }));

  return (
    <main className="app-shell">
      <header className={`topbar ${activeSubtabs.length > 1 || activeTab === "dividendCalendar" ? "topbar-flush" : ""}`}>
        <div className="brand-lockup">
          <p className="eyebrow">Portfolio App</p>
          <h1>Cartera privada</h1>
        </div>
        <nav className="tabs" aria-label="Vistas de cartera">
          {NAV_GROUPS.map((group) => (
            <button key={group.id} className={activeGroup.id === group.id ? "active" : ""} onClick={() => setActiveTab(group.defaultTab)}>
              {group.label}
            </button>
          ))}
        </nav>
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
      {activeSubtabs.length > 1 && (
        <SectionTabs
          className="app-subtabs"
          tabs={activeSubtabs}
          active={activeTab}
          onChange={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab !== "dividendCalendar" && (
        <section className="summary-grid">
          <Metric label="Valor mercado EUR" value={formatMoney(totals.marketValue)} />
          <Metric label="Coste EUR" value={formatMoney(totals.costBasis)} />
          <Metric label="P&G latente" value={formatMoney(totals.latentGain)} tone={totals.latentGain >= 0 ? "good" : "bad"} />
          <Metric label="Dividendos netos" value={formatMoney(totals.dividendsNet)} />
        </section>
      )}

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
          onRefreshPrices={refreshPriceHistory}
          loading={loading}
          refreshingPrices={refreshingPriceHistory}
          onGenerateReport={generateReport}
          generatingReportType={generatingReportType}
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
          onRefreshPrices={refreshPriceHistory}
          refreshingPrices={refreshingPriceHistory}
          refreshIssues={priceRefreshIssues}
        />
      )}
      {activeTab === "transactions" && (
        <TransactionsView
          rows={transactionRows}
          reconciliation={portfolioReconciliation}
          portfolioCostBasis={totals.costBasis}
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
      {activeTab === "dividendCalendar" && (
        <DividendCalendarView
          events={dividendCalendar}
          onRefresh={refreshDividendCalendar}
          onGenerateReport={generateReport}
          refreshing={refreshingDividendCalendar}
          generatingReportType={generatingReportType}
        />
      )}
      {activeTab === "virtualPortfolios" && (
        <VirtualPortfoliosView
          positions={enrichedPositions}
          strategies={strategies}
          virtualPortfolios={virtualPortfolios}
          assignments={virtualAssignments}
          dividends={enrichedDividends}
          onCreatePortfolio={createVirtualPortfolio}
          onSaveAssignment={saveVirtualAssignment}
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
          onSaveManualPrice={saveManualPrice}
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
          onRefreshHistory={refreshPriceHistory}
          refreshingHistory={refreshingPriceHistory}
        />
      )}
      {activeTab === "importer" && <ImporterView />}
      {activeTab === "reports" && (
        <ReportsView reports={reports} onGenerateReport={generateReport} generatingReportType={generatingReportType} />
      )}
      {activeTab === "queue" && <QueueView queue={queue} onUpdate={updateQueueItem} loading={loading} />}
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

function PositionMarketValue({
  position,
}: {
  position: Position & { marketValue: number };
}) {
  const currency = normalizeCurrency(position.price_currency);
  const isForeignEtf = position.asset_type === "etf" && currency !== "EUR" && position.price != null;
  if (!isForeignEtf) return <>{formatMoney(position.marketValue)}</>;
  const localValue = toNumber(position.quantity) * toNumber(position.price);
  const tooltip = `Precio en LC: ${formatPlainMoney(position.price, currency)} | Valor en LC: ${formatPlainMoney(localValue, currency)}`;
  return (
    <span className="lc-tooltip" data-tooltip={tooltip} aria-label={tooltip} tabIndex={0}>
      {formatMoney(position.marketValue)}
      <i aria-hidden="true">i</i>
    </span>
  );
}

function DashboardView({
  positions,
  totals,
  queueCount,
  onRefresh,
  onRefreshPrices,
  loading,
  refreshingPrices,
  onGenerateReport,
  generatingReportType,
}: {
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  totals: { marketValue: number; costBasis: number; dailyGain: number; dividendsNet: number; latentGain: number };
  queueCount: number;
  onRefresh: () => void;
  onRefreshPrices: () => void;
  loading: boolean;
  refreshingPrices: boolean;
  onGenerateReport: (type: ReportType) => void;
  generatingReportType: ReportType | "";
}) {
  const [section, setSection] = useState<DashboardSection>("executive");
  const byType = groupPositions(positions, (row) => assetTypeLabel(row.asset_type));
  const byBroker = groupPositions(positions, (row) => row.broker);
  const byCurrency = groupPositions(positions, (row) => row.price_currency ?? "EUR");
  const etfPositions = positions.filter((row) => row.asset_type === "etf");
  const etfTotal = etfPositions.reduce((acc, row) => acc + row.marketValue, 0);
  const topDrift = [...positions].sort((a, b) => Math.abs(b.latentGain) - Math.abs(a.latentGain)).slice(0, 5);
  const latestPriceAt = latestPositionPriceDate(positions);
  return (
    <>
      <section className="command-center">
        <div>
          <span className="kicker">Control financiero</span>
          <h2>Tu cartera, lista para decidir</h2>
          <p>Filtra posiciones, genera informes y separa estrategias sin perder la trazabilidad por activo y broker.</p>
        </div>
        <div className="inline-actions">
          <button className="ghost" onClick={onRefreshPrices} disabled={refreshingPrices}>
            {refreshingPrices ? "Actualizando precios..." : "Actualizar precios"}
          </button>
          <button onClick={() => onGenerateReport("portfolio_group_analysis")} disabled={Boolean(generatingReportType)}>
            {generatingReportType === "portfolio_group_analysis" ? "Generando..." : "Informe por grupos"}
          </button>
          <button className="ghost" onClick={() => onGenerateReport("etf_resilient_portfolio")} disabled={Boolean(generatingReportType)}>
            {generatingReportType === "etf_resilient_portfolio" ? "Generando..." : "Informe ETF"}
          </button>
        </div>
      </section>
      <SectionTabs
        tabs={[
          { id: "executive", label: "Resumen" },
          { id: "allocation", label: "Asignacion" },
          { id: "positions", label: "Posiciones" },
          { id: "etf", label: "ETF" },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === "executive" && (
        <>
      <section className="panel">
        <div className="panel-header">
          <h2>Resumen ejecutivo</h2>
          <button onClick={onRefresh} disabled={loading}>
            {loading ? "Cargando" : "Actualizar"}
          </button>
        </div>
        <div className="summary-grid compact">
          <Metric label="P&G del dia" value={formatMoney(totals.dailyGain)} tone={totals.dailyGain >= 0 ? "good" : "bad"} />
          <Metric label="Rentabilidad latente" value={formatPercent(totals.costBasis ? totals.latentGain / totals.costBasis : 0)} tone={totals.latentGain >= 0 ? "good" : "bad"} />
          <Metric label="Posiciones abiertas" value={positions.length} />
          <Metric label="Ultimo precio" value={latestPriceAt ? relativeDateLabel(latestPriceAt) : "Sin precios"} />
          <Metric label="Pendiente resolver" value={queueCount} />
        </div>
      </section>
          <section className="overview-grid">
            <AllocationPanel title="Asignacion por tipo" rows={byType} />
            <section className="panel">
              <div className="panel-header">
                <h2>Mayores impactos</h2>
                <span className="muted-inline">P&G latente</span>
              </div>
              <div className="impact-list">
                {topDrift.map((row) => (
                  <article key={`${row.asset_id}-${row.broker_id}`}>
                    <span>
                      <b>{row.symbol || row.name}</b>
                      <em>{row.broker}</em>
                    </span>
                    <strong className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</strong>
                  </article>
                ))}
              </div>
            </section>
            <AllocationPanel title="Exposicion por moneda" rows={byCurrency} />
          </section>
        </>
      )}
      {section === "allocation" && (
        <section className="three-grid">
          <AllocationPanel title="Asignacion por tipo" rows={byType} />
          <AllocationPanel title="Asignacion por broker" rows={byBroker} />
          <AllocationPanel title="Exposicion por moneda" rows={byCurrency} />
        </section>
      )}
      {section === "positions" && (
      <section className="panel">
        <h2>Todas las posiciones</h2>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Peso", "P&G"]}
          totalColumns={[{ index: 3, format: "money" }, { index: 5, format: "money" }]}
          rows={positions.map((row) => [
            row.symbol,
            row.name,
            row.broker,
            <PositionMarketValue position={row} />,
            formatPercent(totals.marketValue ? row.marketValue / totals.marketValue : 0),
            <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          ])}
        />
      </section>
      )}
      {section === "etf" && (
      <section className="panel">
        <h2>Resumen ETF</h2>
        <SimpleTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Peso ETF", "P&G"]}
          totalColumns={[{ index: 3, format: "money" }, { index: 5, format: "money" }]}
          rows={etfPositions.map((row) => [
            row.symbol,
            row.name,
            row.broker,
            <PositionMarketValue position={row} />,
            formatPercent(etfTotal ? row.marketValue / etfTotal : 0),
            <span className={row.latentGain >= 0 ? "good" : "bad"}>{formatMoney(row.latentGain)}</span>,
          ])}
        />
      </section>
      )}
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
  onRefreshPrices,
  refreshingPrices,
  refreshIssues,
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
  onRefreshPrices: () => void;
  refreshingPrices: boolean;
  refreshIssues: PriceRefreshIssue[];
}) {
  const latestPriceAt = latestPositionPriceDate(rows);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Operaciones abiertas</h2>
        <div className="toolbar">
          <span className="muted-inline">Ultimo precio: {latestPriceAt ? relativeDateLabel(latestPriceAt) : "sin precios"}</span>
          <button onClick={onRefreshPrices} disabled={refreshingPrices}>
            {refreshingPrices ? "Actualizando..." : "Actualizar precios"}
          </button>
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
      {refreshIssues.length > 0 && (
        <details className="refresh-issues">
          <summary>{refreshIssues.length} incidencias de mercado pendientes</summary>
          <div className="refresh-issue-grid">
            {refreshIssues.map((issue, index) => (
              <article key={`${issue.asset_id}:${issue.stage ?? "price"}:${index}`}>
                <strong>{issue.name || issue.asset_id}</strong>
                <span>{issue.stage === "history" ? "Historico" : "Precio actual"}</span>
                <p>{issue.error}</p>
              </article>
            ))}
          </div>
        </details>
      )}
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
          <PositionMarketValue position={row} />,
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
  reconciliation,
  portfolioCostBasis,
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
  reconciliation: PortfolioReconciliation | null;
  portfolioCostBasis: number;
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
  const visibleNetInvestment = rows.reduce((acc, row) => {
    const amount = Math.abs(Number(row.gross_amount ?? 0));
    const fees = Math.abs(Number(row.fees ?? 0));
    const tax = Math.abs(Number(row.tax ?? 0));
    return row.type === "buy" || row.type === "transfer_in"
      ? acc + amount + fees + tax
      : acc - Math.max(0, amount - fees - tax);
  }, 0);
  const portfolioDifference = reconciliation ? portfolioCostBasis - Number(reconciliation.open_cost_basis_eur ?? 0) : 0;
  return (
    <>
      <TransactionFormPanel assets={assets} brokers={brokers} primarySymbols={primarySymbols} form={form} setForm={setForm} onSubmit={onSubmit} loading={loading} />
      <section className="panel">
        <div className="panel-header">
          <h2>Base de datos acciones</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar movimientos" />
        </div>
        <div className="summary-grid compact">
          <Metric label="Flujo neto visible" value={formatMoney(visibleNetInvestment)} />
          <Metric label="Filas visibles" value={rows.length} />
          <Metric label="Compras" value={rows.filter((row) => row.type === "buy").length} />
          <Metric label="Ventas" value={rows.filter((row) => row.type === "sell").length} />
        </div>
        {reconciliation && (
          <section className="reconciliation-panel" aria-label="Conciliacion de movimientos y cartera">
            <div className="panel-header">
              <div>
                <span className="kicker">Conciliacion contable</span>
                <h3>Activity explica exactamente el coste abierto de Portfolio</h3>
              </div>
              <span className={Math.abs(portfolioDifference) < 0.01 ? "status-pill good" : "status-pill bad"}>
                {Math.abs(portfolioDifference) < 0.01 ? "Conciliado" : "Revisar diferencia"}
              </span>
            </div>
            <div className="reconciliation-equation">
              <Metric label="Compras acumuladas" value={formatMoney(reconciliation.total_purchases_eur)} />
              <span aria-hidden="true">-</span>
              <Metric label="Ventas acumuladas" value={formatMoney(reconciliation.total_sale_proceeds_eur)} />
              <span aria-hidden="true">+</span>
              <Metric label="P&G realizado" value={formatMoney(reconciliation.realized_gain_eur)} tone={Number(reconciliation.realized_gain_eur) >= 0 ? "good" : "bad"} />
              <span aria-hidden="true">=</span>
              <Metric label="Coste abierto" value={formatMoney(reconciliation.open_cost_basis_eur)} />
            </div>
            <p className="reconciliation-note">
              Diferencia contra Portfolio: <strong className={Math.abs(portfolioDifference) < 0.01 ? "good" : "bad"}>{formatMoney(portfolioDifference)}</strong>.
              El coste abierto usa coste medio ponderado y descarga coste cuando hay ventas.
            </p>
          </section>
        )}
        <EditableTable
          columns={["Fecha", "Ticker", "Tipo", "Cantidad", "Importe EUR", "Fees EUR", "Tax EUR", "Moneda activo", "Broker", "Nota", ""]}
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
          Importe total EUR
          <input value={form.grossAmount} onChange={(event) => setForm({ ...form, grossAmount: event.target.value })} inputMode="decimal" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Comisiones EUR
          <input value={form.fees} onChange={(event) => setForm({ ...form, fees: event.target.value })} inputMode="decimal" />
        </label>
        <label>
          Impuestos EUR
          <input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} inputMode="decimal" />
        </label>
        <label>
          Moneda del activo
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
  const [section, setSection] = useState<DividendSection>("analysis");
  const [globalFilters, setGlobalFilters] = useState({ year: "", broker: "", currency: "", asset: "" });
  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, dividendFormFromRow(row)])));
  }, [rows]);
  const dividendAssetKey = (row: Dividend & { asset?: Asset }) =>
    `${primarySymbols.get(row.asset_id) ?? ""} ${row.asset?.name ?? ""}`.trim() || "Sin activo";
  const availableYears = [
    ...new Set(
      rows
        .map((row) => {
          const date = parseDate(row.pay_date);
          return date ? String(date.getFullYear()) : "";
        })
        .filter(Boolean)
    ),
  ].sort((a, b) => b.localeCompare(a));
  const availableBrokers = [...new Set(rows.map((row) => row.broker?.name ?? "Sin broker"))].sort();
  const availableCurrencies = [...new Set(rows.map((row) => normalizeCurrency(row.currency || "EUR")))].sort();
  const availableAssets = [...new Set(rows.map(dividendAssetKey))].sort();
  const filteredDividendRows = rows.filter((row) => {
    const date = parseDate(row.pay_date);
    const year = date ? String(date.getFullYear()) : "Sin fecha";
    return (
      (!globalFilters.year || year === globalFilters.year) &&
      (!globalFilters.broker || (row.broker?.name ?? "Sin broker") === globalFilters.broker) &&
      (!globalFilters.currency || normalizeCurrency(row.currency || "EUR") === globalFilters.currency) &&
      (!globalFilters.asset || dividendAssetKey(row) === globalFilters.asset)
    );
  });
  const totalNet = filteredDividendRows.reduce((acc, row) => acc + toNumber(row.net_amount ?? 0), 0);
  const totalGross = filteredDividendRows.reduce((acc, row) => acc + toNumber(row.gross_amount ?? 0), 0);
  const totalTax = filteredDividendRows.reduce((acc, row) => acc + toNumber(row.tax ?? 0), 0);
  const monthlyRows = dividendMonthlyRows(filteredDividendRows);
  const yearlyRows = aggregateDividends(filteredDividendRows, (row) => {
    const date = parseDate(row.pay_date);
    return date ? String(date.getFullYear()) : "Sin fecha";
  });
  const byAsset = aggregateDividends(filteredDividendRows, dividendAssetKey);
  const byBroker = aggregateDividends(filteredDividendRows, (row) => row.broker?.name ?? "Sin broker");
  const byCurrency = aggregateDividends(filteredDividendRows, (row) => normalizeCurrency(row.currency || "EUR"));
  const annualPivot = dividendAnnualPivot(filteredDividendRows);
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
          <h2>Dividendos</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="filtrar dividendos" />
        </div>
        <div className="filter-grid">
          <label>
            Ano
            <select value={globalFilters.year} onChange={(event) => setGlobalFilters((current) => ({ ...current, year: event.target.value }))}>
              <option value="">Todos</option>
              {availableYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            Broker
            <select value={globalFilters.broker} onChange={(event) => setGlobalFilters((current) => ({ ...current, broker: event.target.value }))}>
              <option value="">Todos</option>
              {availableBrokers.map((broker) => (
                <option key={broker}>{broker}</option>
              ))}
            </select>
          </label>
          <label>
            Moneda
            <select value={globalFilters.currency} onChange={(event) => setGlobalFilters((current) => ({ ...current, currency: event.target.value }))}>
              <option value="">Todas</option>
              {availableCurrencies.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <label>
            Activo
            <select value={globalFilters.asset} onChange={(event) => setGlobalFilters((current) => ({ ...current, asset: event.target.value }))}>
              <option value="">Todos</option>
              {availableAssets.map((asset) => (
                <option key={asset}>{asset}</option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => setGlobalFilters({ year: "", broker: "", currency: "", asset: "" })}>
            Limpiar filtros
          </button>
        </div>
        <div className="summary-grid compact">
          <Metric label="Neto visible" value={formatMoney(totalNet)} />
          <Metric label="Bruto visible" value={formatMoney(totalGross)} />
          <Metric label="Retencion visible" value={formatMoney(totalTax)} />
          <Metric label="Media mensual" value={formatMoney(monthlyRows.length ? totalNet / monthlyRows.length : 0)} />
        </div>
      </section>
      <SectionTabs
        tabs={[
          { id: "analysis", label: "Analisis" },
          { id: "evolution", label: "Evolucion" },
          { id: "assets", label: "Por activo" },
          { id: "edit", label: "Edicion" },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === "analysis" && (
      <>
      <section className="panel">
        <div className="panel-header">
          <h2>Evolucion neta mensual</h2>
          <span className="muted-inline">{monthlyRows.length} meses con dividendos</span>
        </div>
        <LineChart rows={monthlyRows} metric="Neto" />
      </section>
      <section className="three-grid">
        <DividendSummaryTable title="Por ano" rows={yearlyRows} onPick={(value) => setGlobalFilters((current) => ({ ...current, year: value }))} />
        <DividendSummaryTable title="Por broker" rows={byBroker} onPick={(value) => setGlobalFilters((current) => ({ ...current, broker: value }))} />
        <DividendSummaryTable title="Por moneda" rows={byCurrency} onPick={(value) => setGlobalFilters((current) => ({ ...current, currency: value }))} />
      </section>
      </>
      )}
      {section === "evolution" && (
      <>
      <section className="panel">
        <h2>Evolucion mensual</h2>
        <SimpleTable
          columns={["Mes", "Bruto", "Tax", "Neto", "Dividendos"]}
          totalColumns={[{ index: 1, format: "money" }, { index: 2, format: "money" }, { index: 3, format: "money" }, { index: 4, format: "number" }]}
          rows={monthlyRows.map((row) => [row.Mes, formatMoney(row.Bruto), formatMoney(row.Tax), formatMoney(row.Neto), row.Dividendos])}
        />
      </section>
      <section className="panel">
        <h2>Tabla dinamica anual</h2>
        <SimpleTable
          columns={["Ano", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic", "Total"]}
          totalColumns={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((index) => ({ index, format: "money" as const }))}
          rows={annualPivot.map((row) => [
            row.year,
            ...row.months.map((value) => formatMoney(value)),
            formatMoney(row.total),
          ])}
        />
      </section>
      </>
      )}
      {section === "assets" && (
      <DividendSummaryTable title="Dividendos por activo" rows={byAsset} onPick={(value) => setGlobalFilters((current) => ({ ...current, asset: value }))} />
      )}
      {section === "edit" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Base de datos dividendos</h2>
          <span className="muted-inline">{filteredDividendRows.length} filas visibles</span>
        </div>
        <EditableTable
          columns={["Fecha", "Ticker", "Bruto", "Tax", "Neto", "Moneda", "Broker", "Nota", ""]}
          totalColumns={[{ index: 2, format: "money" }, { index: 3, format: "money" }, { index: 4, format: "money" }]}
          rows={filteredDividendRows.map((row) => {
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
      )}
    </>
  );
}

function DividendCalendarView({
  events,
  onRefresh,
  onGenerateReport,
  refreshing,
  generatingReportType,
}: {
  events: DividendCalendarEvent[];
  onRefresh: () => void;
  onGenerateReport: (type: ReportType) => void;
  refreshing: boolean;
  generatingReportType: ReportType | "";
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendarType, setCalendarType] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [calendarBroker, setCalendarBroker] = useState("");
  const upcoming = events
    .filter((event) => event.payment_date || event.ex_date)
    .sort((a, b) => String(a.payment_date ?? a.ex_date).localeCompare(String(b.payment_date ?? b.ex_date)));
  const filteredEvents = upcoming.filter((event) => {
    const eventMonth = String(event.payment_date ?? event.ex_date).slice(0, 7);
    return (
      eventMonth === month &&
      (!calendarType || event.asset_type === calendarType) &&
      (!currencyFilter || normalizeCurrency(event.currency) === currencyFilter) &&
      (!calendarBroker || (event.broker ?? "Sin broker") === calendarBroker)
    );
  });
  const expectedEur = upcoming
    .filter((event) => normalizeCurrency(event.currency) === "EUR")
    .reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0);
  const nonEurEvents = upcoming.filter((event) => normalizeCurrency(event.currency) !== "EUR").length;
  const confirmedTotal = upcoming
    .filter((event) => normalizeCurrency(event.currency) === "EUR" && (event.status === "declared" || toNumber(event.confidence) >= 0.7))
    .reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0);
  const averageConfidence =
    upcoming.length > 0 ? upcoming.reduce((acc, event) => acc + toNumber(event.confidence), 0) / upcoming.length : 0;
  const byAsset = aggregateCalendarEvents(
    filteredEvents,
    (event) => `${event.symbol ?? ""} ${event.asset_name ?? ""}`.trim() || "Sin activo"
  );
  const byMonth = aggregateCalendarEvents(filteredEvents, (event) => monthKey(event.payment_date ?? event.ex_date));
  const currencies = [...new Set(upcoming.map((event) => normalizeCurrency(event.currency)))].sort();
  const brokers = [...new Set(upcoming.map((event) => event.broker ?? "Sin broker"))].sort();
  const calendarDays = monthCalendarDays(month);
  const eventsByDate = new Map<string, DividendCalendarEvent[]>();
  for (const event of filteredEvents) {
    const date = String(event.payment_date ?? event.ex_date);
    eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), event]);
  }
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const monthTotal = filteredEvents.reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0);
  const selectedTotal = selectedEvents.reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0);
  const monthlyForecast = calendarMonthlySeries(upcoming.filter((event) => !calendarBroker || (event.broker ?? "Sin broker") === calendarBroker));
  return (
    <section className="income-workbench">
      <div className="income-kpis">
        <Metric label="Expected Income" value={formatMoney(expectedEur)} />
        <Metric label="High Confidence" value={formatMoney(confirmedTotal)} />
        <Metric label="Upcoming" value={upcoming.length} />
        <Metric label="Monthly Average" value={formatMoney(monthlyForecast.length ? expectedEur / monthlyForecast.length : 0)} />
        <Metric label="Confidence" value={formatPercent(averageConfidence)} />
        <Metric label="Non EUR Events" value={nonEurEvents} />
      </div>
      <section className="calendar-layout">
        <aside className="panel control-rail">
          <div className="rail-title">
            <h2>Analysis</h2>
            <span>Dividend income</span>
          </div>
          <label>
            Broker
            <select value={calendarBroker} onChange={(event) => setCalendarBroker(event.target.value)}>
              <option value="">All Brokers</option>
              {brokers.map((broker) => (
                <option key={broker}>{broker}</option>
              ))}
            </select>
          </label>
          <label>
            Period
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label>
            Asset Type
            <select value={calendarType} onChange={(event) => setCalendarType(event.target.value)}>
              <option value="">All Asset Types</option>
              <option value="stock">Stocks</option>
              <option value="etf">ETF</option>
            </select>
          </label>
          <label>
            Currency
            <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
              <option value="">All Currencies</option>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <div className="rail-metrics">
            <Metric label="Mes visible" value={formatPlainMoney(monthTotal, currencyFilter || "EUR")} />
            <Metric label="Dia elegido" value={formatPlainMoney(selectedTotal, currencyFilter || "EUR")} />
          </div>
          <button className="ghost" onClick={() => {
            setCalendarBroker("");
            setCalendarType("");
            setCurrencyFilter("");
          }}>
            Reset Filters
          </button>
          <p className="muted no-pad">{nonEurEvents} eventos no EUR. Revisa fuente y confianza antes de darlo por definitivo.</p>
        </aside>
        <section className="panel calendar-board">
          <div className="calendar-toolbar">
            <div className="calendar-title">
              <h2>Dividend Calendar</h2>
              <button className="icon-button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">
                ‹
              </button>
              <button className="icon-button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">
                ›
              </button>
              <strong>{new Date(`${month}-01T00:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</strong>
            </div>
            <div className="calendar-actions">
              <button className="ghost" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh Calendar"}
              </button>
              <button onClick={() => onGenerateReport("etf_resilient_portfolio")} disabled={Boolean(generatingReportType)}>
                {generatingReportType === "etf_resilient_portfolio" ? "Generating..." : "Generate Report"}
              </button>
            </div>
          </div>
          <div className="calendar-frame">
            <div className="calendar-weekdays">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((day) => {
                const dayEvents = eventsByDate.get(day.date) ?? [];
                const isSelected = day.date === selectedDate;
                return (
                  <button
                    type="button"
                    key={day.date}
                    className={`calendar-cell ${day.inMonth ? "" : "muted-day"} ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <span className="day-number">{day.label}</span>
                    <strong>{dayEvents.length ? formatPlainMoney(dayEvents.reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0), dayEvents[0].currency) : ""}</strong>
                    <div className="calendar-chips">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span className={`calendar-chip ${event.asset_type} ${toNumber(event.confidence) >= 0.7 ? "high" : "medium"}`} key={event.id}>
                          <b>{event.symbol ?? event.asset_name}</b>
                          <em>{formatPlainMoney(event.expected_gross_amount, event.currency)}</em>
                        </span>
                      ))}
                      {dayEvents.length > 3 && <span className="calendar-chip more">+{dayEvents.length - 3}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="calendar-legend">
            <span><i className="dot blue" /> Ex-Dividend Date</span>
            <span><i className="dot green" /> Payment Date</span>
            <span><i className="dot amber" /> Estimated</span>
            <span><i className="dot eur" /> EUR</span>
            <span><i className="dot usd" /> USD</span>
          </div>
        </section>
        <aside className="panel day-detail">
          <div className="day-detail-header">
            <h2>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" })}</h2>
            <button className="icon-button" onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))} aria-label="Hoy">
              ×
            </button>
          </div>
          <dl className="day-stats">
            <div><dt>Expected Income</dt><dd>{formatPlainMoney(selectedTotal, selectedEvents[0]?.currency ?? "EUR")}</dd></div>
            <div><dt>Payments</dt><dd>{selectedEvents.length}</dd></div>
            <div><dt>Avg. Confidence</dt><dd>{formatPercent(selectedEvents.length ? selectedEvents.reduce((acc, event) => acc + toNumber(event.confidence), 0) / selectedEvents.length : 0)}</dd></div>
          </dl>
          {selectedEvents.length === 0 ? (
            <p className="empty">Sin cobros previstos este dia.</p>
          ) : (
            selectedEvents.map((event) => (
              <article key={event.id} className="event-card">
                <header>
                  <strong>{event.symbol ?? event.asset_name}</strong>
                  <span>{event.currency}</span>
                </header>
                <p>{event.asset_name}</p>
                <dl>
                  <div><dt>Ex-Dividend</dt><dd>{event.ex_date ?? "-"}</dd></div>
                  <div><dt>Payment Date</dt><dd>{event.payment_date ?? "-"}</dd></div>
                  <div><dt>Expected Amount</dt><dd>{formatPlainMoney(event.expected_gross_amount, event.currency)}</dd></div>
                  <div><dt>Confidence</dt><dd>{formatPercent(event.confidence)}</dd></div>
                </dl>
                {event.source_url && (
                  <a href={event.source_url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                )}
              </article>
            ))
          )}
        </aside>
      </section>
      <section className="income-bottom-grid">
        <section className="panel">
          <h2>Upcoming Payments</h2>
          <SimpleTable
            columns={["Date", "Ticker", "Name", "Amount", "Ccy", "Ex-Dividend", "Confidence", "Source"]}
            totalColumns={[{ index: 3, format: "money" }]}
            rows={filteredEvents.slice(0, 18).map((event) => [
              event.payment_date ?? "",
              event.symbol ?? "",
              event.asset_name ?? "",
              formatPlainMoney(event.expected_gross_amount, event.currency),
              event.currency,
              event.ex_date ?? "",
              formatPercent(event.confidence),
              event.source_url ? (
                <a href={event.source_url} target="_blank" rel="noreferrer">
                  {event.source_title || "Source"}
                </a>
              ) : (
                ""
              ),
            ])}
          />
        </section>
        <section className="panel chart-panel">
          <h2>Expected Income (Monthly)</h2>
          <CalendarBarChart rows={monthlyForecast} />
        </section>
      </section>
      <section className="two-grid">
        <CalendarSummaryTable title="Por mes previsto" rows={byMonth} />
        <CalendarSummaryTable title="Por activo previsto" rows={byAsset} />
      </section>
    </section>
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
  onSaveManualPrice: (assetId: string, price: string, currency: string, pricedOn: string) => Promise<boolean>;
  loading: boolean;
}) {
  const funds = allAssets.filter((asset) => asset.asset_type === "fund");
  const [manualAssetId, setManualAssetId] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualCurrency, setManualCurrency] = useState("EUR");
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
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
      <form
        className="panel form-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await onSaveManualPrice(manualAssetId, manualPrice, manualCurrency, manualDate);
          if (saved) setManualPrice("");
        }}
      >
        <div className="panel-header">
          <div>
            <h2>Valor liquidativo manual</h2>
            <p className="muted">Para fondos sin fuente automatica verificable. Cada valor queda guardado en el historico.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Fondo
            <select
              value={manualAssetId}
              onChange={(event) => {
                const asset = funds.find((row) => row.id === event.target.value);
                setManualAssetId(event.target.value);
                setManualCurrency(asset?.currency ?? "EUR");
              }}
            >
              <option value="">Selecciona un fondo</option>
              {funds.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.name} - {asset.isin}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha del valor
            <input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
          </label>
          <label>
            Valor liquidativo
            <input value={manualPrice} inputMode="decimal" onChange={(event) => setManualPrice(event.target.value)} placeholder="0,00" />
          </label>
          <label>
            Moneda
            <input value={manualCurrency} onChange={(event) => setManualCurrency(event.target.value.toUpperCase())} maxLength={3} />
          </label>
        </div>
        <button disabled={loading || !funds.length}>Guardar valor</button>
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
  const legacyBySymbol = new Map(etfs.map((row, index) => [String(row.symbol ?? row.ticker ?? "").toUpperCase(), { row, index }]));
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
  const changePositionEtf = (
    symbol: string,
    position: Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number },
    key: string,
    value: string
  ) => {
    const legacy = legacyBySymbol.get(symbol);
    if (legacy) {
      changeEtf(legacy.index, key, value);
      return;
    }
    onChange([
      ...etfs,
      {
        symbol,
        provider_name: position.name,
        name: position.name,
        targetWeight: 0,
        [key]: key === "targetWeight" ? toNumber(value) / 100 : value,
      },
    ]);
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
          columns={["Ticker", "Broker", "Nombre", "ISIN", "Proveedor", "Resistente", "Cantidad", "Valor EUR", "Peso actual", "Peso objetivo %", "Diferencia", "EUR aprox."]}
          totalColumns={[{ index: 7, format: "money" }, { index: 11, format: "money" }]}
          rows={etfPositions.map((position) => {
            const symbol = String(position.symbol ?? "").toUpperCase();
            const legacy = legacyBySymbol.get(symbol);
            const row = legacy?.row ?? {};
            const actualWeight = total ? Number(position.marketValue ?? 0) / total : 0;
            const targetWeight = Number(row.targetWeight ?? 0);
            const delta = targetWeight - actualWeight;
            const isStrategic = strategicAssetIds.has(position.asset_id);
            return [
              <input value={symbol} onChange={(event) => changePositionEtf(symbol, position, "symbol", event.target.value.toUpperCase())} />,
              position.broker,
              <input value={String(row.provider_name ?? row.name ?? position.name ?? "")} onChange={(event) => changePositionEtf(symbol, position, "provider_name", event.target.value)} />,
              <input value={String(row.isin ?? "")} onChange={(event) => changePositionEtf(symbol, position, "isin", event.target.value.toUpperCase())} />,
              <input value={String(row.provider ?? "")} onChange={(event) => changePositionEtf(symbol, position, "provider", event.target.value)} />,
              <input
                aria-label="ETF cartera resistente"
                checked={isStrategic}
                onChange={(event) => onToggleStrategicTag(position.asset_id, event.target.checked)}
                type="checkbox"
              />,
              formatNumber(position.quantity),
              <PositionMarketValue position={position} />,
              formatPercent(actualWeight),
              <input value={targetWeight ? String(Math.round(targetWeight * 10000) / 100) : ""} onChange={(event) => changePositionEtf(symbol, position, "targetWeight", event.target.value)} inputMode="decimal" />,
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
  onRefreshHistory,
  refreshingHistory,
}: {
  portfolioSnapshots: PortfolioSnapshot[];
  priceSnapshots: PriceSnapshot[];
  assetById: Map<string, Asset>;
  brokerById: Map<string, Broker>;
  primarySymbols: Map<string, string>;
  onRefreshHistory: () => void;
  refreshingHistory: boolean;
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Snapshots de cartera</h2>
          <button onClick={onRefreshHistory} disabled={refreshingHistory}>
            {refreshingHistory ? "Actualizando..." : "Actualizar historico 5Y"}
          </button>
        </div>
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

function VirtualPortfoliosView({
  positions,
  strategies,
  virtualPortfolios,
  assignments,
  dividends,
  onCreatePortfolio,
  onSaveAssignment,
}: {
  positions: Array<Position & { symbol: string; marketValue: number; costBasis: number; latentGain: number; dailyGain: number }>;
  strategies: PortfolioStrategy[];
  virtualPortfolios: VirtualPortfolio[];
  assignments: VirtualPortfolioAssignment[];
  dividends: EnrichedDividend[];
  onCreatePortfolio: (name: string, strategyId: string) => void;
  onSaveAssignment: (assetId: string, brokerId: string, virtualPortfolioId: string, targetWeight: string, notes: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newStrategyId, setNewStrategyId] = useState(strategies[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, { portfolioId: string; targetWeight: string; notes: string }>>({});

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        positions.map((position) => {
          const assignment = assignments.find((row) => row.asset_id === position.asset_id && row.broker_id === position.broker_id);
          return [
            `${position.asset_id}:${position.broker_id}`,
            {
              portfolioId: assignment?.virtual_portfolio_id ?? "",
              targetWeight: assignment?.target_weight != null ? formatInputNumber(toNumber(assignment.target_weight) * 100) : "",
              notes: assignment?.notes ?? "",
            },
          ];
        })
      )
    );
  }, [positions, assignments]);

  const strategyById = useMemo(() => new Map(strategies.map((strategy) => [strategy.id, strategy])), [strategies]);
  const dividendsByPosition = useMemo(() => {
    const totals = new Map<string, number>();
    for (const dividend of dividends) {
      const key = `${dividend.asset_id}:${dividend.broker_id}`;
      totals.set(key, (totals.get(key) ?? 0) + toNumber(dividend.net_amount));
    }
    return totals;
  }, [dividends]);
  const portfolioSummary = virtualPortfolios.map((portfolio) => {
    const memberKeys = new Set(
      assignments
        .filter((assignment) => assignment.virtual_portfolio_id === portfolio.id)
        .map((assignment) => `${assignment.asset_id}:${assignment.broker_id}`)
    );
    const members = positions.filter((position) => memberKeys.has(`${position.asset_id}:${position.broker_id}`));
    const marketValue = members.reduce((acc, row) => acc + row.marketValue, 0);
    const costBasis = members.reduce((acc, row) => acc + row.costBasis, 0);
    const accumulatedDividends = [...memberKeys].reduce((acc, key) => acc + (dividendsByPosition.get(key) ?? 0), 0);
    return { portfolio, members, marketValue, costBasis, latentGain: marketValue - costBasis, accumulatedDividends };
  });

  return (
    <>
      <section className="command-center">
        <div>
          <span className="kicker">Estrategias separadas</span>
          <h2>Carteras virtuales</h2>
          <p>Asigna cada posicion por activo y broker a una cartera vinculada a una estrategia. Esto deja el dato listo para informes, rentabilidad y rebalanceos por contexto.</p>
        </div>
      </section>
      <section className="three-grid">
        {portfolioSummary.map(({ portfolio, members, marketValue, costBasis, latentGain, accumulatedDividends }) => {
          const strategy = portfolio.strategy_id ? strategyById.get(portfolio.strategy_id) : null;
          return (
            <article className="portfolio-card" key={portfolio.id}>
              <span>{strategy?.name ?? "Sin estrategia"}</span>
              <strong>{portfolio.name}</strong>
              <p>{strategy?.objective ?? portfolio.notes}</p>
              <div className="portfolio-card-grid">
                <Metric label="Valor" value={formatMoney(marketValue)} />
                <Metric label="P&G" value={formatMoney(latentGain)} tone={latentGain >= 0 ? "good" : "bad"} />
                <Metric label="Rent." value={formatPercent(costBasis ? latentGain / costBasis : 0)} tone={latentGain >= 0 ? "good" : "bad"} />
                <Metric label="Dividendos netos" value={formatMoney(accumulatedDividends)} />
                <Metric label="Posiciones" value={members.length} />
              </div>
            </article>
          );
        })}
      </section>
      <form
        className="panel form-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onCreatePortfolio(newName, newStrategyId);
          setNewName("");
        }}
      >
        <h2>Nueva cartera virtual</h2>
        <div className="form-row">
          <label>
            Nombre
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ej. Dividendos USA" />
          </label>
          <label>
            Estrategia
            <select value={newStrategyId} onChange={(event) => setNewStrategyId(event.target.value)}>
              <option value="">Sin estrategia</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button>Crear cartera</button>
      </form>
      <section className="panel">
        <div className="panel-header">
          <h2>Asignacion por posicion</h2>
          <span className="muted-inline">{positions.length} posiciones abiertas</span>
        </div>
        <EditableTable
          columns={["Ticker", "Activo", "Broker", "Valor EUR", "Dividendos netos", "Cartera virtual", "Peso objetivo", "Nota", ""]}
          totalColumns={[{ index: 3, format: "money" }, { index: 4, format: "money" }]}
          rows={positions.map((position) => {
            const key = `${position.asset_id}:${position.broker_id}`;
            const draft = drafts[key] ?? { portfolioId: "", targetWeight: "", notes: "" };
            const setDraft = (patch: Partial<typeof draft>) => setDrafts((current) => ({ ...current, [key]: { ...draft, ...patch } }));
            return [
              position.symbol,
              position.name,
              position.broker,
              <PositionMarketValue position={position} />,
              formatMoney(dividendsByPosition.get(key) ?? 0),
              <select value={draft.portfolioId} onChange={(event) => setDraft({ portfolioId: event.target.value })}>
                <option value="">Sin asignar</option>
                {virtualPortfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>,
              <input value={draft.targetWeight} onChange={(event) => setDraft({ targetWeight: event.target.value })} inputMode="decimal" placeholder="%" />,
              <input value={draft.notes} onChange={(event) => setDraft({ notes: event.target.value })} />,
              <button onClick={() => onSaveAssignment(position.asset_id, position.broker_id, draft.portfolioId, draft.targetWeight, draft.notes)}>
                Guardar
              </button>,
            ];
          })}
        />
      </section>
    </>
  );
}

function ReportsView({
  reports,
  onGenerateReport,
  generatingReportType,
}: {
  reports: ResearchReport[];
  onGenerateReport: (type: ReportType) => void;
  generatingReportType: ReportType | "";
}) {
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
        <div className="report-actions">
          <button onClick={() => onGenerateReport("portfolio_group_analysis")} disabled={Boolean(generatingReportType)}>
            {generatingReportType === "portfolio_group_analysis" ? "Generando..." : "Generar analisis por grupo"}
          </button>
          <button className="ghost" onClick={() => onGenerateReport("etf_resilient_portfolio")} disabled={Boolean(generatingReportType)}>
            {generatingReportType === "etf_resilient_portfolio" ? "Generando..." : "Generar analisis ETF"}
          </button>
          <button className="ghost" onClick={() => onGenerateReport("rebalance_opportunity")} disabled={Boolean(generatingReportType)}>
            {generatingReportType === "rebalance_opportunity" ? "Generando..." : "Rebalanceo"}
          </button>
        </div>
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

function QueueView({
  queue,
  onUpdate,
  loading,
}: {
  queue: ResolutionQueueItem[];
  onUpdate: (id: string, patch: Partial<ResolutionQueueItem>) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, Partial<ResolutionQueueItem>>>({});
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        queue.map((item) => [
          item.id,
          {
            raw_name: item.raw_name ?? "",
            symbol: item.symbol ?? "",
            isin: item.isin ?? "",
            broker: item.broker ?? "",
            status: item.status,
            notes: item.notes ?? "",
          },
        ])
      )
    );
  }, [queue]);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Watchlist y resoluciones</h2>
        <span className="muted-inline">{queue.length} elementos</span>
      </div>
      <EditableTable
        columns={["Origen", "Nombre detectado", "Ticker", "ISIN", "Broker", "Estado", "Notas", "Creado", ""]}
        rows={queue.map((item) => {
          const draft = drafts[item.id] ?? item;
          const setDraft = (patch: Partial<ResolutionQueueItem>) =>
            setDrafts((current) => ({ ...current, [item.id]: { ...draft, ...patch } }));
          return [
            item.source,
            <input value={String(draft.raw_name ?? "")} onChange={(event) => setDraft({ raw_name: event.target.value })} />,
            <input value={String(draft.symbol ?? "")} onChange={(event) => setDraft({ symbol: event.target.value.toUpperCase() })} />,
            <input value={String(draft.isin ?? "")} onChange={(event) => setDraft({ isin: event.target.value.toUpperCase() })} />,
            <input value={String(draft.broker ?? "")} onChange={(event) => setDraft({ broker: event.target.value })} />,
            <select value={draft.status ?? "pending"} onChange={(event) => setDraft({ status: event.target.value as ResolutionQueueItem["status"] })}>
              <option value="pending">Pendiente</option>
              <option value="resolved">Resuelto</option>
              <option value="ignored">Ignorado</option>
            </select>,
            <input value={String(draft.notes ?? "")} onChange={(event) => setDraft({ notes: event.target.value })} />,
            item.created_at ? new Date(item.created_at).toLocaleString("es-ES") : "",
            <button onClick={() => onUpdate(item.id, draft)} disabled={loading}>
              Guardar
            </button>,
          ];
        })}
      />
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
  className = "",
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <nav className={`section-tabs ${className}`} aria-label="Secciones">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function DividendSummaryTable({ title, rows, onPick }: { title: string; rows: DividendAggregate[]; onPick?: (value: string) => void }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <SimpleTable
        hideFilters={Boolean(onPick)}
        columns={["Grupo", "Bruto", "Tax", "Neto", "Dividendos", "Peso"]}
        totalColumns={[
          { index: 1, format: "money" },
          { index: 2, format: "money" },
          { index: 3, format: "money" },
          { index: 4, format: "number" },
        ]}
        rows={rows.map((row) => [
          onPick ? (
            <button type="button" className="text-action" onClick={() => onPick(row.name)}>
              {row.name}
            </button>
          ) : (
            row.name
          ),
          formatMoney(row.gross),
          formatMoney(row.tax),
          formatMoney(row.net),
          row.count,
          formatPercent(row.weight),
        ])}
      />
    </section>
  );
}

function CalendarSummaryTable({ title, rows }: { title: string; rows: CalendarAggregate[] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <SimpleTable
        columns={["Grupo", "Moneda", "Esperado", "Eventos", "Confianza", "Peso"]}
        totalColumns={[
          { index: 3, format: "number" },
        ]}
        rows={rows.map((row) => [
          row.name,
          row.currency,
          formatPlainMoney(row.expected, row.currency),
          row.count,
          formatPercent(row.averageConfidence),
          formatPercent(row.weight),
        ])}
      />
    </section>
  );
}

function CalendarBarChart({ rows }: { rows: Array<{ month: string; expected: number }> }) {
  if (!rows.length) return <p className="empty">Sin datos para graficar.</p>;
  const max = Math.max(...rows.map((row) => row.expected), 1);
  return (
    <div className="income-chart" role="img" aria-label="Expected income monthly chart">
      <div className="chart-axis">
        {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
          <span key={ratio}>{formatMoney(max * ratio)}</span>
        ))}
      </div>
      <div className="chart-bars">
        {rows.map((row) => (
          <div className="chart-month" key={row.month}>
            <div className="chart-bar-pair single">
              <span className="bar-current" style={{ height: `${Math.max(4, (row.expected / max) * 100)}%` }} />
            </div>
            <strong>{formatPlainMoney(row.expected, "EUR").replace(",00", "")}</strong>
            <em>{row.month}</em>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span><i className="dot blue" /> Expected from declared events</span>
      </div>
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  totalColumns = [],
  hideFilters = false,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  totalColumns?: TotalColumn[];
  hideFilters?: boolean;
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        columns.every((_, index) => {
          const query = normalizeSearchText(filters[index] ?? "");
          return !query || normalizeSearchText(cellText(row[index])).includes(query);
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
          {!hideFilters && (
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
          )}
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
          const query = normalizeSearchText(filters[index] ?? "");
          return !query || normalizeSearchText(cellText(row[index])).includes(query);
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

function aggregateDividends(rows: Array<Dividend & { asset?: Asset; broker?: Broker }>, keyFn: (row: Dividend & { asset?: Asset; broker?: Broker }) => string): DividendAggregate[] {
  const total = rows.reduce((acc, row) => acc + toNumber(row.net_amount), 0) || 1;
  const map = new Map<string, { gross: number; tax: number; net: number; count: number }>();
  for (const row of rows) {
    const key = keyFn(row) || "Sin clasificar";
    const current = map.get(key) ?? { gross: 0, tax: 0, net: 0, count: 0 };
    current.gross += toNumber(row.gross_amount);
    current.tax += toNumber(row.tax);
    current.net += toNumber(row.net_amount);
    current.count += 1;
    map.set(key, current);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .map(([name, value]) => ({ name, ...value, weight: value.net / total }));
}

function dividendMonthlyRows(rows: Array<Dividend & { asset?: Asset; broker?: Broker }>) {
  return aggregateDividends(rows, (row) => monthKey(row.pay_date) || "Sin fecha")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      Mes: row.name,
      Bruto: row.gross,
      Tax: row.tax,
      Neto: row.net,
      Dividendos: row.count,
    }));
}

function dividendAnnualPivot(rows: Array<Dividend & { asset?: Asset; broker?: Broker }>) {
  const byYear = new Map<string, number[]>();
  for (const row of rows) {
    const date = parseDate(row.pay_date);
    if (!date) continue;
    const year = String(date.getFullYear());
    const values = byYear.get(year) ?? Array.from({ length: 12 }, () => 0);
    values[date.getMonth()] += toNumber(row.net_amount);
    byYear.set(year, values);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({ year, months, total: months.reduce((acc, value) => acc + value, 0) }));
}

function parseDate(value: string | null | undefined) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestPositionPriceDate(rows: Array<{ priced_at: string | null }>) {
  return rows
    .map((row) => parseDate(row.priced_at))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function relativeDateLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "fecha futura";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} dias`;
}

function aggregateCalendarEvents(events: DividendCalendarEvent[], keyFn: (event: DividendCalendarEvent) => string): CalendarAggregate[] {
  const total = events.reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0) || 1;
  const map = new Map<string, { expected: number; confidence: number; count: number }>();
  for (const event of events) {
    const currency = normalizeCurrency(event.currency);
    const name = keyFn(event) || "Sin clasificar";
    const key = `${name}||${currency}`;
    const current = map.get(key) ?? { expected: 0, confidence: 0, count: 0 };
    current.expected += toNumber(event.expected_gross_amount);
    current.confidence += toNumber(event.confidence);
    current.count += 1;
    map.set(key, current);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].expected - a[1].expected)
    .map(([key, value]) => {
      const [name, currency] = key.split("||");
      return {
      name,
      currency,
      expected: value.expected,
      count: value.count,
      averageConfidence: value.count ? value.confidence / value.count : 0,
      weight: value.expected / total,
    };
    });
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

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 500));
  }
}

async function loadAllRows<T>(table: string, orderColumn: string) {
  const pageSize = 1000;
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from(table)
      .select("*")
      .order(orderColumn, { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = (result.data ?? []) as T[];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null };
  }
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
    const element = value as { type?: unknown; props: { children?: React.ReactNode; value?: string | number } };
    const props = element.props;
    if (element.type === "select") {
      const selectedValue = String(props.value ?? "");
      return `${selectedValue} ${selectedOptionText(props.children, selectedValue)}`.trim();
    }
    return String(props.value ?? cellText(props.children));
  }
  return "";
}

function selectedOptionText(value: React.ReactNode, selectedValue: string): string {
  if (Array.isArray(value)) {
    return value.map((child) => selectedOptionText(child, selectedValue)).find(Boolean) ?? "";
  }
  if (value == null || typeof value !== "object" || !("props" in value)) return "";
  const element = value as { type?: unknown; props: { children?: React.ReactNode; value?: string | number } };
  if (element.type === "option") {
    const optionText = cellText(element.props.children);
    const optionValue = String(element.props.value ?? optionText);
    return optionValue === selectedValue ? optionText : "";
  }
  return selectedOptionText(element.props.children, selectedValue);
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function monthCalendarDays(month: string) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  const today = new Date();
  const year = Number.isFinite(yearRaw) ? yearRaw : today.getFullYear();
  const monthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : today.getMonth();
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      label: String(date.getDate()),
      inMonth: date.getMonth() === monthIndex,
    };
  });
}

function addMonths(month: string, delta: number) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  const date = new Date(Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear(), Number.isFinite(monthRaw) ? monthRaw - 1 : new Date().getMonth(), 1);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function calendarMonthlySeries(events: DividendCalendarEvent[]) {
  const year = new Date().getFullYear();
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const expected = events
      .filter((event) => monthKey(event.payment_date ?? event.ex_date) === key && normalizeCurrency(event.currency) === "EUR")
      .reduce((acc, event) => acc + toNumber(event.expected_gross_amount), 0);
    return {
      month: new Date(year, index, 1).toLocaleDateString("es-ES", { month: "short" }),
      expected,
    };
  });
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

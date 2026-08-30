type Dict = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = requireAnyEnv("PORTFOLIO_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_ANON_KEY = requireAnyEnv("PORTFOLIO_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
const SUPABASE_BACKEND_KEY =
  Deno.env.get("PORTFOLIO_SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const BRAVE_SEARCH_API_KEY = Deno.env.get("BRAVE_SEARCH_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
const OPENAI_REPORT_MAX_OUTPUT_TOKENS = Number(Deno.env.get("OPENAI_REPORT_MAX_OUTPUT_TOKENS") || 3500);

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} missing`);
  return value;
}

function requireAnyEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} missing`);
}

function jsonResponse(body: Dict, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function assertAuthenticated(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Missing Supabase user token");
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!response.ok) {
    throw new Error("Invalid Supabase user token");
  }
}

async function supabaseRest(path: string, init: RequestInit = {}) {
  if (!SUPABASE_BACKEND_KEY) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY missing");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_BACKEND_KEY,
      Authorization: `Bearer ${SUPABASE_BACKEND_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }
  const text = await response.text();
  if (!text.trim()) return [];
  return JSON.parse(text);
}

function inList(values: string[]) {
  return values.map((value) => value.replace(/[(),]/g, "")).join(",");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTerms(values: unknown[], limit = 8) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const text = asString(value);
    const key = text.toUpperCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    terms.push(text);
    if (terms.length >= limit) break;
  }
  return terms;
}

function positionSearchTerms(position: Dict) {
  const identifiers = Array.isArray(position.identifiers) ? (position.identifiers as Dict[]) : [];
  return {
    symbols: uniqueTerms([position.symbol, ...identifiers.map((row) => row.symbol)]),
    isin: asString(position.isin),
    name: asString(position.name),
  };
}

function dividendCalendarQueryVariants(position: Dict, focus: string | null) {
  const year = new Date().getUTCFullYear();
  const tail = `${year} ${year + 1}${focus ? ` ${focus}` : ""}`;
  const terms = positionSearchTerms(position);
  const symbolText = terms.symbols.slice(0, 3).join(" ");
  if (position.asset_type === "etf") {
    const core = uniqueTerms([terms.isin, terms.name, symbolText], 3).join(" ");
    const isinOrName = terms.isin || terms.name;
    return [
      `${core} ETF distribution dividend ex-dividend payment date ${tail}`,
      `${isinOrName} ETF dividends distributions income payment date ${tail}`,
      `${isinOrName} UCITS ETF distribution calendar ex date pay date ${tail}`,
      `site:justetf.com ${isinOrName} distributions dividends`,
    ];
  }
  return [
    `${symbolText} ${terms.name} declared dividend ex-dividend date record date payment date ${tail}`,
    `${symbolText || terms.name} dividend announcement payment date ex-date ${tail}`,
  ];
}

async function braveSearch(query: string) {
  if (!BRAVE_SEARCH_API_KEY) throw new Error("BRAVE_SEARCH_API_KEY missing");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  const actual = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!actual.ok) throw new Error(`Brave ${actual.status}: ${await actual.text()}`);
  const data = await actual.json();
  return {
    query,
    results: (data.web?.results || []).map((item: Dict) => ({
      title: item.title,
      url: item.url,
      description: item.description,
    })),
  };
}

async function yahooDividendHistory(symbol: string) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 900 * 24 * 60 * 60;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("period1", String(start));
  url.searchParams.set("period2", String(now + 60 * 24 * 60 * 60));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div");
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 PortfolioDividendCalendar/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const dividends = data.chart?.result?.[0]?.events?.dividends || {};
    return Object.values(dividends)
      .map((item: any) => ({
        ex_date: new Date(Number(item.date) * 1000).toISOString().slice(0, 10),
        dividend_amount: Number(item.amount || 0),
      }))
      .filter((item) => item.dividend_amount > 0)
      .sort((a, b) => a.ex_date.localeCompare(b.ex_date));
  } catch {
    return [];
  }
}

function inferNextDistribution(history: Array<{ ex_date: string; dividend_amount: number }>) {
  if (!history.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const latest = history[history.length - 1];
  if (latest.ex_date >= today) {
    return { ...latest, status: "declared_yahoo", confidence: 0.62 };
  }
  const intervals: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const current = Date.parse(history[index].ex_date);
    const previous = Date.parse(history[index - 1].ex_date);
    const days = Math.round((current - previous) / 86_400_000);
    if (days > 0) intervals.push(days);
  }
  if (!intervals.length) return null;
  intervals.sort((a, b) => a - b);
  const interval = intervals[Math.floor(intervals.length / 2)];
  if (interval < 20 || interval > 370) return null;
  let next = new Date(`${latest.ex_date}T00:00:00Z`);
  while (next.toISOString().slice(0, 10) <= today) {
    next = new Date(next.getTime() + interval * 86_400_000);
  }
  return {
    ex_date: next.toISOString().slice(0, 10),
    dividend_amount: latest.dividend_amount,
    status: "estimated_from_history",
    confidence: 0.38,
  };
}

function parseOpenAIJson(data: Dict) {
  let text = asString(data.output_text);
  if (!text && Array.isArray(data.output)) {
    for (const outputItem of data.output as Dict[]) {
      for (const content of ((outputItem.content as Dict[]) || [])) {
        if (content.type === "output_text") text += asString(content.text);
      }
    }
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { events: [] };
  try {
    return JSON.parse(match[0]);
  } catch {
    return { events: [] };
  }
}

function cleanDate(value: unknown) {
  const text = asString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeCurrency(value: unknown) {
  const currency = asString(value || "EUR").toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function normalizeEvent(event: Dict) {
  return {
    ex_date: cleanDate(event.ex_date),
    record_date: cleanDate(event.record_date),
    payment_date: cleanDate(event.payment_date),
    declaration_date: cleanDate(event.declaration_date),
    dividend_amount: Number(event.dividend_amount || 0),
    currency: normalizeCurrency(event.currency),
    frequency: event.frequency || null,
    status: asString(event.status) || "unconfirmed",
    source_url: event.source_url || null,
    source_title: event.source_title || null,
    confidence: Math.max(0, Math.min(1, Number(event.confidence || 0))),
    notes: event.notes || null,
  };
}

async function extractDividendEvents(position: Dict, search: Dict) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const prompt =
    "Extrae dividendos declarados o anunciados para esta posicion. Para ETFs acepta distributions. " +
    "Solo eventos futuros o muy recientes pendientes de cobro. Usa fechas ISO YYYY-MM-DD. " +
    `Fecha actual: ${new Date().toISOString().slice(0, 10)}.\n\n` +
    `Posicion JSON:\n${JSON.stringify(position)}\n\nResultados Brave JSON:\n${JSON.stringify(search)}\n\n` +
    'Devuelve este JSON exacto: {"events":[{"ex_date":null,"record_date":null,"payment_date":null,' +
    '"declaration_date":null,"dividend_amount":0,"currency":"EUR","frequency":null,"status":"declared",' +
    '"source_url":null,"source_title":null,"confidence":0.0,"notes":null}]}';
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "Eres un analista de datos financieros. Extraes dividendos declarados desde Brave. " +
        "Para ETFs, distribution e income distribution equivalen a dividend. No mezcles ISIN europeos con ETFs de EEUU. " +
        "No inventes importes. Si no hay importe y fecha, devuelve events vacio.",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      store: false,
      temperature: 0,
      max_output_tokens: Math.min(OPENAI_REPORT_MAX_OUTPUT_TOKENS, 1800),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const parsed = parseOpenAIJson(await response.json());
  return Array.isArray(parsed.events) ? parsed.events.map(normalizeEvent) : [];
}

async function loadContext(maxPositions: number) {
  const positions = await supabaseRest(
    `v_open_positions?select=*&asset_type=in.(stock,etf)&quantity=gt.0.00000001&order=market_value.desc&limit=${maxPositions}`,
  ) as Dict[];
  const assetIds = positions.map((row) => String(row.asset_id));
  if (!assetIds.length) return [];
  const assets = await supabaseRest(
    `assets?select=id,name,isin,currency,asset_type&id=in.(${inList(assetIds)})`,
  ) as Dict[];
  const identifiers = await supabaseRest(
    `asset_identifiers?select=asset_id,provider,symbol,exchange,is_primary&asset_id=in.(${inList(assetIds)})`,
  ) as Dict[];
  const assetsById = new Map(assets.map((row) => [String(row.id), row]));
  const identifiersByAsset = new Map<string, Dict[]>();
  for (const row of identifiers) {
    const key = String(row.asset_id);
    identifiersByAsset.set(key, [...(identifiersByAsset.get(key) || []), row]);
  }
  const openPositions = positions.map((row) => {
    const asset = assetsById.get(String(row.asset_id)) || {};
    const ids = identifiersByAsset.get(String(row.asset_id)) || [];
    const primary = ids.find((item) => item.provider === "yahoo" && item.is_primary)
      || ids.find((item) => item.is_primary);
    return {
      asset_id: row.asset_id,
      broker_id: row.broker_id,
      symbol: primary?.symbol || row.name || asset.name,
      name: asset.name || row.name,
      asset_type: asset.asset_type || row.asset_type,
      isin: asset.isin,
      asset_currency: asset.currency,
      broker: row.broker,
      quantity: Number(row.quantity || 0),
      price_currency: row.price_currency,
      identifiers: ids,
    };
  }).filter((position) => Number(position.quantity) > 0.00000001);
  const positionsByKey = new Map<string, Dict>();
  for (const position of openPositions) {
    positionsByKey.set(`${position.asset_id}:${position.broker_id}`, position);
  }
  return [...positionsByKey.values()];
}

async function collectSearch(position: Dict, focus: string | null, maxWebResults: number) {
  const aggregate: Dict = { queries: [], results: [] };
  const seen = new Set<string>();
  for (const query of dividendCalendarQueryVariants(position, focus)) {
    const search = await braveSearch(query);
    (aggregate.queries as string[]).push(query);
    for (const result of search.results as Dict[]) {
      const url = asString(result.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      (aggregate.results as Dict[]).push(result);
      if ((aggregate.results as Dict[]).length >= maxWebResults) break;
    }
  }
  return aggregate;
}

async function estimateEtfDistribution(position: Dict) {
  if (position.asset_type !== "etf") return null;
  const terms = positionSearchTerms(position);
  for (const symbol of terms.symbols) {
    const estimate = inferNextDistribution(await yahooDividendHistory(symbol));
    if (!estimate) continue;
    return normalizeEvent({
      ...estimate,
      currency: position.asset_currency || position.price_currency || "EUR",
      source_url: `https://finance.yahoo.com/quote/${symbol}/history?filter=div`,
      source_title: "Yahoo Finance dividend history",
      notes: `Estimacion desde historico de distribuciones; revisar fuente. Simbolo usado: ${symbol}.`,
    });
  }
  return null;
}

function calendarRow(position: Dict, event: Dict, search: Dict) {
  const quantity = Number(position.quantity || 0);
  const dividendAmount = Number(event.dividend_amount || 0);
  return {
    asset_id: position.asset_id,
    broker_id: position.broker_id,
    symbol: position.symbol,
    asset_name: position.name,
    asset_type: position.asset_type,
    broker: position.broker,
    quantity,
    ex_date: event.ex_date,
    record_date: event.record_date,
    payment_date: event.payment_date,
    declaration_date: event.declaration_date,
    dividend_amount: dividendAmount,
    currency: event.currency,
    expected_gross_amount: quantity * dividendAmount,
    status: event.status,
    confidence: event.confidence,
    source_url: event.source_url,
    source_title: event.source_title,
    notes: event.notes,
    raw_payload: { search, event },
  };
}

async function refreshDividendCalendar(payload: Dict) {
  const maxPositions = Number(payload.max_positions || 120);
  const maxWebResults = Number(payload.max_web_results || 8);
  const focus = asString(payload.focus) || null;
  const positions = await loadContext(maxPositions);
  const positionsByAsset = new Map<string, Dict[]>();
  for (const position of positions) {
    const assetId = String(position.asset_id);
    positionsByAsset.set(assetId, [...(positionsByAsset.get(assetId) || []), position]);
  }
  const rowsByKey = new Map<string, Dict>();
  for (const assetPositions of positionsByAsset.values()) {
    const representative = assetPositions[0];
    const search = await collectSearch(representative, focus, maxWebResults);
    const aiEvents = await extractDividendEvents(representative, search);
    let validEvents = aiEvents.filter((event) =>
      (event.payment_date || event.ex_date) && Number(event.dividend_amount || 0) > 0
    );
    if (!validEvents.length) {
      const estimated = await estimateEtfDistribution(representative);
      if (estimated) validEvents = [estimated];
    }
    for (const event of validEvents) {
      for (const position of assetPositions) {
        const row = calendarRow(position, event, search);
        const key = [
          row.asset_id,
          row.broker_id,
          row.ex_date || "",
          row.payment_date || "",
          row.dividend_amount,
          row.currency,
        ].join(":");
        rowsByKey.set(key, row);
      }
    }
  }
  const rows = [...rowsByKey.values()];
  await supabaseRest("dividend_calendar_events?id=not.is.null", { method: "DELETE" });
  if (rows.length) {
    await supabaseRest(
      "dividend_calendar_events?on_conflict=asset_id,broker_id,ex_date,payment_date,dividend_amount,currency",
      { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) },
    );
  }
  return { status: "ok", assets: positionsByAsset.size, positions: positions.length, events: rows.length };
}

function reportTitle(reportType: string) {
  const today = new Date().toISOString().slice(0, 10);
  const labels: Record<string, string> = {
    portfolio_group_analysis: "Analisis cartera actual por grupo",
    etf_resilient_portfolio: "Analisis ETF cartera resistente",
    rebalance_opportunity: "Oportunidades de ponderacion",
    portfolio_periodic: "Analisis periodico de cartera",
  };
  return `${labels[reportType] || "Informe cartera"} - ${today}`;
}

async function loadReportContext() {
  const positions = (await supabaseRest("v_open_positions?select=*&order=market_value.desc&limit=250")) as Dict[];
  const assetIds = uniqueTerms(positions.map((row) => row.asset_id), 500);
  const brokerIds = uniqueTerms(positions.map((row) => row.broker_id), 500);
  const assets = assetIds.length
    ? ((await supabaseRest(`assets?select=id,name,isin,currency,asset_type&id=in.(${inList(assetIds)})`)) as Dict[])
    : [];
  const tags = assetIds.length
    ? ((await supabaseRest(`asset_tags?select=asset_id,tag,notes&asset_id=in.(${inList(assetIds)})`)) as Dict[])
    : [];
  const assignments = assetIds.length && brokerIds.length
    ? ((await supabaseRest(
        `virtual_portfolio_assignments?select=id,virtual_portfolio_id,asset_id,broker_id,target_weight,notes&asset_id=in.(${inList(assetIds)})`,
      )) as Dict[])
    : [];
  let virtualPortfolios: Dict[] = [];
  let strategies: Dict[] = [];
  try {
    virtualPortfolios = (await supabaseRest("virtual_portfolios?select=id,name,strategy_id,base_currency,notes")) as Dict[];
    strategies = (await supabaseRest(
      "portfolio_strategies?select=id,name,objective,target_return_min,target_return_max,target_income_spread_over_inflation",
    )) as Dict[];
  } catch {
    virtualPortfolios = [];
    strategies = [];
  }
  return { positions, assets, tags, assignments, virtual_portfolios: virtualPortfolios, strategies };
}

function compactReportPositions(context: Dict) {
  const assets = new Map(((context.assets as Dict[]) || []).map((asset) => [String(asset.id), asset]));
  const tagsByAsset = new Map<string, string[]>();
  for (const tag of ((context.tags as Dict[]) || [])) {
    const key = String(tag.asset_id);
    tagsByAsset.set(key, [...(tagsByAsset.get(key) || []), String(tag.tag)]);
  }
  return ((context.positions as Dict[]) || []).map((position) => {
    const asset = assets.get(String(position.asset_id)) || {};
    return {
      asset_id: position.asset_id,
      broker_id: position.broker_id,
      name: position.name || asset.name,
      type: position.asset_type || asset.asset_type,
      broker: position.broker,
      quantity: Number(position.quantity || 0),
      market_value_eur: Number(position.market_value || 0),
      cost_basis_eur: Number(position.cost_basis_naive || 0),
      latent_gain_eur: Number(position.market_value || 0) - Number(position.cost_basis_naive || 0),
      currency: position.price_currency || asset.currency,
      isin: asset.isin,
      tags: tagsByAsset.get(String(position.asset_id)) || [],
    };
  });
}

async function collectReportSearch(reportType: string, positions: Dict[]) {
  if (!BRAVE_SEARCH_API_KEY) throw new Error("BRAVE_SEARCH_API_KEY missing");
  const coreQueries =
    reportType === "etf_resilient_portfolio"
      ? [
          "global macro outlook inflation rates bonds equities commodities 2026",
          "ETF portfolio inflation income distribution long term outlook",
        ]
      : [
          "global market outlook equities bonds ETFs funds 2026",
          "Europe investor portfolio macro outlook inflation interest rates 2026",
        ];
  const names = positions
    .filter((position) => (reportType !== "etf_resilient_portfolio" ? true : position.type === "etf"))
    .slice(0, 6)
    .map((position) => String(position.name || ""))
    .filter(Boolean);
  const queries = [...coreQueries, ...names.map((name) => `${name} outlook dividend valuation`) ].slice(0, 8);
  const searches = [];
  for (const query of queries) searches.push(await braveSearch(query));
  return searches;
}

async function callOpenAIReport(reportType: string, prompt: string) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "Eres un analista financiero senior. Escribes en espanol claro, sobrio y accionable. " +
        "No des asesoramiento personalizado imperativo; separa hechos, inferencias e incertidumbre. " +
        "Usa Markdown breve con secciones y bullets. No inventes datos que no esten en el contexto.",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      store: false,
      temperature: 0.2,
      max_output_tokens: Math.min(OPENAI_REPORT_MAX_OUTPUT_TOKENS, 3500),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const directText = asString(data.output_text);
  if (directText) return directText;
  const outputText = ((data.output as Dict[]) || [])
    .flatMap((item) => ((item.content as Dict[]) || []))
    .filter((item) => item.type === "output_text")
    .map((item) => asString(item.text))
    .filter(Boolean)
    .join("\n\n");
  if (!outputText) throw new Error(`OpenAI no devolvio texto para ${reportType}`);
  return outputText;
}

async function generateReport(payload: Dict) {
  const reportType = asString(payload.report_type) || "portfolio_group_analysis";
  if (!["portfolio_group_analysis", "etf_resilient_portfolio", "rebalance_opportunity", "portfolio_periodic"].includes(reportType)) {
    throw new Error("report_type invalido");
  }
  const context = await loadReportContext();
  const positions = compactReportPositions(context);
  const webContext = await collectReportSearch(reportType, positions);
  const today = new Date().toISOString().slice(0, 10);
  const focus =
    reportType === "etf_resilient_portfolio"
      ? "Analiza solo la cartera de ETFs marcada como myinvestor_resilient_etf cuando exista. Evalua cada ETF y el conjunto frente al objetivo: cartera resistente a entornos macro, dividendo real inflacion +2% aproximado y crecimiento esperado +4/6% anual."
      : reportType === "rebalance_opportunity"
        ? "Detecta desviaciones de peso, concentraciones, carteras virtuales y posibles zonas de ponderacion. Usa balance inicial, pesos objetivo disponibles y cautela con precios."
        : "Analiza cartera actual por grupos: acciones, ETF y fondos, incluyendo concentracion, moneda, broker, P&G latente y riesgos principales.";
  const prompt =
    `${focus}\nFecha: ${today}\n\n` +
    `Contexto de cartera:\n${JSON.stringify({ ...context, positions }, null, 2)}\n\n` +
    `Resultados Brave:\n${JSON.stringify(webContext, null, 2)}\n\n` +
    "Devuelve: 1) resumen ejecutivo, 2) lectura por grupo o ETF, 3) riesgos y oportunidades, 4) datos que faltan para mejorar la precision.";
  const content = await callOpenAIReport(reportType, prompt);
  const rows = await supabaseRest("research_reports", {
    method: "POST",
    body: JSON.stringify({
      report_type: reportType,
      title: reportTitle(reportType),
      period_start: today,
      period_end: today,
      prompt,
      portfolio_context: { ...context, positions },
      web_context: webContext,
      content_markdown: content,
      model: OPENAI_MODEL,
    }),
  });
  return { status: "ok", report_id: rows?.[0]?.id, title: rows?.[0]?.title || reportTitle(reportType) };
}

async function yahooPriceHistory(symbol: string, years: number) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - Math.max(1, Math.min(20, years)) * 365 * 24 * 60 * 60;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("period1", String(start));
  url.searchParams.set("period2", String(now));
  url.searchParams.set("interval", "1d");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 PortfolioPriceHistory/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  const result = data.chart?.result?.[0] || {};
  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0]?.close || [];
  const currency = normalizeCurrency(result.meta?.currency || "EUR");
  return timestamps
    .map((timestamp: number, index: number) => ({
      priced_on: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
      close_price: Number(quotes[index] || 0),
      currency,
      provider: "yahoo",
      raw_payload: { symbol },
    }))
    .filter((row: Dict) => Number(row.close_price) > 0);
}

async function yahooCurrentQuote(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("range", "2d");
  url.searchParams.set("interval", "1d");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 PortfolioCurrentPrice/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yahoo ${symbol} ${response.status}: ${text.slice(0, 240)}`);
  if (!text.trim()) throw new Error(`Yahoo ${symbol} devolvio respuesta vacia`);
  const data = JSON.parse(text);
  const result = data.chart?.result?.[0] || {};
  const meta = result.meta || {};
  const price = Number(meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0);
  if (!price) throw new Error(`Yahoo ${symbol} no devolvio precio`);
  return {
    price,
    previous_close: meta.previousClose || meta.chartPreviousClose ? Number(meta.previousClose || meta.chartPreviousClose) : null,
    currency: normalizeCurrency(meta.currency || "EUR"),
    provider: "yahoo",
    raw_payload: { symbol, meta },
  };
}

const fxToEurCache = new Map<string, number>();

async function yahooFxToEur(currency: string) {
  const normalized = normalizeCurrency(currency);
  if (normalized === "EUR") return 1;
  const cached = fxToEurCache.get(normalized);
  if (cached) return cached;
  const quote = await yahooCurrentQuote(`${normalized}EUR=X`);
  if (!quote.price) throw new Error(`Sin cambio ${normalized}/EUR`);
  fxToEurCache.set(normalized, quote.price);
  return quote.price;
}

async function loadPriceIdentifiers(maxAssets: number) {
  const positions = (await supabaseRest(`v_open_positions?select=asset_id,name,asset_type&order=market_value.desc&limit=${maxAssets}`)) as Dict[];
  const assetIds = uniqueTerms(positions.map((row) => row.asset_id), maxAssets);
  const assets = assetIds.map((assetId) => positions.find((row) => String(row.asset_id) === assetId) || { asset_id: assetId });
  if (!assetIds.length) return { assetIds, assets, identifiers: [] as Dict[] };
  const identifiers = (await supabaseRest(
    `asset_identifiers?select=asset_id,provider,symbol,exchange,is_primary,valid_to&asset_id=in.(${inList(assetIds)})`,
  )) as Dict[];
  return { assetIds, assets, identifiers };
}

function priceSymbolsForAsset(assetId: string, identifiers: Dict[]) {
  const today = new Date().toISOString().slice(0, 10);
  return uniqueTerms(
    identifiers
      .filter(
        (row) =>
          String(row.asset_id) === assetId &&
          (!row.valid_to || String(row.valid_to) >= today) &&
          (row.provider === "yahoo" || row.provider === "manual"),
      )
      .sort((left, right) => {
        const priority = (row: Dict) =>
          row.provider === "yahoo" && row.is_primary ? 0 : row.provider === "yahoo" ? 1 : row.is_primary ? 2 : 3;
        return priority(left) - priority(right);
      })
      .map((row) => row.symbol),
    12,
  );
}

async function quoteWithFallback(symbols: string[]) {
  const attempts = [];
  for (const symbol of symbols) {
    try {
      return { symbol, quote: await yahooCurrentQuote(symbol) };
    } catch (error) {
      attempts.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(attempts.join(" | ") || "Sin ticker de precio");
}

async function historyWithFallback(symbols: string[], years: number) {
  const attempts = [];
  for (const symbol of symbols) {
    try {
      const history = await yahooPriceHistory(symbol, years);
      if (history.length) return { symbol, history };
      attempts.push(`${symbol}: sin historico`);
    } catch (error) {
      attempts.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(attempts.join(" | ") || "Sin ticker de precio");
}

async function refreshCurrentPrices(payload: Dict) {
  const maxAssets = Number(payload.max_assets || 250);
  const { assetIds, assets, identifiers } = await loadPriceIdentifiers(maxAssets);
  const rows = [];
  const errors = [];
  const skipped = [];
  for (const assetId of assetIds) {
    const asset = assets.find((row) => String(row.asset_id) === assetId) || {};
    const symbols = priceSymbolsForAsset(assetId, identifiers);
    if (!symbols.length) {
      if (asset.asset_type === "fund") {
        skipped.push({ asset_id: assetId, name: asset.name, asset_type: asset.asset_type, stage: "current", reason: "Valor liquidativo manual" });
        continue;
      }
      errors.push({ asset_id: assetId, name: asset.name, asset_type: asset.asset_type, stage: "current", error: "Sin ticker de precio" });
      continue;
    }
    try {
      const { symbol, quote } = await quoteWithFallback(symbols);
      const toEur = await yahooFxToEur(quote.currency);
      rows.push({
        asset_id: assetId,
        priced_at: new Date().toISOString(),
        price: quote.price,
        previous_close: quote.previous_close,
        currency: quote.currency,
        provider: quote.provider,
        raw_payload: { ...quote.raw_payload, to_eur: toEur, resolved_symbol: symbol },
      });
    } catch (error) {
      errors.push({
        asset_id: assetId,
        name: asset.name,
        asset_type: asset.asset_type,
        stage: "current",
        symbols,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (rows.length) {
    await supabaseRest("price_snapshots", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }
  return { assets: assetIds.length, rows: rows.length, errors, skipped };
}

async function refreshPriceHistory(payload: Dict) {
  const years = Number(payload.years || 5);
  const maxAssets = Number(payload.max_assets || 250);
  const { assetIds, assets, identifiers } = await loadPriceIdentifiers(maxAssets);
  if (!assetIds.length) return { status: "ok", assets: 0, rows: 0, errors: [], skipped: [] };
  const rows = [];
  const errors = [];
  const skipped = [];
  for (const assetId of assetIds) {
    const asset = assets.find((row) => String(row.asset_id) === assetId) || {};
    const symbols = priceSymbolsForAsset(assetId, identifiers);
    if (!symbols.length) {
      if (asset.asset_type === "fund") {
        skipped.push({ asset_id: assetId, name: asset.name, asset_type: asset.asset_type, stage: "history", reason: "Valor liquidativo manual" });
        continue;
      }
      errors.push({ asset_id: assetId, name: asset.name, asset_type: asset.asset_type, stage: "history", error: "Sin ticker de precio" });
      continue;
    }
    try {
      const { symbol, history } = await historyWithFallback(symbols, years);
      rows.push(...history.map((row: Dict) => ({ ...row, asset_id: assetId, raw_payload: { ...(row.raw_payload as Dict), resolved_symbol: symbol } })));
    } catch (error) {
      errors.push({
        asset_id: assetId,
        name: asset.name,
        asset_type: asset.asset_type,
        stage: "history",
        symbols,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (let index = 0; index < rows.length; index += 500) {
    await supabaseRest("asset_price_history?on_conflict=asset_id,priced_on,provider", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(index, index + 500)),
    });
  }
  return { status: "ok", assets: assetIds.length, rows: rows.length, errors, skipped };
}

async function saveManualPrice(payload: Dict) {
  const assetId = asString(payload.asset_id);
  const pricedOn = asString(payload.priced_on) || new Date().toISOString().slice(0, 10);
  const price = Number(payload.price);
  if (!assetId) throw new Error("Selecciona un activo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pricedOn)) throw new Error("Fecha de valor no valida");
  if (!Number.isFinite(price) || price <= 0) throw new Error("El valor debe ser mayor que cero");

  const assets = (await supabaseRest(`assets?select=id,name,currency&id=eq.${assetId}&limit=1`)) as Dict[];
  const asset = assets[0];
  if (!asset) throw new Error("Activo no encontrado");
  const currency = normalizeCurrency(payload.currency || asset.currency || "EUR");
  const toEur = await yahooFxToEur(currency);
  const rawPayload = { source: "manual_app", to_eur: toEur };

  await supabaseRest("price_snapshots?on_conflict=asset_id,priced_at,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      asset_id: assetId,
      priced_at: `${pricedOn}T12:00:00.000Z`,
      price,
      previous_close: null,
      currency,
      provider: "manual",
      raw_payload: rawPayload,
    }),
  });
  await supabaseRest("asset_price_history?on_conflict=asset_id,priced_on,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      asset_id: assetId,
      priced_on: pricedOn,
      close_price: price,
      currency,
      provider: "manual",
      raw_payload: rawPayload,
    }),
  });
  return { status: "ok", asset_id: assetId, name: asset.name, priced_on: pricedOn, price, currency, to_eur: toEur };
}

async function refreshPrices(payload: Dict) {
  const current = await refreshCurrentPrices(payload);
  const history = await refreshPriceHistory(payload);
  return {
    status: "ok",
    current,
    history,
    assets: current.assets,
    rows: history.rows,
    current_rows: current.rows,
    errors: [...current.errors, ...history.errors],
    skipped: [...current.skipped, ...history.skipped],
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await assertAuthenticated(request);
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/dividend-calendar/refresh")) {
      const payload = await request.json().catch(() => ({}));
      return jsonResponse(await refreshDividendCalendar(payload));
    }
    if (request.method === "POST" && url.pathname.endsWith("/reports/generate")) {
      const payload = await request.json().catch(() => ({}));
      return jsonResponse(await generateReport(payload));
    }
    if (request.method === "POST" && url.pathname.endsWith("/prices/history/refresh")) {
      const payload = await request.json().catch(() => ({}));
      return jsonResponse(await refreshPriceHistory(payload));
    }
    if (request.method === "POST" && url.pathname.endsWith("/prices/manual")) {
      const payload = await request.json().catch(() => ({}));
      return jsonResponse(await saveManualPrice(payload));
    }
    if (request.method === "POST" && url.pathname.endsWith("/prices/refresh")) {
      const payload = await request.json().catch(() => ({}));
      return jsonResponse(await refreshPrices(payload));
    }
    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

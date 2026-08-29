type Dict = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_BACKEND_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const BRAVE_SEARCH_API_KEY = requireEnv("BRAVE_SEARCH_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
const OPENAI_REPORT_MAX_OUTPUT_TOKENS = Number(Deno.env.get("OPENAI_REPORT_MAX_OUTPUT_TOKENS") || 3500);

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} missing`);
  return value;
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
  if (response.status === 204) return [];
  return response.json();
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
    `v_open_positions?select=*&asset_type=in.(stock,etf)&order=market_value.desc&limit=${maxPositions}`,
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
  return positions.map((row) => {
    const asset = assetsById.get(String(row.asset_id)) || {};
    const ids = identifiersByAsset.get(String(row.asset_id)) || [];
    const primary = ids.find((item) => item.is_primary);
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
  });
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
  const rows = [];
  for (const position of positions) {
    const search = await collectSearch(position, focus, maxWebResults);
    const aiEvents = await extractDividendEvents(position, search);
    let validEvents = aiEvents.filter((event) =>
      (event.payment_date || event.ex_date) && Number(event.dividend_amount || 0) > 0
    );
    if (!validEvents.length) {
      const estimated = await estimateEtfDistribution(position);
      if (estimated) validEvents = [estimated];
    }
    for (const event of validEvents) {
      rows.push(calendarRow(position, event, search));
    }
  }
  const assetIds = uniqueTerms(positions.map((position) => position.asset_id), 500);
  if (assetIds.length) {
    await supabaseRest(`dividend_calendar_events?asset_id=in.(${inList(assetIds)})`, { method: "DELETE" });
  }
  if (rows.length) {
    await supabaseRest(
      "dividend_calendar_events?on_conflict=asset_id,broker_id,ex_date,payment_date,dividend_amount,currency",
      { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) },
    );
  }
  return { status: "ok", positions: positions.length, events: rows.length };
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
    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

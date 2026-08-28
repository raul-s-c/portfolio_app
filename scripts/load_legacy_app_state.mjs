import fs from "node:fs";
import path from "node:path";

function loadDotenv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

function pickLegacyState(payload) {
  return {
    cash: payload.cash ?? {},
    wealth_rows: payload.wealth_rows ?? [],
    wealth_summary: payload.wealth_summary ?? [],
    etfs: payload.etfs ?? [],
    manual_prices: payload.manual_prices ?? [],
    quote_aliases: payload.quote_aliases ?? [],
    property: payload.property ?? [],
    skipped: payload.skipped ?? [],
    validation: payload.validation ?? {},
    summary: payload.summary ?? {},
    source_file: payload.source_file ?? "",
    loaded_at: new Date().toISOString(),
  };
}

async function upsertState(restUrl, serviceKey, state) {
  const response = await fetch(`${restUrl}/personal_app_state?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([{ key: "legacy_html_state", payload: state }]),
  });
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

loadDotenv();

const source = process.argv[2] ?? path.join("data", "legacy", "html_state.json");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
}

const legacyPayload = JSON.parse(fs.readFileSync(source, "utf8"));
const state = pickLegacyState(legacyPayload);
const rows = await upsertState(supabaseUrl.replace(/\/$/, "") + "/rest/v1", serviceKey, state);

console.log(
  `Loaded legacy app state: cash=${Object.keys(state.cash).length}, wealth_rows=${state.wealth_rows.length}, wealth_summary=${state.wealth_summary.length}.`
);
console.log(`Supabase row: ${rows[0]?.key ?? "legacy_html_state"}`);

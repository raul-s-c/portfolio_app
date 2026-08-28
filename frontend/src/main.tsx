import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
};

function App() {
  const [email, setEmail] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMessage(error ? error.message : "Login link sent");
  }

  async function loadPositions() {
    setLoading(true);
    const { data, error } = await supabase.from("v_open_positions").select("*");
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    setPositions((data ?? []) as Position[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPositions();
  }, []);

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
          <h1>Portfolio</h1>
          <p>Supabase-backed portfolio with stable asset IDs.</p>
        </div>
        <div className="login-box">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" />
          <button onClick={signIn}>Login</button>
        </div>
      </header>

      <section className="summary-grid">
        <article>
          <span>Market value</span>
          <strong>{totals.marketValue.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
        </article>
        <article>
          <span>Daily gain</span>
          <strong>{totals.dailyGain.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong>
        </article>
        <article>
          <span>Open positions</span>
          <strong>{positions.length}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Open positions</h2>
          <button onClick={loadPositions} disabled={loading}>{loading ? "Loading" : "Refresh"}</button>
        </div>
        {message && <p className="message">{message}</p>}
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Broker</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Yesterday</th>
              <th>Daily gain</th>
              <th>Market value</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr key={`${row.asset_id}-${row.broker_id}`}>
                <td>{row.name}</td>
                <td>{row.asset_type}</td>
                <td>{row.broker}</td>
                <td>{Number(row.quantity).toLocaleString("es-ES")}</td>
                <td>{formatMoney(row.price)}</td>
                <td>{formatMoney(row.previous_close)}</td>
                <td>{formatMoney(row.daily_gain)}</td>
                <td>{formatMoney(row.market_value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Subtotal</th>
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
      </section>
    </main>
  );
}

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

createRoot(document.getElementById("root")!).render(<App />);

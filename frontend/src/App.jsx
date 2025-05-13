// src/App.jsx
import React, { useState, useEffect, useRef } from "react";

export default function App() {
  // ▶︎ STATE
  const [rawInput, setRawInput] = useState("");          // what you type in the textarea
  const [symbols, setSymbols] = useState([]);            // ["TSLA","AAPL",...]
  const [tickers, setTickers] = useState({});            // { TSLA: { price, hod, lod, vwap }, ... }
  const [customStops, setCustomStops] = useState({});    // { TSLA: "318", AAPL: "" }
  const [limitPrices, setLimitPrices] = useState({});    // { TSLA: "319", ... }
  const [orders, setOrders] = useState([]);              // [{ orderId, symbol, side, qty, limit, status }, ...]
  const [error, setError] = useState(null);

  const pollRef = useRef();                              // store interval ID

  // ▶︎ HELPERS
  function parseSymbols(text) {
    return Array.from(
      new Set(
        text
          .split(/[\s,]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }

  // clear out old data, set new list of symbols, kick off polling
  function subscribe() {
    const list = parseSymbols(rawInput);
    setSymbols(list);
    setTickers({});
    setCustomStops({});
    setLimitPrices({});
    setError(null);

    // fetch immediately, then every 2s
    fetchTickers(list);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchTickers(list), 2000);
  }

  async function fetchTickers(list) {
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list, testMode: true }),
      });
      if (!res.ok) throw new Error(`Price fetch error: ${res.status}`);
      const data = await res.json();
      setTickers(data); 
    } catch (e) {
      setError(e.message);
    }
  }

  async function fetchOrders() {
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error(`Orders fetch error: ${res.status}`);
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error(e);
    }
  }

  // place market/limit order
  async function doOrder(symbol, side, qty, limit, stop) {
    const ok = window.confirm(
      `${side} ${qty}× ${symbol}` +
        (limit ? ` @ ${limit}` : " MARKET") +
        (stop ? `, stop @ ${stop}` : "")
    );
    if (!ok) return;

    const payload = { symbol, side, qty };
    if (limit) payload.limit = limit;
    if (stop) payload.stop = stop;

    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert(`Order error: ${res.status}`);
    } else {
      const info = await res.json();
      alert(`✅ Order placed:\n${JSON.stringify(info,null,2)}`);
      fetchOrders();
    }
  }

  // cancel
  async function cancelOrder(id) {
    if (!window.confirm(`Cancel order ${id}?`)) return;
    const res = await fetch(`/api/order/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert(`Cancel failed: ${res.status}`);
    } else {
      fetchOrders();
    }
  }

  // ▶︎ LIFECYCLE
  useEffect(() => {
    // on mount, load existing orders
    fetchOrders();
    return () => clearInterval(pollRef.current);
  }, []);

  // ▶︎ RENDER
  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>IB Watchlist (Streaming + Orders)</h1>

      <textarea
        rows={2}
        style={{ width: "100%" }}
        placeholder="TSLA, AAPL, MSFT…"
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
      />

      <div style={{ margin: "8px 0" }}>
        <label>
          <input
            type="checkbox"
            defaultChecked
            disabled
          />{" "}
          Test mode (overnight as RTH)
        </label>{" "}
        <button onClick={subscribe}>Set & Subscribe</button>
      </div>

      {error && (
        <div style={{ color: "firebrick" }}>
          {error}
        </div>
      )}

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 20,
        }}
      >
        <thead>
          <tr>
            <th align="left">Symbol</th>
            <th align="right">Price</th>
            <th align="center">HOD (S)</th>
            <th align="center">LOD (B)</th>
            <th align="center">VWAP (B/S)</th>
            <th align="center">Custom</th>
            <th align="center">Limit</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((sym) => {
            const t = tickers[sym] || {};
            const qty = Math.floor((200 / (t.last - t.hod || 1)) / 10) * 10;
            return (
              <tr key={sym}>
                <td>{sym}</td>
                <td align="right">{t.last ?? "—"}</td>
                <td align="center">
                  {t.hod ?? "—"}{" "}
                  <button
                    onClick={() =>
                      doOrder(sym, "SELL", qty, null, t.hod)
                    }
                    disabled={!t.hod || t.last >= t.hod}
                  >
                    S
                  </button>
                </td>
                <td align="center">
                  {t.lod ?? "—"}{" "}
                  <button
                    onClick={() => doOrder(sym, "BUY", qty, null, t.lod)}
                    disabled={!t.lod || t.last <= t.lod}
                  >
                    B
                  </button>
                </td>
                <td align="center">
                  {t.vwap ?? "—"}{" "}
                  <button
                    onClick={() =>
                      doOrder(sym, "BUY", qty, null, t.vwap)
                    }
                    disabled={!t.vwap}
                  >
                    B
                  </button>{" "}
                  <button
                    onClick={() =>
                      doOrder(sym, "SELL", qty, null, t.vwap)
                    }
                    disabled={!t.vwap}
                  >
                    S
                  </button>
                </td>
                <td align="center">
                  <input
                    type="number"
                    style={{ width: 60 }}
                    value={customStops[sym] || ""}
                    onChange={(e) =>
                      setCustomStops((p) => ({
                        ...p,
                        [sym]: e.target.value,
                      }))
                    }
                  />{" "}
                  <button
                    onClick={() =>
                      doOrder(sym, "SELL", qty, null, customStops[sym])
                    }
                    disabled={!customStops[sym]}
                  >
                    S
                  </button>
                </td>
                <td align="center">
                  <input
                    type="number"
                    style={{ width: 60 }}
                    value={limitPrices[sym] || ""}
                    onChange={(e) =>
                      setLimitPrices((p) => ({
                        ...p,
                        [sym]: e.target.value,
                      }))
                    }
                  />{" "}
                  <button
                    onClick={() =>
                      doOrder(sym, "BUY", qty, limitPrices[sym], null)
                    }
                    disabled={!limitPrices[sym]}
                  >
                    limit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 style={{ marginTop: 40 }}>Open Orders</h2>
      <button onClick={fetchOrders}>⟳ Refresh</button>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 8,
        }}
      >
        <thead>
          <tr>
            <th>ID</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Limit</th>
            <th>Status</th>
            <th>Cancel</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colSpan={7} align="center">
                No open orders
              </td>
            </tr>
          ) : (
            orders.map((o) => (
              <tr key={o.orderId}>
                <td>{o.orderId}</td>
                <td>{o.symbol}</td>
                <td>{o.side}</td>
                <td>{o.qty}</td>
                <td>{o.limit ?? "MKT"}</td>
                <td>{o.status}</td>
                <td>
                  <button onClick={() => cancelOrder(o.orderId)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

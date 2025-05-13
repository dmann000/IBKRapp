import React, { useState, useEffect } from 'react';

export default function App() {
  const [input, setInput] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // poll every 2s once subscribed
  useEffect(() => {
    if (!subscribed) return;
    const id = setInterval(fetchPrices, 2000);
    fetchPrices();
    return () => clearInterval(id);
  }, [subscribed]);

  async function fetchPrices() {
    try {
      const resp = await fetch('/api/watchlist');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(`Fetch error: ${e.message}`);
    }
  }

  async function updateAndSubscribe() {
    setError('');
    setLoading(true);
    setSubscribed(false);

    const syms = input
      .split(/[\s,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    try {
      const resp = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: syms, testMode })
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      setSubscribed(true);
    } catch (e) {
      setError(`Subscription error: ${e.message}`);
      setData({});
    } finally {
      setLoading(false);
    }
  }

  async function handleOrder(symbol, side, ref) {
    try {
      const resp = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, ref })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const o = await resp.json();
      alert(
        `${side === 'BUY' ? '🟢 Long' : '🔴 Short'} ${o.quantity} of ${o.symbol} @ ${o.entryPrice.toFixed(2)}\n` +
        `Stop @ ${o.stopPrice.toFixed(2)}\nOrder ID: ${o.orderId}`
      );
    } catch (e) {
      alert(`Order error: ${e.message}`);
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>IB Watchlist (Streaming)</h1>

      <textarea
        rows={2}
        style={{ width: '100%', fontSize: '1rem' }}
        placeholder="TSLA, AAPL, MSFT"
        value={input}
        onChange={e => setInput(e.target.value)}
      />

      <div style={{ margin: '0.5rem 0' }}>
        <label>
          <input
            type="checkbox"
            checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
          />{' '}
          Test mode (overnight as RTH)
        </label>
      </div>

      <button
        onClick={updateAndSubscribe}
        disabled={loading || !input.trim()}
        style={{ padding: '0.5rem 1rem' }}
      >
        {loading ? 'Subscribing…' : 'Set & Subscribe'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {subscribed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                Symbol
              </th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                Price
              </th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                HOD (S)
              </th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                LOD (B)
              </th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                VWAP (B/S)
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data).map(([sym, e]) => (
              <tr key={sym}>
                <td style={{ padding: '0.5rem 0' }}>{sym}</td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                  {e.price != null ? e.price.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                  {e.hod != null ? e.hod.toFixed(2) : '—'}{' '}
                  <button
                    onClick={() => handleOrder(sym, 'SELL', 'HOD')}
                    disabled={!e.hod}
                  >
                    S
                  </button>
                </td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                  {e.lod != null ? e.lod.toFixed(2) : '—'}{' '}
                  <button
                    onClick={() => handleOrder(sym, 'BUY', 'LOD')}
                    disabled={!e.lod}
                  >
                    B
                  </button>
                </td>
                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                  {e.vwap != null ? e.vwap.toFixed(2) : '—'}{' '}
                  <button
                    onClick={() => handleOrder(sym, 'BUY', 'VWAP')}
                    disabled={!e.vwap}
                  >
                    B
                  </button>{' '}
                  <button
                    onClick={() => handleOrder(sym, 'SELL', 'VWAP')}
                    disabled={!e.vwap}
                  >
                    S
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

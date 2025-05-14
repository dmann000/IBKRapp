import React, { useState, useEffect } from 'react';

export default function App() {
  const [input, setInput] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [symbols, setSymbols] = useState([]);   // your watchlist
  const [data, setData] = useState({});         // live price data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // Open WebSocket once on mount, to FastAPI at :8000
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/watchlist');

    ws.onopen = () => {
      console.log('WS connected');
    };

    ws.onmessage = (evt) => {
      try {
        const snapshot = JSON.parse(evt.data);
        setData(snapshot);
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error', err);
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      console.log('WS closed');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Trigger subscription via HTTP and record symbols
  async function updateAndSubscribe() {
    setError('');
    setLoading(true);
    setSubscribed(false);

    const syms = input
      .split(/[\s,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    if (syms.length === 0) {
      setError('Enter at least one symbol');
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch('http://localhost:8000/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: syms, testMode })
      });

      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }

      setSymbols(syms);
      setSubscribed(true);
    } catch (e) {
      console.error('Subscription error', e);
      setError(`Subscribe failed: ${e.message}`);
      setSymbols([]);
      setData({});
    } finally {
      setLoading(false);
    }
  }

  // Place a BUY/SELL order
  async function handleOrder(symbol, side, ref) {
    try {
      const resp = await fetch('http://localhost:8000/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, ref })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const o = await resp.json();
      alert(
        `${side === 'BUY' ? '🟢 Long' : '🔴 Short'} ${o.quantity} of ${o.symbol} @ ${o.entryPrice.toFixed(2)}\n` +
        `Stop @ ${o.stopPrice.toFixed(2)}\nOrder ID: ${o.orderId}`
      );
    } catch (e) {
      console.error('Order error', e);
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
        disabled={loading}
        style={{ padding: '0.5rem 1rem' }}
      >
        {loading ? 'Subscribing…' : 'Set & Subscribe'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {subscribed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Symbol</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Price</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>HOD (S)</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>LOD (B)</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>VWAP (B/S)</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map(sym => {
              const e = data[sym] || {};
              return (
                <tr key={sym}>
                  <td style={{ padding: '0.5rem 0' }}>{sym}</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                    {e.price != null ? e.price.toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                    {e.hod != null ? e.hod.toFixed(2) : '—'}{' '}
                    <button onClick={() => handleOrder(sym, 'SELL', 'HOD')} disabled={!e.hod}>
                      S
                    </button>
                  </td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                    {e.lod != null ? e.lod.toFixed(2) : '—'}{' '}
                    <button onClick={() => handleOrder(sym, 'BUY', 'LOD')} disabled={!e.lod}>
                      B
                    </button>
                  </td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>
                    {e.vwap != null ? e.vwap.toFixed(2) : '—'}{' '}
                    <button onClick={() => handleOrder(sym, 'BUY', 'VWAP')} disabled={!e.vwap}>
                      B
                    </button>{' '}
                    <button onClick={() => handleOrder(sym, 'SELL', 'VWAP')} disabled={!e.vwap}>
                      S
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

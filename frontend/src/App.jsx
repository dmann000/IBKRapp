import React, { useState, useEffect } from 'react';

export default function App() {
  const [input, setInput] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [symbols, setSymbols] = useState([]);
  const [data, setData] = useState({});
  const [customStops, setCustomStops] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/watchlist');
    ws.onmessage = (evt) => {
      try {
        setData(JSON.parse(evt.data));
      } catch {}
    };
    ws.onerror = () => setError('WebSocket error');
    return () => ws.close();
  }, []);

  async function updateAndSubscribe() {
    setError('');
    setLoading(true);
    setSubscribed(false);

    const syms = input
      .split(/[\s,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    if (!syms.length) {
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
      if (!resp.ok) throw new Error(`Status ${resp.status}`);

      setSymbols(syms);
      // reset custom stops
      const initial = {};
      syms.forEach(s => initial[s] = '');
      setCustomStops(initial);
      setSubscribed(true);
    } catch (e) {
      setError(`Subscribe failed: ${e.message}`);
      setSymbols([]);
      setData({});
    } finally {
      setLoading(false);
    }
  }

  async function handleOrder(symbol, side, ref, customStop = null) {
    try {
      const body = { symbol, side, ref };
      if (ref === 'CUSTOM') body.customStop = parseFloat(customStop);
      const resp = await fetch('http://localhost:8000/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const o = await resp.json();
      alert(
        `${side === 'BUY' ? 'Long' : 'Short'} ${o.quantity} of ${o.symbol} @ ${o.entryPrice.toFixed(2)}\n` +
        `Stop @ ${o.stopPrice.toFixed(2)}`
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

      <button onClick={updateAndSubscribe} disabled={loading}>
        {loading ? 'Subscribing…' : 'Set & Subscribe'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {subscribed && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Symbol</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>Price</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>HOD</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>LOD</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>VWAP</th>
              <th style={{ textAlign: 'center', borderBottom: '1px solid #ccc' }}>Custom</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map(sym => {
              const e = data[sym] || {};
              return (
                <tr key={sym}>
                  <td>{sym}</td>
                  <td style={{ textAlign: 'right' }}>
                    {e.price != null ? e.price.toFixed(2) : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.hod != null ? e.hod.toFixed(2) : '—'}&nbsp;
                    <button
                      disabled={!e.hod}
                      onClick={() => handleOrder(sym, 'SELL', 'HOD')}
                    >S</button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.lod != null ? e.lod.toFixed(2) : '—'}&nbsp;
                    <button
                      disabled={!e.lod}
                      onClick={() => handleOrder(sym, 'BUY', 'LOD')}
                    >B</button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.vwap != null ? e.vwap.toFixed(2) : '—'}&nbsp;
                    <button
                      disabled={!e.vwap}
                      onClick={() => handleOrder(sym, 'BUY', 'VWAP')}
                    >B</button>&nbsp;
                    <button
                      disabled={!e.vwap}
                      onClick={() => handleOrder(sym, 'SELL', 'VWAP')}
                    >S</button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={customStops[sym]}
                      onChange={e =>
                        setCustomStops({
                          ...customStops,
                          [sym]: e.target.value
                        })
                      }
                      style={{ width: 70 }}
                    />&nbsp;
                    <button
                      disabled={!customStops[sym]}
                      onClick={() => handleOrder(sym, 'BUY', 'CUSTOM', customStops[sym])}
                    >B</button>&nbsp;
                    <button
                      disabled={!customStops[sym]}
                      onClick={() => handleOrder(sym, 'SELL', 'CUSTOM', customStops[sym])}
                    >S</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

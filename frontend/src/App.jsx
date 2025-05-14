import React, { useState, useEffect } from 'react';

export default function App() {
  const [input, setInput] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [symbols, setSymbols] = useState([]);
  const [data, setData] = useState({});
  const [customStops, setCustomStops] = useState({});
  const [orders, setOrders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // WebSocket for live prices
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/watchlist');
    ws.onmessage = evt => {
      try { setData(JSON.parse(evt.data)); }
      catch {}
    };
    ws.onerror = () => setError('WebSocket error');
    return () => ws.close();
  }, []);

  // fetch orders & positions every 5s once subscribed
  useEffect(() => {
    if (!subscribed) return;
    fetchOrders();
    fetchPositions();
    const id = setInterval(() => {
      fetchOrders();
      fetchPositions();
    }, 5000);
    return () => clearInterval(id);
  }, [subscribed]);

  async function fetchOrders() {
    try {
      const resp = await fetch('http://localhost:8000/api/orders');
      setOrders(await resp.json());
    } catch {}
  }

  async function fetchPositions() {
    try {
      const resp = await fetch('http://localhost:8000/api/positions');
      setPositions(await resp.json());
    } catch {}
  }

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
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ symbols: syms, testMode })
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);

      setSymbols(syms);
      // reset custom stops
      const stops = {};
      syms.forEach(s=>stops[s]='');
      setCustomStops(stops);

      setSubscribed(true);
    } catch (e) {
      setError(`Subscribe failed: ${e.message}`);
      setSymbols([]);
      setData({});
    } finally {
      setLoading(false);
    }
  }

  async function handleOrder(symbol, side, ref, customStop=null) {
    try {
      const body = { symbol, side, ref };
      if (ref==='CUSTOM') body.customStop = parseFloat(customStop);
      const resp = await fetch('http://localhost:8000/api/order', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      alert('Order placed');
    } catch (e) {
      alert(`Order error: ${e.message}`);
    }
  }

  return (
    <div style={{ padding:20, fontFamily:'sans-serif' }}>
      <h1>IB Watchlist (Streaming)</h1>

      <textarea
        rows={2} style={{ width:'100%', fontSize:'1rem' }}
        placeholder="TSLA, MSFT, AAPL"
        value={input}
        onChange={e=>setInput(e.target.value)}
      />

      <label>
        <input
          type="checkbox"
          checked={testMode}
          onChange={e=>setTestMode(e.target.checked)}
        /> Test mode (overnight as RTH)
      </label>

      <button onClick={updateAndSubscribe} disabled={loading}>
        {loading ? 'Subscribing…' : 'Set & Subscribe'}
      </button>
      {error && <p style={{ color:'red' }}>{error}</p>}

      {subscribed && (
        <>
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:20 }}>
            <thead>
              <tr>
                <th>Symbol</th><th>Price</th><th>HOD</th><th>LOD</th><th>VWAP</th><th>Custom</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map(sym => {
                const e = data[sym]||{};
                return (
                  <tr key={sym}>
                    <td>{sym}</td>
                    <td style={{ textAlign:'right' }}>
                      {e.price!=null ? e.price.toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign:'right' }}>
                      {e.hod!=null ? e.hod.toFixed(2) : '—'}{' '}
                      <button disabled={!e.hod} onClick={()=>handleOrder(sym,'SELL','HOD')}>S</button>
                    </td>
                    <td style={{ textAlign:'right' }}>
                      {e.lod!=null ? e.lod.toFixed(2) : '—'}{' '}
                      <button disabled={!e.lod} onClick={()=>handleOrder(sym,'BUY','LOD')}>B</button>
                    </td>
                    <td style={{ textAlign:'right' }}>
                      {e.vwap!=null ? e.vwap.toFixed(2) : '—'}{' '}
                      <button disabled={!e.vwap} onClick={()=>handleOrder(sym,'BUY','VWAP')}>B</button>{' '}
                      <button disabled={!e.vwap} onClick={()=>handleOrder(sym,'SELL','VWAP')}>S</button>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <input
                        type="number" step="0.01" style={{ width:70 }}
                        value={customStops[sym]||''}
                        onChange={e=>setCustomStops({...customStops, [sym]:e.target.value})}
                      />{' '}
                      <button disabled={!customStops[sym]} onClick={()=>handleOrder(sym,'BUY','CUSTOM',customStops[sym])}>B</button>{' '}
                      <button disabled={!customStops[sym]} onClick={()=>handleOrder(sym,'SELL','CUSTOM',customStops[sym])}>S</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2 style={{ marginTop:40 }}>Open & Filled Orders</h2>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th>Order ID</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Filled</th><th>Avg Fill</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.orderId}>
                  <td>{o.orderId}</td>
                  <td>{o.symbol}</td>
                  <td>{o.side}</td>
                  <td>{o.quantity}</td>
                  <td>{o.filled}</td>
                  <td>{o.avgFillPrice?.toFixed(2)||'—'}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ marginTop:40 }}>Positions (Unrealized P/L)</h2>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th>Symbol</th><th>Position</th><th>Avg Cost</th><th>Price</th><th>Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td>{p.position}</td>
                  <td>{p.avgCost.toFixed(2)}</td>
                  <td>{p.price.toFixed(2)}</td>
                  <td>{p.unrealizedPL.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

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
    } catch (e) {
      alert(`Order error: ${e.message}`);
    }
  }

  // uniform centered cell style
  const cellStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'center' };
  const headerStyle = { ...cellStyle, background: '#f8f8f8', fontWeight: 'bold' };

  return (
    <div style={{ padding:20, fontFamily:'sans-serif' }}>
      <h1>IB Watchlist (Streaming)</h1>

      <textarea
        rows={2} style={{ width:'100%', fontSize:'1rem' }}
        placeholder="TSLA, MSFT, AAPL"
        value={input}
        onChange={e=>setInput(e.target.value)}
      />

      <div style={{ margin: '0.5rem 0' }}>
        <label>
          <input
            type="checkbox"
            checked={testMode}
            onChange={e=>setTestMode(e.target.checked)}
          /> Test mode (overnight as RTH)
        </label>
        <button onClick={updateAndSubscribe} disabled={loading} style={{ marginLeft: '1rem' }}>
          {loading ? 'Subscribing…' : 'Set & Subscribe'}
        </button>
      </div>
      {error && <p style={{ color:'red' }}>{error}</p>}

      {subscribed && (
        <>
          {/* Watchlist Table */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:20 }}>
            <thead>
              <tr>
                <th style={headerStyle}>Symbol</th>
                <th style={headerStyle}>Price</th>
                <th style={headerStyle}>HOD</th>
                <th style={headerStyle}>LOD</th>
                <th style={headerStyle}>VWAP</th>
                <th style={headerStyle}>Custom</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map(sym => {
                const e = data[sym]||{};
                return (
                  <tr key={sym}>
                    <td style={cellStyle}>{sym}</td>
                    <td style={cellStyle}>{e.price!=null ? e.price.toFixed(2) : '—'}</td>
                    <td style={cellStyle}>
                      {e.hod!=null ? e.hod.toFixed(2) : '—'}{' '}
                      <button disabled={!e.hod} onClick={()=>handleOrder(sym,'SELL','HOD')}>S</button>
                    </td>
                    <td style={cellStyle}>
                      {e.lod!=null ? e.lod.toFixed(2) : '—'}{' '}
                      <button disabled={!e.lod} onClick={()=>handleOrder(sym,'BUY','LOD')}>B</button>
                    </td>
                    <td style={cellStyle}>
                      {e.vwap!=null ? e.vwap.toFixed(2) : '—'}{' '}
                      <button disabled={!e.vwap} onClick={()=>handleOrder(sym,'BUY','VWAP')}>B</button>{' '}
                      <button disabled={!e.vwap} onClick={()=>handleOrder(sym,'SELL','VWAP')}>S</button>
                    </td>
                    <td style={cellStyle}>
                      <input
                        type="number" step="0.01" style={{ width:70, textAlign:'center' }}
                        value={customStops[sym]||''}
                        onChange={e=>setCustomStops({...customStops,[sym]:e.target.value})}
                      />{' '}
                      <button disabled={!customStops[sym]} onClick={()=>handleOrder(sym,'BUY','CUSTOM',customStops[sym])}>B</button>{' '}
                      <button disabled={!customStops[sym]} onClick={()=>handleOrder(sym,'SELL','CUSTOM',customStops[sym])}>S</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Orders Table */}
          <h2 style={{ marginTop:40 }}>Open & Filled Orders</h2>
          <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #ccc' }}>
            <thead>
              <tr>
                <th style={headerStyle}>Order ID</th>
                <th style={headerStyle}>Symbol</th>
                <th style={headerStyle}>Side</th>
                <th style={headerStyle}>Qty</th>
                <th style={headerStyle}>Filled</th>
                <th style={headerStyle}>Avg Fill</th>
                <th style={headerStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.orderId}>
                  <td style={cellStyle}>{o.orderId}</td>
                  <td style={cellStyle}>{o.symbol}</td>
                  <td style={cellStyle}>{o.side}</td>
                  <td style={cellStyle}>{o.quantity}</td>
                  <td style={cellStyle}>{o.filled}</td>
                  <td style={cellStyle}>{o.avgFillPrice?.toFixed(2)||'—'}</td>
                  <td style={cellStyle}>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Positions Table */}
          <h2 style={{ marginTop:40 }}>Positions (Unrealized P/L)</h2>
          <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #ccc' }}>
            <thead>
              <tr>
                <th style={headerStyle}>Symbol</th>
                <th style={headerStyle}>Position</th>
                <th style={headerStyle}>Avg Cost</th>
                <th style={headerStyle}>Price</th>
                <th style={headerStyle}>Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.symbol}>
                  <td style={cellStyle}>{p.symbol}</td>
                  <td style={cellStyle}>{p.position}</td>
                  <td style={cellStyle}>{p.avgCost.toFixed(2)}</td>
                  <td style={cellStyle}>{p.price.toFixed(2)}</td>
                  <td style={cellStyle}>{p.unrealizedPL.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
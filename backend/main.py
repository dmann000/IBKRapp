import math
import asyncio
import traceback
import json
from threading import Thread
from datetime import datetime, time as dt_time
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ib_insync import IB, Stock, MarketOrder, Position, Trade

# --- App & CORS setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # adjust if your React origin differs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ib = IB()

TRADING_START = dt_time(9, 30)
TRADING_END   = dt_time(16, 0)

# in-memory state
symbol_data: dict[str, dict] = {}
current_contracts: list[Stock] = []
clients: set[WebSocket] = set()


def _on_pending_tickers(tickers):
    """Update price/HOD/LOD/VWAP then broadcast snapshot."""
    now = datetime.now().time()
    for t in tickers:
        sym = t.contract.symbol
        entry = symbol_data.get(sym)
        if not entry:
            continue

        in_rth = entry["testMode"] or (TRADING_START <= now <= TRADING_END)
        p = t.last if isinstance(t.last, (int, float)) else t.marketPrice()
        if not (isinstance(p, (int, float)) and math.isfinite(p)):
            continue

        entry["price"] = p
        if in_rth and entry["hod"] is None:
            entry["hod"] = p
            entry["lod"] = p

        if in_rth:
            if p > entry["hod"]:
                entry["hod"] = p
            if p < entry["lod"]:
                entry["lod"] = p
            size = getattr(t, "lastSize", 0) or 0
            if size > 0:
                entry["vwap_num"] += p * size
                entry["vwap_den"] += size
                entry["vwap"] = entry["vwap_num"] / entry["vwap_den"]

    asyncio.run_coroutine_threadsafe(_broadcast_update(), ib.loop)


async def _broadcast_update():
    payload = {
        sym: {
            "price": entry["price"],
            "hod":   entry["hod"],
            "lod":   entry["lod"],
            "vwap":  entry["vwap"],
        }
        for sym, entry in symbol_data.items()
    }
    data = json.dumps(payload)
    to_remove = set()
    for ws in clients:
        try:
            await ws.send_text(data)
        except:
            to_remove.add(ws)
    for ws in to_remove:
        clients.discard(ws)


def _ib_worker():
    loop = asyncio.new_event_loop()
    ib.loop = loop
    asyncio.set_event_loop(loop)

    print("⏳ Connecting to IB Gateway (paper) on port 4002…")
    try:
        ib.connect("127.0.0.1", 4002, clientId=1, timeout=20)
        print("✅ Connected to IB Gateway.")
        ib.reqMarketDataType(4)
    except Exception as e:
        print("❌ IB connection failed:", e)
        traceback.print_exc()
        return

    ib.pendingTickersEvent += _on_pending_tickers
    loop.run_forever()


@app.on_event("startup")
def startup_event():
    Thread(target=_ib_worker, daemon=True).start()


# ————— Models —————

class WatchlistReq(BaseModel):
    symbols: list[str]
    testMode: bool = False


class OrderReq(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    ref: Literal["HOD", "LOD", "VWAP", "CUSTOM"]
    customStop: Optional[float] = None


# ————— Subscription —————

async def _subscribe(req: WatchlistReq):
    # clear existing subscriptions
    for c in current_contracts:
        ib.cancelMktData(c)
    current_contracts.clear()
    symbol_data.clear()

    # initialize state
    for raw in req.symbols:
        sym = raw.strip().upper()
        symbol_data[sym] = {
            "price": None,
            "hod":   None,
            "lod":   None,
            "vwap_num": 0.0,
            "vwap_den": 0.0,
            "vwap": None,
            "testMode": req.testMode
        }

    # qualify and subscribe
    contracts = [Stock(sym, "SMART", "USD") for sym in symbol_data]
    await ib.qualifyContractsAsync(*contracts)
    for c in contracts:
        ib.reqMktData(c, "", snapshot=True, regulatorySnapshot=False)
        ib.reqMktData(c, "", snapshot=False, regulatorySnapshot=False)
        current_contracts.append(c)


# ————— HTTP Endpoints —————

@app.post("/api/watchlist")
def update_watchlist(req: WatchlistReq):
    if not ib.isConnected():
        raise HTTPException(503, "IB Gateway not connected")
    if not req.symbols:
        raise HTTPException(400, "No symbols provided")

    try:
        fut = asyncio.run_coroutine_threadsafe(_subscribe(req), ib.loop)
        fut.result(timeout=15)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Subscription error: {e}")

    return {"status": "subscribed", "symbols": req.symbols, "testMode": req.testMode}


@app.get("/api/watchlist")
def get_watchlist():
    return {
        sym: {
            "price": entry["price"],
            "hod":   entry["hod"],
            "lod":   entry["lod"],
            "vwap":  entry["vwap"],
        }
        for sym, entry in symbol_data.items()
    }


@app.post("/api/order")
def place_order(req: OrderReq):
    if not ib.isConnected():
        raise HTTPException(503, "IB Gateway not connected")
    try:
        fut = asyncio.run_coroutine_threadsafe(
            _do_order(req.symbol.strip().upper(), req.side, req.ref, req.customStop),
            ib.loop
        )
        return fut.result(timeout=10)
    except ValueError as ve:
        raise HTTPException(400, str(ve))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Order error: {e}")


async def _do_order(symbol: str, side: str, ref: str, customStop: Optional[float]):
    entry = symbol_data.get(symbol)
    if not entry:
        raise ValueError(f"{symbol} not in watchlist")
    price = entry["price"]
    if price is None:
        raise ValueError("Current price not available")

    # pick stop & risk
    if ref == "CUSTOM":
        if customStop is None:
            raise ValueError("customStop required for CUSTOM stop")
        stop = customStop
        risk = (stop - price) if side == "SELL" else (price - stop)
    else:
        stop = entry["hod"] if ref == "HOD" else entry["lod"] if ref == "LOD" else entry["vwap"]
        risk = (stop - price) if side == "SELL" else (price - stop)

    if stop is None:
        raise ValueError(f"No reference price for {ref}")
    if not (isinstance(risk, (int, float)) and risk > 0):
        risk = 0.01

    qty = max((int(200 // risk) // 10) * 10, 10)
    contract = Stock(symbol, "SMART", "USD")
    await ib.qualifyContractsAsync(contract)
    order = MarketOrder(side, qty)
    ib.placeOrder(contract, order)

    return {
        "symbol": symbol,
        "side": side,
        "ref": ref,
        "quantity": qty,
        "entryPrice": price,
        "stopPrice": stop,
        "orderId": order.orderId
    }


# ————— Order & Position Endpoints —————

@app.get("/api/orders")
def get_orders():
    orders = []
    for trade in ib.trades():
        o = trade.order
        status = trade.orderStatus.status
        orders.append({
            "orderId": o.orderId,
            "symbol":  trade.contract.symbol,
            "side":    o.action,
            "quantity": o.totalQuantity,
            "filled": trade.orderStatus.filled,
            "avgFillPrice": trade.orderStatus.avgFillPrice,
            "status": status
        })
    return orders


@app.get("/api/positions")
def get_positions():
    positions = []
    for pos in ib.positions():
        sym = pos.contract.symbol
        qty = pos.position
        avgCost = pos.avgCost
        price = symbol_data.get(sym, {}).get("price") or 0
        unrealizedPL = (price - avgCost) * qty
        positions.append({
            "symbol": sym,
            "position": qty,
            "avgCost": avgCost,
            "price": price,
            "unrealizedPL": unrealizedPL
        })
    return positions


@app.websocket("/ws/watchlist")
async def watchlist_ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)

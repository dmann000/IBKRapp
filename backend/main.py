# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ib_insync import IB, Stock, LimitOrder, MarketOrder
import asyncio, math

app = FastAPI()
ib = IB()

@app.on_event("startup")
async def startup():
    await ib.connectAsync("127.0.0.1", 4002, clientId=1)
    print("✅ Connected to IB Gateway.")

@app.on_event("shutdown")
def shutdown():
    ib.disconnect()
    print("👋 Disconnected from IB Gateway.")

class WatchlistRequest(BaseModel):
    symbols: List[str]
    testMode: bool = True

class OrderRequest(BaseModel):
    symbol: str
    side:   str    # "BUY" or "SELL"
    qty:    float
    limit:  Optional[float] = None
    stop:   Optional[float] = None

def cleanFloat(x):
    if x is None or not isinstance(x, (int, float)):
        return None
    if not math.isfinite(x):
        return None
    return x

@app.post("/api/watchlist")
async def update_watchlist(req: WatchlistRequest):
    # cancel any prior data feeds
    for t in ib.tickers():               
        ib.cancelMktData(t)

    # kick off fresh snapshot requests
    for sym in req.symbols:
        c = Stock(sym, "SMART", "USD")
        await ib.qualifyContractsAsync(c)
        ib.reqMktData(c, "", snapshot=True, regulatorySnapshot=False)

    # give IB a moment to fill in the snapshots
    await asyncio.sleep(0.5)

    out = {}
    for sym in req.symbols:
        tk = next((t for t in ib.tickers() if t.contract.symbol == sym), None)
        out[sym] = {
            "last": cleanFloat(tk.last)   if tk else None,
            "hod":  cleanFloat(tk.high)   if tk else None,
            "lod":  cleanFloat(tk.low)    if tk else None,
            "vwap": cleanFloat(getattr(tk, "vwap", None)) if tk else None,
        }
    return out

@app.post("/api/order")
def place_order(req: OrderRequest):
    c = Stock(req.symbol, "SMART", "USD")
    ib.qualifyContracts(c)
    if req.limit is not None:
        order = LimitOrder(req.side, req.qty, req.limit, tif="GTC")
    else:
        order = MarketOrder(req.side, req.qty)
    if req.stop is not None:
        order.auxPrice = req.stop
    trade = ib.placeOrder(c, order)
    return {
        "orderId": trade.order.orderId,
        "symbol":  req.symbol,
        "side":    req.side,
        "qty":     req.qty,
        "limit":   req.limit,
        "stop":    req.stop,
    }

@app.get("/api/orders")
def list_orders():
    open_list = []
    for tr in ib.trades():
        o = tr.order
        st = tr.orderStatus.status
        if st in ("PreSubmitted", "Submitted", "PendingSubmit", "PreSubmitting"):
            open_list.append({
                "orderId": o.orderId,
                "symbol":  tr.contract.symbol,
                "side":    o.action,
                "qty":     o.totalQuantity,
                "limit":   getattr(o, "lmtPrice", None),
                "status":  st,
            })
    return open_list

@app.delete("/api/order/{order_id}")
def cancel_order(order_id: int):
    for tr in ib.trades():
        o = tr.order
        if o.orderId == order_id:
            ib.cancelOrder(o)
            return {"cancelled": order_id}
    raise HTTPException(status_code=404, detail="Order not found")

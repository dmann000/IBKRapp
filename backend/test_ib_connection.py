# test_last_price_or_close.py

import math
import time
from ib_insync import IB, Stock

def main():
    ib = IB()
    print("⏳ Connecting to IB Gateway…")
    ib.connect('127.0.0.1', 4001, clientId=999, timeout=10)
    print("✅ Connected.")

    # Prepare the contract
    contract = Stock('TSLA', 'SMART', 'USD')
    ib.qualifyContracts(contract)

    # 1) Try a one‐shot live snapshot
    ticker = ib.reqMktData(contract, "", snapshot=True)
    time.sleep(1)  # give IB a moment to fill last/market data

    # Extract last trade if available
    live = ticker.last
    if isinstance(live, (int, float)) and math.isfinite(live):
        print(f"TSLA live last price: {live:.2f}")
    else:
        # 2) Fallback to the last close via a 1-day hist bar (includes pre/post with useRTH=False)
        bars = ib.reqHistoricalData(
            contract,
            endDateTime='',
            durationStr='1 D',
            barSizeSetting='1 day',
            whatToShow='TRADES',
            useRTH=False,
            formatDate=1
        )
        if bars:
            close = bars[-1].close
            print(f"TSLA last close ({bars[-1].date}): {close:.2f}")
        else:
            print("❌ No historical data available.")

    ib.disconnect()
    print("👋 Disconnected.")

if __name__ == '__main__':
    main()

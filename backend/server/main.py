# backend/server/main.py

import re
import sqlite3
import json
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf

app = FastAPI(title="Stock Dashboard Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# SQLite cache
# ---------------------------------------------------------------------------
DB_PATH = "cache.db"

def _init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cache "
        "(key TEXT PRIMARY KEY, data TEXT, ts REAL)"
    )
    conn.commit()
    conn.close()

_init_db()


def _cache_get(key: str, ttl: float):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data, ts FROM cache WHERE key=?", (key,)
    ).fetchone()
    conn.close()
    if row and (time.time() - row[1]) < ttl:
        return json.loads(row[0])
    return None


def _cache_set(key: str, data):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO cache VALUES (?,?,?)",
        (key, json.dumps(data), time.time()),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------
VALID_PERIODS = {
    "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"
}
VALID_INTERVALS = {
    "1m", "5m", "15m", "30m", "60m", "1h", "1d", "1wk", "1mo"
}
TICKER_RE = re.compile(r"^[A-Z0-9.\-\^=]{1,10}$")


def _validate_ticker(ticker: str) -> str:
    t = ticker.strip().upper()
    if not TICKER_RE.match(t):
        raise HTTPException(status_code=400, detail=f"Invalid ticker symbol: '{ticker}'")
    return t


def _validate_period(period: str) -> str:
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Valid: {sorted(VALID_PERIODS)}",
        )
    return period


def _validate_interval(interval: str) -> str:
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval '{interval}'. Valid: {sorted(VALID_INTERVALS)}",
        )
    return interval


# ---------------------------------------------------------------------------
# DataFrame helpers
# ---------------------------------------------------------------------------
def _flatten_df(df):
    """Flatten MultiIndex columns, reset index, ensure Date column."""
    if hasattr(df.columns, "levels"):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns.to_list()]

    df = df.reset_index()

    first_col = df.columns[0]
    if first_col != "Date":
        df = df.rename(columns={first_col: "Date"})
    df["Date"] = df["Date"].astype(str)

    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col not in df.columns:
            df[col] = None

    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].copy()
    df = df.where(df.notnull(), None)
    return df


def _df_to_records(df) -> list:
    data = []
    for r in df.to_dict(orient="records"):
        data.append({
            "Date":   r["Date"],
            "Open":   float(r["Open"])   if r["Open"]   is not None else None,
            "High":   float(r["High"])   if r["High"]   is not None else None,
            "Low":    float(r["Low"])    if r["Low"]    is not None else None,
            "Close":  float(r["Close"])  if r["Close"]  is not None else None,
            "Volume": float(r["Volume"]) if r["Volume"] is not None else None,
        })
    return data


# ---------------------------------------------------------------------------
# Technical indicators
# ---------------------------------------------------------------------------
def _safe_list(series) -> list:
    """Convert pandas Series to a list of float/None, replacing NaN with None."""
    return [None if v != v else float(v) for v in series]


def _compute_indicators(df, indicator_list: list) -> dict:
    result = {}
    close = df["Close"].astype(float)

    if "MA20" in indicator_list:
        result["MA20"] = _safe_list(close.rolling(20).mean())

    if "MA50" in indicator_list:
        result["MA50"] = _safe_list(close.rolling(50).mean())

    if "MA200" in indicator_list:
        result["MA200"] = _safe_list(close.rolling(200).mean())

    if "BB" in indicator_list:
        sma20 = close.rolling(20).mean()
        std20 = close.rolling(20).std()
        result["BB_upper"]  = _safe_list(sma20 + 2 * std20)
        result["BB_middle"] = _safe_list(sma20)
        result["BB_lower"]  = _safe_list(sma20 - 2 * std20)

    if "RSI" in indicator_list:
        delta = close.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss.replace(0, float("nan"))
        result["RSI"] = _safe_list(100 - (100 / (1 + rs)))

    if "MACD" in indicator_list:
        ema12  = close.ewm(span=12, adjust=False).mean()
        ema26  = close.ewm(span=26, adjust=False).mean()
        macd   = ema12 - ema26
        signal = macd.ewm(span=9, adjust=False).mean()
        result["MACD"]        = _safe_list(macd)
        result["MACD_signal"] = _safe_list(signal)
        result["MACD_hist"]   = _safe_list(macd - signal)

    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ohlcv")
def ohlcv(
    ticker: str = "NVDA",
    period: str = "1y",
    interval: str = "1d",
    indicators: str = "",
):
    ticker   = _validate_ticker(ticker)
    period   = _validate_period(period)
    interval = _validate_interval(interval)

    indicator_list = [i.strip() for i in indicators.split(",") if i.strip()]

    # TTL: shorter for intraday data
    intraday = interval in {"1m", "5m", "15m", "30m", "60m", "1h"}
    ttl = 60 if intraday else 300

    cache_key = f"{ticker}:{period}:{interval}"
    cached_records = _cache_get(cache_key, ttl)

    if cached_records is not None:
        # Recompute indicators on the cached raw data if needed
        if indicator_list:
            import pandas as pd
            df_cached = pd.DataFrame(cached_records)
            inds = _compute_indicators(df_cached, indicator_list)
        else:
            inds = {}
        return {"ticker": ticker, "data": cached_records, "indicators": inds}

    # Fetch from Yahoo Finance
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance error: {exc}")

    if df is None or df.empty:
        return {"ticker": ticker, "data": [], "indicators": {}}

    df = _flatten_df(df)
    records = _df_to_records(df)
    _cache_set(cache_key, records)

    inds = _compute_indicators(df, indicator_list) if indicator_list else {}

    return {"ticker": ticker, "data": records, "indicators": inds}


@app.get("/compare")
def compare(
    tickers: str = "NVDA,AAPL",
    period: str = "1y",
    interval: str = "1d",
):
    period   = _validate_period(period)
    interval = _validate_interval(interval)

    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="Provide at least one ticker.")
    if len(ticker_list) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 tickers for comparison.")

    ticker_list = [_validate_ticker(t) for t in ticker_list]

    intraday = interval in {"1m", "5m", "15m", "30m", "60m", "1h"}
    ttl = 60 if intraday else 300

    series: dict = {}
    dates: list = []

    for t in ticker_list:
        cache_key = f"{t}:{period}:{interval}"
        records = _cache_get(cache_key, ttl)

        if records is None:
            try:
                df = yf.download(t, period=period, interval=interval, progress=False)
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Yahoo Finance error for {t}: {exc}")

            if df is None or df.empty:
                continue

            df = _flatten_df(df)
            records = _df_to_records(df)
            _cache_set(cache_key, records)

        if not records:
            continue

        closes = [r["Close"] for r in records if r["Close"] is not None]
        record_dates = [r["Date"] for r in records if r["Close"] is not None]

        if not closes:
            continue

        base = closes[0]
        normalized = [round((c / base) * 100, 4) for c in closes]
        series[t] = normalized

        # Use the longest date list as the reference
        if len(record_dates) > len(dates):
            dates = record_dates

    return {"tickers": list(series.keys()), "dates": dates, "series": series}

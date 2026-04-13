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
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177", "http://localhost:5178"],
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
# Summary metrics
# ---------------------------------------------------------------------------
def _compute_summary_metrics(df) -> dict:
    """Compute last_close, period_return, and volatility_20d from a clean OHLCV DataFrame."""
    import pandas as pd

    close = df["Close"].dropna().astype(float)
    if close.empty:
        return {"last_close": None, "period_return": None, "volatility_20d": None}

    last_close   = round(float(close.iloc[-1]), 4)
    first_close  = float(close.iloc[0])
    period_return = round(((last_close - first_close) / first_close) * 100, 2) if first_close else None

    daily_returns = close.pct_change()
    vol_series    = daily_returns.rolling(20).std() * 100
    last_vol      = vol_series.dropna()
    volatility_20d = round(float(last_vol.iloc[-1]), 2) if not last_vol.empty else None

    return {
        "last_close":    last_close,
        "period_return": period_return,
        "volatility_20d": volatility_20d,
    }


def _compute_data_summary(df) -> dict:
    """Compute date_coverage, row_count, missing_value_count, and warnings[]."""
    warnings = []

    row_count = len(df)

    # Date coverage — first and last Date strings
    dates = df["Date"].dropna()
    date_start = str(dates.iloc[0])  if not dates.empty else None
    date_end   = str(dates.iloc[-1]) if not dates.empty else None
    date_coverage = f"{date_start} to {date_end}" if date_start and date_end else None

    # Missing value count across all OHLCV columns
    ohlcv_cols = ["Open", "High", "Low", "Close", "Volume"]
    missing_value_count = int(df[ohlcv_cols].isnull().sum().sum())

    if missing_value_count > 0:
        warnings.append(f"{missing_value_count} missing value(s) detected in OHLCV data.")

    if row_count == 0:
        warnings.append("No data returned for the requested ticker and period.")

    return {
        "date_coverage":       date_coverage,
        "row_count":           row_count,
        "missing_value_count": missing_value_count,
        "warnings":            warnings,
    }


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
# Label generation (Stage 4)
# ---------------------------------------------------------------------------
def _compute_labels(df) -> list:
    """Return a label per row: 'invest' if Close > MA20, else 'no-invest'.

    Rows where MA20 is not yet available (first 19 rows) receive None.
    """
    close = df["Close"].astype(float)
    ma20  = close.rolling(20).mean()
    labels = []
    for c, m in zip(close, ma20):
        if m != m:          # NaN check — rolling hasn't filled yet
            labels.append(None)
        elif c > m:
            labels.append("invest")
        else:
            labels.append("no-invest")
    return labels


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
        import pandas as pd
        df_cached = pd.DataFrame(cached_records)
        inds    = _compute_indicators(df_cached, indicator_list) if indicator_list else {}
        metrics = _compute_summary_metrics(df_cached)
        summary = _compute_data_summary(df_cached)
        labels  = _compute_labels(df_cached)
        return {"ticker": ticker, "data": cached_records, "indicators": inds, "metrics": metrics, "summary": summary, "labels": labels}

    # Fetch from Yahoo Finance
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance error: {exc}")

    if df is None or df.empty:
        empty_summary = {"date_coverage": None, "row_count": 0, "missing_value_count": 0, "warnings": ["No data returned for the requested ticker and period."]}
        return {"ticker": ticker, "data": [], "indicators": {}, "metrics": {"last_close": None, "period_return": None, "volatility_20d": None}, "summary": empty_summary, "labels": []}

    df = _flatten_df(df)
    records = _df_to_records(df)
    _cache_set(cache_key, records)

    inds    = _compute_indicators(df, indicator_list) if indicator_list else {}
    metrics = _compute_summary_metrics(df)
    summary = _compute_data_summary(df)
    labels  = _compute_labels(df)

    return {"ticker": ticker, "data": records, "indicators": inds, "metrics": metrics, "summary": summary, "labels": labels}


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


# ---------------------------------------------------------------------------
# Backtest strategy computation
# ---------------------------------------------------------------------------
def _run_backtest(df, labels: list, initial_capital: float) -> dict:
    """
    Simulate the label-based strategy vs buy-and-hold benchmark.

    Strategy rule:
      - "invest" day  → hold the stock (capture that day's return)
      - "no-invest" / None day → stay in cash (return = 0)

    Day 0 has no previous close so its return is treated as 0 for both curves.

    Returns a dict with:
      portfolio_value[]  — strategy equity curve
      benchmark_value[]  — buy-and-hold equity curve
      dates[]            — corresponding date strings
    """
    closes = df["Close"].astype(float).tolist()
    dates  = df["Date"].astype(str).tolist()
    n = len(closes)

    port_val  = initial_capital
    bench_val = initial_capital
    portfolio_value = []
    benchmark_value = []

    for i in range(n):
        if i == 0:
            daily_return = 0.0
        else:
            prev = closes[i - 1]
            daily_return = ((closes[i] - prev) / prev) if prev else 0.0

        # Benchmark always invested
        bench_val *= (1.0 + daily_return)

        # Strategy only invested on "invest" days
        if labels[i] == "invest":
            port_val *= (1.0 + daily_return)

        portfolio_value.append(round(port_val, 4))
        benchmark_value.append(round(bench_val, 4))

    return {
        "dates":           dates,
        "portfolio_value": portfolio_value,
        "benchmark_value": benchmark_value,
    }


# ---------------------------------------------------------------------------
# Backtest summary metrics
# ---------------------------------------------------------------------------
def _compute_backtest_summary(portfolio_value: list, benchmark_value: list, labels: list) -> dict:
    """
    Compute summary metrics from the equity curves and labels.

    strategy_return  — total % return of the label-based strategy
    buyhold_return   — total % return of buy-and-hold benchmark
    max_drawdown     — largest peak-to-trough % decline in the strategy equity curve
    invest_days      — number of rows where label == "invest"
    """
    if not portfolio_value or not benchmark_value:
        return {
            "strategy_return": None,
            "buyhold_return":  None,
            "max_drawdown":    None,
            "invest_days":     0,
        }

    initial = portfolio_value[0]

    strategy_return = round(((portfolio_value[-1] - initial) / initial) * 100, 2) if initial else None
    buyhold_return  = round(((benchmark_value[-1] - initial) / initial) * 100, 2) if initial else None

    # Max drawdown: largest % drop from a running peak
    peak = portfolio_value[0]
    max_dd = 0.0
    for v in portfolio_value:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (peak - v) / peak * 100
            if dd > max_dd:
                max_dd = dd
    max_drawdown = round(max_dd, 2)

    invest_days = sum(1 for l in labels if l == "invest")

    return {
        "strategy_return": strategy_return,
        "buyhold_return":  buyhold_return,
        "max_drawdown":    max_drawdown,
        "invest_days":     invest_days,
    }


# ---------------------------------------------------------------------------
# Backtest endpoint
# ---------------------------------------------------------------------------
@app.get("/backtest")
def backtest(
    ticker: str = "NVDA",
    period: str = "1y",
    interval: str = "1d",
    initial_capital: float = 10000.0,
):
    # --- Input validation ---
    ticker   = _validate_ticker(ticker)
    period   = _validate_period(period)
    interval = _validate_interval(interval)

    if initial_capital <= 0:
        raise HTTPException(status_code=400, detail="initial_capital must be greater than 0.")
    if initial_capital > 1_000_000_000:
        raise HTTPException(status_code=400, detail="initial_capital must be 1,000,000,000 or less.")

    # Intraday intervals not meaningful for daily label-based strategy
    if interval in {"1m", "5m", "15m", "30m", "60m", "1h"}:
        raise HTTPException(
            status_code=400,
            detail="Backtesting requires a daily or wider interval (1d, 1wk, 1mo).",
        )

    # --- Fetch / cache OHLCV ---
    ttl = 300
    cache_key = f"{ticker}:{period}:{interval}"
    records = _cache_get(cache_key, ttl)

    if records is None:
        try:
            import pandas as pd
            df = yf.download(ticker, period=period, interval=interval, progress=False)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Yahoo Finance error: {exc}")

        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No data returned for '{ticker}'.")

        df = _flatten_df(df)
        records = _df_to_records(df)
        _cache_set(cache_key, records)

    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail="Not enough data to run backtest (need at least 20 rows for MA20).",
        )

    import pandas as pd
    df = pd.DataFrame(records)
    labels = _compute_labels(df)

    result  = _run_backtest(df, labels, initial_capital)
    summary = _compute_backtest_summary(result["portfolio_value"], result["benchmark_value"], labels)

    return {
        "ticker":           ticker,
        "period":           period,
        "interval":         interval,
        "initial_capital":  initial_capital,
        "dates":            result["dates"],
        "portfolio_value":  result["portfolio_value"],
        "benchmark_value":  result["benchmark_value"],
        "summary":          summary,
    }

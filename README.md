# Stock Trends Analysis Dashboard

A full-stack web application for visualizing stock market data, running backtests on rule-based trading strategies, and generating machine learning buy/sell signals — all with a clean, light-themed UI.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Reference](#api-reference)
- [How It Works](#how-it-works)
  - [Label Generation](#label-generation)
  - [Backtesting Engine](#backtesting-engine)
  - [Machine Learning Model](#machine-learning-model)
- [Technical Indicators](#technical-indicators)
- [Data Caching](#data-caching)
- [Rate Limiting](#rate-limiting)
- [CSV Export](#csv-export)
- [Deployment](#deployment)

---

## Overview

The Stock Trends Analysis Dashboard fetches real-time and historical OHLCV (Open, High, Low, Close, Volume) data from Yahoo Finance and presents it through an interactive dashboard. Users can apply technical indicators, compare multiple stocks, run a label-based backtest strategy against a buy-and-hold benchmark, and get a machine learning signal for the most recent trading day.

---

## Features

- **Price Chart** — Candlestick or line chart toggle with colored invest/no-invest background regions
- **Technical Indicators** — MA20, MA50, MA200, Bollinger Bands, RSI, MACD (with histogram)
- **Summary Metrics Bar** — Last Close, Period Return (%), 20-Day Volatility, Row Count
- **Data Info Bar** — Date range, row count, missing value warnings
- **Multi-Ticker Comparison** — Normalized-to-100 line chart for up to 5 tickers
- **Rule-Based Labels** — Each trading day labeled "invest" (Close > MA20) or "no-invest"
- **Backtesting Engine** — Equity curve: label-based strategy vs buy-and-hold benchmark
- **Backtest Metrics** — Strategy Return, Buy & Hold Return, Max Drawdown, Invest Days
- **CSV Export** — Download full OHLCV + indicators + labels, or backtest equity curve
- **ML Signal** — RandomForest BUY/SELL signal with confidence score and feature importances
- **ML Evaluation** — Accuracy, Precision, Recall, F1 on a held-out 30-day test set
- **Guide Tab** — In-app reference page explaining every concept for non-finance users
- **Rate Limiting** — 60 requests/minute per IP
- **SQLite Caching** — 60-second TTL for intraday data, 5-minute TTL for daily+

---

## Tech Stack

| Layer    | Technology                                        |
|----------|---------------------------------------------------|
| Frontend | React 19, Vite 8, Recharts, react-plotly.js       |
| Backend  | Python 3.9, FastAPI, Uvicorn                      |
| Data     | yfinance (Yahoo Finance)                          |
| ML       | scikit-learn (RandomForestClassifier)             |
| Cache    | SQLite (Python stdlib `sqlite3`)                  |

---

## Project Structure

```
stock-trends-dashboard/
├── backend/
│   ├── server/
│   │   ├── __init__.py
│   │   └── main.py          # FastAPI app — all endpoints and logic
│   └── tests/
│       └── test_labels.py   # Unit tests for label generation
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx          # Full React application
│   │   └── main.jsx         # React entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+

### Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python3.9 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn yfinance pandas numpy scikit-learn

# Start the server
uvicorn server.main:app --reload --port 8000
```

The API will be available at `http://127.0.0.1:8000`.  
Interactive Swagger docs: `http://127.0.0.1:8000/docs`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will open at `http://localhost:5173` (or the next available port).

> **Note:** The frontend expects the backend at `http://127.0.0.1:8000`. For production, update the `API` constant at the top of `frontend/src/App.jsx` to your hosted backend URL.

---

## API Reference

### `GET /health`
Health check.

**Response:** `{ "status": "ok" }`

---

### `GET /ohlcv`
Fetch OHLCV data, compute indicators, labels, and summary metrics.

| Parameter    | Type   | Default | Description                                       |
|--------------|--------|---------|---------------------------------------------------|
| `ticker`     | string | `NVDA`  | Stock ticker symbol (e.g. `AAPL`, `TSLA`)         |
| `period`     | string | `1y`    | Data period (see valid values below)              |
| `interval`   | string | `1d`    | Bar interval (see valid values below)             |
| `indicators` | string | `""`    | Comma-separated: `MA20,MA50,MA200,BB,RSI,MACD`   |

**Valid periods:** `1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max`  
**Valid intervals:** `1m 5m 15m 30m 60m 1h 1d 1wk 1mo`

**Response fields:**
- `data` — list of `{Date, Open, High, Low, Close, Volume}` records
- `indicators` — computed series (e.g. `MA20`, `BB_upper`, `BB_lower`, `RSI`, `MACD`, `MACD_signal`, `MACD_hist`)
- `metrics` — `{last_close, period_return, volatility_20d}`
- `summary` — `{date_coverage, row_count, missing_value_count, warnings[]}`
- `labels` — per-row `"invest"` / `"no-invest"` / `null`

---

### `GET /compare`
Normalized multi-ticker comparison.

| Parameter  | Type   | Default     | Description                    |
|------------|--------|-------------|--------------------------------|
| `tickers`  | string | `NVDA,AAPL` | Comma-separated, max 5 tickers |
| `period`   | string | `1y`        | Data period                    |
| `interval` | string | `1d`        | Bar interval                   |

**Response:** `{tickers, dates, series}` — each series normalized to 100 at its first data point.

---

### `GET /backtest`
Run the label-based strategy backtest.

| Parameter         | Type   | Default   | Description                              |
|-------------------|--------|-----------|------------------------------------------|
| `ticker`          | string | `NVDA`    | Stock ticker                             |
| `period`          | string | `1y`      | Data period                              |
| `interval`        | string | `1d`      | Must be `1d`, `1wk`, or `1mo`           |
| `initial_capital` | float  | `10000.0` | Starting capital (max 1,000,000,000)     |

**Response:** `{dates, portfolio_value[], benchmark_value[], summary}` where `summary` contains `strategy_return`, `buyhold_return`, `max_drawdown`, `invest_days`.

> Intraday intervals are rejected — backtesting requires daily or wider data.

---

### `GET /export`
Download OHLCV + all indicators + labels as a CSV file.

Same parameters as `/ohlcv` (no `indicators` param — all indicators are always included).

**Response:** `text/csv` download with metadata header rows.

---

### `GET /export/backtest`
Download the backtest equity curve as a CSV file.

Same parameters as `/backtest`.

**Response:** `text/csv` with metadata rows (strategy metrics) + `Date, Strategy_Value, Benchmark_Value, Label` columns.

---

### `GET /predict`
Train (or load from cache) a RandomForest model and return a BUY/SELL signal.

| Parameter  | Type   | Default | Description                           |
|------------|--------|---------|---------------------------------------|
| `ticker`   | string | `NVDA`  | Stock ticker                          |
| `period`   | string | `1y`    | Data period (needs at least 60 rows)  |
| `interval` | string | `1d`    | Must be `1d`, `1wk`, or `1mo`        |

**Example response:**
```json
{
  "ticker": "NVDA",
  "signal": "BUY",
  "confidence": 72.3,
  "metrics": {
    "accuracy": 0.87,
    "precision": 0.85,
    "recall": 0.76,
    "f1": 0.80
  },
  "feature_importances": {
    "macd_hist": 0.31,
    "daily_return": 0.28,
    "volatility_20": 0.24,
    "volume_change": 0.17
  },
  "ml_metadata": {
    "ticker": "NVDA",
    "date_range": "2024-04-14 to 2025-04-14",
    "random_seed": 42,
    "train_size": 220,
    "test_size": 30
  }
}
```

---

## How It Works

### Label Generation

Each trading day receives a label based on one rule:

| Condition                  | Label        |
|----------------------------|--------------|
| Close > MA20               | `invest`     |
| Close <= MA20              | `no-invest`  |
| First 19 rows (MA20 N/A)   | `null`       |

Labels are computed in `_compute_labels()` and returned by `/ohlcv`. On the price chart, invest periods are shaded green and no-invest periods are shaded red.

### Backtesting Engine

The backtest simulates two parallel equity curves starting from `initial_capital`:

- **Strategy** — invested only on "invest" days; stays in cash (0% return) on "no-invest" and null days
- **Benchmark** — always fully invested (buy-and-hold)

For each day `i`:
```
daily_return = (Close[i] - Close[i-1]) / Close[i-1]
benchmark *= (1 + daily_return)                        # always
portfolio *= (1 + daily_return)  if label == "invest"  # conditional
```

Day 0 uses 0% return for both curves. Summary metrics are computed over the final equity curves.

**Max Drawdown** is the largest peak-to-trough percentage decline in the strategy curve:
```
max_dd = max over all i of: (peak_up_to_i - value_i) / peak_up_to_i × 100
```

### Machine Learning Model

**Algorithm:** RandomForestClassifier  
**Hyperparameters:** `n_estimators=100, max_depth=5, min_samples_leaf=5, class_weight="balanced", random_state=42`

**Features:**

| Feature         | Description                                             |
|-----------------|---------------------------------------------------------|
| `macd_hist`     | MACD histogram (MACD line minus signal line)           |
| `daily_return`  | Percentage daily return                                 |
| `volatility_20` | 20-day rolling std of daily returns (%)                |
| `volume_change` | Percentage change in volume vs previous day            |

Features that directly encode the label definition (MA ratio = Close/MA20, BB position, RSI) were intentionally excluded to avoid data leakage. The retained features are independent momentum and volatility signals.

**Train/test split:** time-based — last 30 labeled rows = test set, everything before = training set.

**Label target:** binary — 1 if rule-based label is "invest", 0 if "no-invest".

**Model caching:** Models are cached in memory per `ticker:period:interval`. Repeated `/predict` calls for the same parameters skip retraining entirely.

**Typical performance:** ~87% accuracy, F1 ≈ 0.80 on the 30-day held-out test set (varies by ticker and period).

---

## Technical Indicators

| Indicator           | Description                                                                           |
|---------------------|---------------------------------------------------------------------------------------|
| **MA20**            | 20-day simple moving average of closing price                                         |
| **MA50**            | 50-day simple moving average                                                          |
| **MA200**           | 200-day simple moving average — used to gauge long-term trend                        |
| **Bollinger Bands** | MA20 ± 2 standard deviations; upper, middle (MA20), and lower bands                  |
| **RSI (14)**        | Relative Strength Index over 14 periods — overbought > 70, oversold < 30            |
| **MACD**            | EMA(12) − EMA(26); signal = EMA(9) of MACD; histogram = MACD − signal               |

All indicator series return `null` for warm-up rows where enough data is not yet available.

---

## Data Caching

OHLCV records are cached locally in `backend/cache.db` (SQLite) to reduce redundant calls to Yahoo Finance.

| Data type              | Cache TTL   |
|------------------------|-------------|
| Intraday (≤ 1h bars)   | 60 seconds  |
| Daily / weekly / monthly | 5 minutes |

The same cached records are shared across `/ohlcv`, `/backtest`, `/export`, and `/predict` for the same `ticker:period:interval` combination.

---

## Rate Limiting

A fixed-window rate limit of **60 requests per minute per IP address** is enforced at the middleware level.

Exceeding the limit returns:
```
HTTP 429 Too Many Requests
{"detail": "Too many requests. Please wait a moment and try again."}
```

---

## CSV Export

### OHLCV CSV (`GET /export`)

Filename: `{TICKER}_{PERIOD}_{INTERVAL}.csv`

The file begins with metadata rows (ticker, period, interval, export timestamp), followed by:
```
Date, Open, High, Low, Close, Volume, MA20, MA50, BB_Upper, BB_Lower, RSI, MACD, Label
```

### Backtest CSV (`GET /export/backtest`)

Filename: `{TICKER}_{PERIOD}_{INTERVAL}_backtest.csv`

Metadata rows include all summary metrics (strategy return, buy & hold return, max drawdown, invest days), followed by:
```
Date, Strategy_Value, Benchmark_Value, Label
```

---

## Deployment

### Backend — Render (Free Tier)

1. Connect your GitHub repo on [render.com](https://render.com) and create a new **Web Service**
2. Settings:
   - **Root directory:** `backend`
   - **Build command:** `pip install fastapi uvicorn yfinance pandas numpy scikit-learn`
   - **Start command:** `uvicorn server.main:app --host 0.0.0.0 --port 8000`
3. Copy the deployed URL (e.g. `https://your-app.onrender.com`)

### Frontend — Vercel (Free Tier)

1. In `frontend/src/App.jsx`, update the API constant:
   ```js
   const API = "https://your-app.onrender.com";
   ```
2. Also add your Vercel domain to the `allow_origins` list in `backend/server/main.py`
3. Connect your GitHub repo on [vercel.com](https://vercel.com), set **Root directory** to `frontend`
4. Deploy — Vercel auto-deploys on every push to `main`

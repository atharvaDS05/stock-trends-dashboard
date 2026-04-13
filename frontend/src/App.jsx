import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, BarChart, Bar, ReferenceLine, ReferenceArea,
  ComposedChart, Legend,
} from "recharts";

const API = "http://127.0.0.1:8000";

const INDICATOR_OPTIONS = [
  { key: "BB",   label: "Bollinger Bands", color: "#a78bfa" },
  { key: "RSI",  label: "RSI (14)",        color: "#38bdf8" },
  { key: "MACD", label: "MACD",            color: "#fb7185" },
];

const COMPARE_COLORS = ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa"];

// ── Group consecutive same-label rows into spans ──────────────────────────────
function getLabelSpans(labels) {
  const spans = [];
  let i = 0;
  while (i < labels.length) {
    const lbl = labels[i];
    if (lbl === null) { i++; continue; }
    let j = i;
    while (j < labels.length && labels[j] === lbl) j++;
    spans.push({ label: lbl, start: i, end: j - 1 });
    i = j;
  }
  return spans;
}

// ── Pure-SVG candlestick chart ────────────────────────────────────────────────
function CandlestickChart({ rows, height = 430, selectedIndicators, indicatorData, labels = [] }) {
  if (!rows.length) return null;

  const W = 1200;
  const padL = 62, padR = 12, padT = 18, padB = 28;
  const plotW = W - padL - padR;
  const plotH = height - padT - padB;

  // Price domain — include indicator values in the domain
  const allPrices = rows.flatMap((r) => [r.High, r.Low]).filter((v) => v != null);

  const overlayKeys = ["MA20","MA50","MA200","BB_upper","BB_lower"]
    .filter((k) => indicatorData[k]);
  overlayKeys.forEach((k) => {
    indicatorData[k].forEach((v) => { if (v != null) allPrices.push(v); });
  });

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad    = (rawMax - rawMin) * 0.04;
  const minP   = rawMin - pad;
  const maxP   = rawMax + pad;

  const toY = (p) => padT + plotH - ((p - minP) / (maxP - minP)) * plotH;
  const toX = (i) => padL + (i + 0.5) * (plotW / rows.length);
  const candleW = Math.max(1.5, (plotW / rows.length) * 0.65);

  // Y-axis ticks
  const nTicks = 7;
  const yTicks = Array.from({ length: nTicks }, (_, i) =>
    minP + (i / (nTicks - 1)) * (maxP - minP)
  );

  // Build SVG path for an overlay line (handles null gaps)
  function linePath(values) {
    let d = "";
    let gap = true;
    values.forEach((v, i) => {
      if (v == null) { gap = true; return; }
      const cmd = gap ? "M" : "L";
      d += `${cmd}${toX(i).toFixed(1)},${toY(v).toFixed(1)} `;
      gap = false;
    });
    return d;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      style={{ width: "100%", height }}
      preserveAspectRatio="none"
    >
      {/* Label background regions — invest=green, no-invest=red */}
      {getLabelSpans(labels).map(({ label, start, end }, idx) => {
        const x1 = padL + start * (plotW / rows.length);
        const x2 = padL + (end + 1) * (plotW / rows.length);
        return (
          <rect key={idx} x={x1} y={padT} width={x2 - x1} height={plotH}
            fill={label === "invest" ? "#22c55e" : "#ef4444"} fillOpacity={0.10} />
        );
      })}

      {/* Grid */}
      {yTicks.map((t, i) => (
        <line key={i} x1={padL} y1={toY(t)} x2={W - padR} y2={toY(t)}
          stroke="#e2e8f0" strokeWidth={0.6} />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((t, i) => (
        <text key={i} x={padL - 6} y={toY(t) + 4}
          fill="#94a3b8" fontSize={15} textAnchor="end">
          {t >= 1000 ? t.toFixed(0) : t.toFixed(2)}
        </text>
      ))}

      {/* Bollinger Bands fill */}
      {selectedIndicators.includes("BB") && indicatorData["BB_upper"] && indicatorData["BB_lower"] && (() => {
        const upper = indicatorData["BB_upper"];
        const lower = indicatorData["BB_lower"];
        const pts = upper.map((v, i) => v != null && lower[i] != null
          ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null).filter(Boolean);
        const ptsRev = lower.map((v, i) => v != null && upper[i] != null
          ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null).filter(Boolean).reverse();
        return (
          <polygon
            points={[...pts, ...ptsRev].join(" ")}
            fill="#a78bfa" fillOpacity={0.08}
          />
        );
      })()}

      {/* Bollinger Band lines */}
      {selectedIndicators.includes("BB") && ["BB_upper","BB_middle","BB_lower"].map((k) =>
        indicatorData[k] && (
          <path key={k} d={linePath(indicatorData[k])}
            fill="none" stroke="#a78bfa"
            strokeWidth={k === "BB_middle" ? 1.2 : 1}
            strokeDasharray={k === "BB_middle" ? "0" : "4 3"}
            opacity={0.85}
          />
        )
      )}


      {/* Candles */}
      {rows.map((r, i) => {
        if (r.Open == null || r.Close == null || r.High == null || r.Low == null) return null;
        const x      = toX(i);
        const isUp   = r.Close >= r.Open;
        const color  = isUp ? "#22c55e" : "#ef4444";
        const bodyT  = Math.min(toY(r.Open), toY(r.Close));
        const bodyB  = Math.max(toY(r.Open), toY(r.Close));
        const bodyH  = Math.max(1, bodyB - bodyT);
        return (
          <g key={r.Date}>
            {/* Wick */}
            <line x1={x} y1={toY(r.High)} x2={x} y2={toY(r.Low)}
              stroke={color} strokeWidth={1} />
            {/* Body */}
            <rect x={x - candleW / 2} y={bodyT} width={candleW} height={bodyH}
              fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ticker, setTicker]                   = useState("NVDA");
  const [period, setPeriod]                   = useState("1y");
  const [interval, setIntervalVal]            = useState("1d");
  const [chartType, setChartType]             = useState("candle");
  const [selectedIndicators, setSelectedInds] = useState([]);
  const [rows, setRows]                       = useState([]);
  const [indicatorData, setIndicatorData]     = useState({});
  const [metrics, setMetrics]                 = useState(null);
  const [summary, setSummary]                 = useState(null);
  const [labels, setLabels]                   = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState(null);

  const [activeTab, setActiveTab]             = useState("price");

  const [initialCapital, setInitialCapital]   = useState("10000");
  const [backtestData, setBacktestData]       = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  const [compareInput, setCompareInput]       = useState("");
  const [compareTickers, setCompareTickers]   = useState([]);
  const [compareData, setCompareData]         = useState(null);
  const [compareLoading, setCompareLoading]   = useState(false);

  function toggleIndicator(key) {
    setSelectedInds((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function addCompareTicker() {
    const t = compareInput.trim().toUpperCase();
    if (t && !compareTickers.includes(t) && compareTickers.length < 5)
      setCompareTickers((prev) => [...prev, t]);
    setCompareInput("");
  }

  function removeCompareTicker(t) {
    setCompareTickers((prev) => prev.filter((x) => x !== t));
    setCompareData(null);
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const url = `${API}/ohlcv?ticker=${ticker}&period=${period}&interval=${interval}&indicators=${selectedIndicators.join(",")}`;
      let res;
      try {
        res = await fetch(url);
      } catch {
        setError({ type: "network", message: "Cannot connect to the backend server. Make sure FastAPI is running on port 8000." });
        return;
      }

      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        setError({ type: "validation", message: err.detail || "Invalid request parameters. Check the ticker, period, and interval." });
        return;
      }
      if (res.status === 502) {
        setError({ type: "provider", message: "Yahoo Finance is currently unavailable. Please try again in a moment." });
        return;
      }
      if (!res.ok) {
        setError({ type: "network", message: `Unexpected server error (HTTP ${res.status}). Please try again.` });
        return;
      }

      const json = await res.json();
      const data = json.data || [];

      if (data.length === 0) {
        setError({ type: "empty", message: `No data found for "${ticker}" with the selected period and interval. Try a broader date range or a different interval.` });
        setRows([]);
        setIndicatorData({});
        setMetrics(null);
        setSummary(json.summary || null);
        setLabels([]);
        return;
      }

      setRows(data);
      setIndicatorData(json.indicators || {});
      setMetrics(json.metrics || null);
      setSummary(json.summary || null);
      setLabels(json.labels || []);
    } catch (e) {
      setError({ type: "network", message: e.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  }

  async function compareStocks() {
    if (!compareTickers.length) return;
    setCompareLoading(true);
    setError(null);
    try {
      const url = `${API}/compare?tickers=${compareTickers.join(",")}&period=${period}&interval=${interval}`;
      let res;
      try {
        res = await fetch(url);
      } catch {
        setError({ type: "network", message: "Cannot connect to the backend server. Make sure FastAPI is running on port 8000." });
        return;
      }

      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        setError({ type: "validation", message: err.detail || "Invalid tickers or parameters for comparison." });
        return;
      }
      if (res.status === 502) {
        setError({ type: "provider", message: "Yahoo Finance is currently unavailable. Please try again in a moment." });
        return;
      }
      if (!res.ok) {
        setError({ type: "network", message: `Unexpected server error (HTTP ${res.status}). Please try again.` });
        return;
      }

      setCompareData(await res.json());
    } catch (e) {
      setError({ type: "network", message: e.message || "Comparison failed unexpectedly." });
    } finally {
      setCompareLoading(false);
    }
  }

  async function runBacktest() {
    setBacktestLoading(true);
    setError(null);
    try {
      const url = `${API}/backtest?ticker=${ticker}&period=${period}&interval=${interval}&initial_capital=${initialCapital}`;
      let res;
      try {
        res = await fetch(url);
      } catch {
        setError({ type: "network", message: "Cannot connect to the backend server. Make sure FastAPI is running on port 8000." });
        return;
      }
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        setError({ type: "validation", message: err.detail || "Invalid parameters for backtest." });
        return;
      }
      if (res.status === 502) {
        setError({ type: "provider", message: "Yahoo Finance is currently unavailable. Please try again in a moment." });
        return;
      }
      if (!res.ok) {
        setError({ type: "network", message: `Unexpected server error (HTTP ${res.status}). Please try again.` });
        return;
      }
      setBacktestData(await res.json());
    } catch (e) {
      setError({ type: "network", message: e.message || "Backtest failed unexpectedly." });
    } finally {
      setBacktestLoading(false);
    }
  }

  const chartData = rows.map((r, i) => ({
    date:         r.Date,
    close:        r.Close,
    volume:       r.Volume,
    MA20:         indicatorData["MA20"]?.[i],
    MA50:         indicatorData["MA50"]?.[i],
    MA200:        indicatorData["MA200"]?.[i],
    BB_upper:     indicatorData["BB_upper"]?.[i],
    BB_middle:    indicatorData["BB_middle"]?.[i],
    BB_lower:     indicatorData["BB_lower"]?.[i],
    RSI:          indicatorData["RSI"]?.[i],
    MACD:         indicatorData["MACD"]?.[i],
    MACD_signal:  indicatorData["MACD_signal"]?.[i],
    MACD_hist:    indicatorData["MACD_hist"]?.[i],
  }));

  const hasData  = chartData.length > 0;
  const showRSI  = selectedIndicators.includes("RSI")  && indicatorData["RSI"];
  const showMACD = selectedIndicators.includes("MACD") && indicatorData["MACD"];
  const showBB   = selectedIndicators.includes("BB")   && indicatorData["BB_upper"];

  const compareChartData = compareData
    ? compareData.dates.map((d, i) => {
        const pt = { date: d };
        compareData.tickers.forEach((t) => { pt[t] = compareData.series[t]?.[i] ?? null; });
        return pt;
      })
    : [];

  // ── styles ────────────────────────────────────────────────────────────────
  const card       = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 26px", marginBottom: 20, background: "#ffffff" };
  const btnBase    = { padding: "11px 22px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 17 };
  const btnPrimary = { ...btnBase, background: "#3b82f6", color: "#fff" };
  const btnSec     = { ...btnBase, background: "#f1f5f9", color: "#475569" };
  const lbl        = { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" };
  const sel        = { padding: "9px 12px", background: "#ffffff", color: "#1e293b", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14 };
  const ttStyle    = { background: "#ffffff", border: "1px solid #e2e8f0", color: "#1e293b" };
  const sectionHdr = { margin: "0 0 12px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" };

  const fullSel = { ...sel, width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui,sans-serif", fontSize: 16, color: "#1e293b" }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={{
        width: 272,
        minHeight: "100vh",
        background: "#ffffff",
        borderRight: "1px solid #e2e8f0",
        padding: "24px 20px",
        flexShrink: 0,
        overflowY: "auto",
        boxSizing: "border-box",
      }}>
        {/* Sidebar title */}
        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a", lineHeight: 1.4 }}>
            Stock Trends Analysis Dashboard
          </h2>
        </div>

        {/* ── CONTROLS SECTION ── */}
        <p style={sectionHdr}>Controls</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Ticker */}
          <div>
            <span style={lbl}>Ticker</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA" style={fullSel} />
          </div>

          {/* Period */}
          <div>
            <span style={lbl}>Date Range</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={fullSel}>
              <option value="1d">1 day</option>
              <option value="5d">5 days</option>
              <option value="1mo">1 month</option>
              <option value="3mo">3 months</option>
              <option value="6mo">6 months</option>
              <option value="1y">1 year</option>
              <option value="2y">2 years</option>
              <option value="5y">5 years</option>
              <option value="10y">10 years</option>
              <option value="ytd">Year to date</option>
              <option value="max">Max</option>
            </select>
          </div>

          {/* Interval */}
          <div>
            <span style={lbl}>Interval</span>
            <select value={interval} onChange={(e) => setIntervalVal(e.target.value)} style={fullSel}>
              <option value="1m">1 min</option>
              <option value="5m">5 min</option>
              <option value="15m">15 min</option>
              <option value="30m">30 min</option>
              <option value="1h">1 hour</option>
              <option value="1d">1 day</option>
              <option value="1wk">1 week</option>
              <option value="1mo">1 month</option>
            </select>
          </div>

          {/* Chart Type */}
          <div>
            <span style={lbl}>Chart Type</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["candle", "line"].map((t) => (
                <button key={t} onClick={() => setChartType(t)}
                  style={{
                    ...btnBase, flex: 1, fontSize: 14, padding: "8px 0",
                    background: chartType === t ? "#3b82f6" : "#f1f5f9",
                    color:      chartType === t ? "#fff"    : "#475569",
                    border:     chartType === t ? "none"    : "1px solid #e2e8f0",
                  }}>
                  {t === "candle" ? "Candlestick" : "Line"}
                </button>
              ))}
            </div>
          </div>

          {/* Indicators */}
          <div>
            <span style={lbl}>Indicators</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "10px 12px", background: "#f8fafc", borderRadius: 7, border: "1px solid #e2e8f0" }}>
              {INDICATOR_OPTIONS.map(({ key, label, color }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, userSelect: "none" }}>
                  <input type="checkbox" checked={selectedIndicators.includes(key)} onChange={() => toggleIndicator(key)} />
                  <span style={{ color, fontWeight: 500 }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Initial Capital */}
          <div>
            <span style={lbl}>Initial Capital ($)</span>
            <input
              type="number"
              min="1"
              value={initialCapital}
              onChange={(e) => { setInitialCapital(e.target.value); setBacktestData(null); }}
              style={fullSel}
            />
          </div>

          {/* Analyze button */}
          <button
            onClick={analyze}
            disabled={loading}
            style={{ ...btnPrimary, width: "100%", padding: "11px 0", fontSize: 15, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Loading…" : "Analyze"}
          </button>

        </div>

        {/* ── COMPARE SECTION ── */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
          <p style={sectionHdr}>Compare Tickers</p>
          <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#94a3b8" }}>Up to 5 tickers, normalized to 100</p>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={compareInput}
              onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addCompareTicker()}
              placeholder="Add ticker…"
              style={{ ...sel, flex: 1, boxSizing: "border-box", fontSize: 14 }} />
            <button onClick={addCompareTicker} style={{ ...btnSec, padding: "8px 12px", fontSize: 14, border: "1px solid #e2e8f0" }}>Add</button>
          </div>

          {compareTickers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {compareTickers.map((t, i) => (
                <span key={t} style={{
                  background: COMPARE_COLORS[i % 5] + "18",
                  color: COMPARE_COLORS[i % 5],
                  border: `1px solid ${COMPARE_COLORS[i % 5]}`,
                  padding: "3px 8px", borderRadius: 20, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {t}
                  <button onClick={() => removeCompareTicker(t)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: 14, lineHeight: 1 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={compareStocks}
            disabled={compareLoading || compareTickers.length === 0}
            style={{ ...btnPrimary, width: "100%", padding: "9px 0", fontSize: 14, opacity: (compareLoading || compareTickers.length === 0) ? 0.5 : 1 }}>
            {compareLoading ? "Loading…" : "Run Compare"}
          </button>
        </div>

        {/* ── DATA SUMMARY INFO BAR ── */}
        {summary && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
            <p style={sectionHdr}>Data Summary</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Date coverage */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Date Coverage</span>
                <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                  {summary.date_coverage ?? "—"}
                </span>
              </div>

              {/* Row count + missing */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 2 }}>Rows</span>
                  <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{summary.row_count.toLocaleString()}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 2 }}>Missing</span>
                  <span style={{ fontSize: 13, color: summary.missing_value_count > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                    {summary.missing_value_count}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {summary.warnings.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {summary.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        )}

      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, background: "#f8fafc", padding: "24px 28px", overflowY: "auto", minWidth: 0 }}>

        {/* ── SUMMARY METRICS BAR ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            {
              label: "Last Close",
              value: metrics?.last_close != null ? `$${metrics.last_close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
              color: "#0f172a",
            },
            {
              label: "Period Return",
              value: metrics?.period_return != null ? `${metrics.period_return > 0 ? "+" : ""}${metrics.period_return.toFixed(2)}%` : "—",
              color: metrics?.period_return == null ? "#0f172a" : metrics.period_return >= 0 ? "#16a34a" : "#dc2626",
            },
            {
              label: "20d Volatility",
              value: metrics?.volatility_20d != null ? `${metrics.volatility_20d.toFixed(2)}%` : "—",
              color: "#0f172a",
            },
            {
              label: "Strategy Return",
              value: backtestData?.summary?.strategy_return != null
                ? `${backtestData.summary.strategy_return > 0 ? "+" : ""}${backtestData.summary.strategy_return.toFixed(2)}%`
                : "—",
              color: backtestData?.summary?.strategy_return == null
                ? "#0f172a"
                : backtestData.summary.strategy_return >= 0 ? "#16a34a" : "#dc2626",
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "16px 20px",
            }}>
              <p style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}
              </p>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
          {[
            { key: "price",    label: "Price & Indicators" },
            { key: "backtest", label: "Backtest" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              borderBottom: activeTab === key ? "2px solid #3b82f6" : "2px solid transparent",
              marginBottom: -2,
              background: "none",
              color: activeTab === key ? "#3b82f6" : "#64748b",
              cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (() => {
          const cfg = {
            network:    { bg: "#fef2f2", border: "#ef4444", title: "Connection Error",   icon: "✕", titleColor: "#991b1b", msgColor: "#7f1d1d" },
            validation: { bg: "#fffbeb", border: "#f59e0b", title: "Invalid Input",       icon: "⚠", titleColor: "#92400e", msgColor: "#78350f" },
            provider:   { bg: "#fffbeb", border: "#f59e0b", title: "Data Unavailable",    icon: "⚠", titleColor: "#92400e", msgColor: "#78350f" },
            empty:      { bg: "#eff6ff", border: "#3b82f6", title: "No Data Found",       icon: "ℹ", titleColor: "#1e40af", msgColor: "#1e3a8a" },
          };
          const { bg, border, title, icon, titleColor, msgColor } = cfg[error.type] || cfg.network;
          return (
            <div style={{ ...card, background: bg, border: `1px solid ${border}`, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: 1.3, color: titleColor }}>{icon}</span>
                <div>
                  <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontSize: 14, color: titleColor }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 14, color: msgColor }}>{error.message}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── BACKTEST TAB ── */}
        {activeTab === "backtest" && (() => {
          const btChartData = backtestData
            ? backtestData.dates.map((d, i) => ({
                date:      d,
                strategy:  backtestData.portfolio_value[i],
                benchmark: backtestData.benchmark_value[i],
              }))
            : [];

          return (
            <div>
              {/* Run button */}
              {!backtestData && (
                <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Label-Based Backtest</p>
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                      Simulates investing on "invest" days and holding cash on "no-invest" days vs buy-and-hold.
                    </p>
                  </div>
                  <button onClick={runBacktest} disabled={backtestLoading}
                    style={{ ...btnPrimary, whiteSpace: "nowrap", opacity: backtestLoading ? 0.7 : 1 }}>
                    {backtestLoading ? "Running…" : "Run Backtest"}
                  </button>
                </div>
              )}

              {/* Equity curve chart */}
              {backtestData && btChartData.length > 0 && (
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Equity Curve — {backtestData.ticker}</h3>
                    <button onClick={() => { setBacktestData(null); }} style={{ ...btnSec, fontSize: 13, padding: "6px 14px" }}>
                      Reset
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={360}>
                    <LineChart data={btChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" hide />
                      <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <Tooltip
                        contentStyle={ttStyle}
                        formatter={(val, name) => [`$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="strategy"  dot={false} stroke="#3b82f6" name="Strategy"     strokeWidth={2} />
                      <Line type="monotone" dataKey="benchmark" dot={false} stroke="#94a3b8" name="Buy & Hold"   strokeWidth={1.5} strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Summary Metrics panel */}
              {backtestData?.summary && (
                <div style={card}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "#0f172a" }}>Backtest Summary</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      {
                        label: "Buy & Hold Return",
                        value: backtestData.summary.buyhold_return != null
                          ? `${backtestData.summary.buyhold_return > 0 ? "+" : ""}${backtestData.summary.buyhold_return.toFixed(2)}%`
                          : "—",
                        color: backtestData.summary.buyhold_return == null ? "#0f172a"
                          : backtestData.summary.buyhold_return >= 0 ? "#16a34a" : "#dc2626",
                        bg: "#f8fafc",
                      },
                      {
                        label: "Max Drawdown",
                        value: backtestData.summary.max_drawdown != null
                          ? `-${backtestData.summary.max_drawdown.toFixed(2)}%`
                          : "—",
                        color: "#dc2626",
                        bg: "#fef2f2",
                      },
                      {
                        label: "Invest Days",
                        value: backtestData.summary.invest_days != null
                          ? `${backtestData.summary.invest_days} / ${backtestData.portfolio_value.length}`
                          : "—",
                        color: "#0f172a",
                        bg: "#f8fafc",
                      },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} style={{ background: bg, border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px" }}>
                        <p style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Charts */}
        {activeTab === "price" && hasData && (
          <>
            {/* Price */}
            <div style={card}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 22, color: "#0f172a" }}>{ticker} Price</h3>
              {chartType === "candle" ? (
                <CandlestickChart
                  rows={rows}
                  height={430}
                  selectedIndicators={selectedIndicators}
                  indicatorData={indicatorData}
                  labels={labels}
                />
              ) : (
                <ResponsiveContainer width="100%" height={430}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={["auto", "auto"]} stroke="#94a3b8" />
                    <Tooltip contentStyle={ttStyle} />
                    <Legend />
                    {getLabelSpans(labels).map(({ label, start, end }, idx) => (
                      <ReferenceArea key={idx}
                        x1={chartData[start]?.date} x2={chartData[end]?.date}
                        fill={label === "invest" ? "#22c55e" : "#ef4444"}
                        fillOpacity={0.10} strokeOpacity={0}
                      />
                    ))}
                    <Line type="monotone" dataKey="close" dot={false} stroke="#3b82f6" name="Close" strokeWidth={1.5} />
                    {showBB && <Line type="monotone" dataKey="BB_upper"  dot={false} stroke="#a78bfa" name="BB Upper"  strokeDasharray="4 2" strokeWidth={1} />}
                    {showBB && <Line type="monotone" dataKey="BB_middle" dot={false} stroke="#a78bfa" name="BB Mid"    strokeWidth={1} />}
                    {showBB && <Line type="monotone" dataKey="BB_lower"  dot={false} stroke="#a78bfa" name="BB Lower"  strokeDasharray="4 2" strokeWidth={1} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Label Distribution */}
            {labels.some((l) => l !== null) && (() => {
              const investCount  = labels.filter((l) => l === "invest").length;
              const noInvestCount = labels.filter((l) => l === "no-invest").length;
              const total        = investCount + noInvestCount;
              const investPct    = total > 0 ? ((investCount / total) * 100).toFixed(1) : "0.0";
              const noInvestPct  = total > 0 ? ((noInvestCount / total) * 100).toFixed(1) : "0.0";
              return (
                <div style={card}>
                  <h3 style={{ margin: "0 0 14px 0", fontSize: 20, color: "#0f172a" }}>Label Distribution</h3>

                  {/* Count row */}
                  <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                    <div style={{ flex: 1, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em" }}>Invest Days</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#15803d", lineHeight: 1 }}>{investCount}</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#16a34a" }}>{investPct}% of labeled days</p>
                    </div>
                    <div style={{ flex: 1, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em" }}>No-Invest Days</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#b91c1c", lineHeight: 1 }}>{noInvestCount}</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#dc2626" }}>{noInvestPct}% of labeled days</p>
                    </div>
                    <div style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Labeled</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>{total}</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#64748b" }}>of {labels.length} rows</p>
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", background: "#e2e8f0" }}>
                    <div style={{ width: `${investPct}%`, background: "#22c55e", transition: "width 0.4s ease" }} />
                    <div style={{ width: `${noInvestPct}%`, background: "#ef4444", transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "#22c55e", display: "inline-block" }} /> Invest
                    </span>
                    <span style={{ fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444", display: "inline-block" }} /> No-Invest
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* RSI */}
            {showRSI && (
              <div style={card}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#0f172a" }}>RSI (14)</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" ticks={[0, 30, 50, 70, 100]} />
                    <Tooltip contentStyle={ttStyle} />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "70", fill: "#ef4444", fontSize: 12 }} />
                    <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "30", fill: "#22c55e", fontSize: 12 }} />
                    <Line type="monotone" dataKey="RSI" dot={false} stroke="#38bdf8" strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* MACD */}
            {showMACD && (
              <div style={card}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#0f172a" }}>MACD</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={ttStyle} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="MACD_hist" fill="#94a3b8" name="Histogram" opacity={0.7} />
                    <Line type="monotone" dataKey="MACD"        dot={false} stroke="#fb7185" name="MACD"   strokeWidth={1.5} />
                    <Line type="monotone" dataKey="MACD_signal" dot={false} stroke="#f59e0b" name="Signal" strokeWidth={1.5} />
                    <Legend />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Volume */}
            <div style={card}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#0f172a" }}>{ticker} Volume</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" hide />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={ttStyle} />
                  <Bar dataKey="volume" fill="#3b82f6" opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* Empty state */}
        {activeTab === "price" && !hasData && !loading && !error && (
          <div style={{ ...card, color: "#64748b" }}>Enter a ticker and click Analyze.</div>
        )}

        {/* Compare chart — rendered in main content area */}
        {compareData && compareChartData.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: 20, color: "#0f172a" }}>Compare Tickers</h3>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Normalized to 100 at start of period</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={compareChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" hide />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={ttStyle} />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
                <Legend />
                {compareData.tickers.map((t, i) => (
                  <Line key={t} type="monotone" dataKey={t} dot={false}
                    stroke={COMPARE_COLORS[i % 5]} name={t} strokeWidth={1.8} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

      </main>
    </div>
  );
}

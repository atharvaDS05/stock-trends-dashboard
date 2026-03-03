import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
  ComposedChart, Legend,
} from "recharts";

const API = "http://127.0.0.1:8000";

const INDICATOR_OPTIONS = [
  { key: "BB",   label: "Bollinger Bands", color: "#a78bfa" },
  { key: "RSI",  label: "RSI (14)",        color: "#38bdf8" },
  { key: "MACD", label: "MACD",            color: "#fb7185" },
];

const COMPARE_COLORS = ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa"];

// ── Pure-SVG candlestick chart ────────────────────────────────────────────────
function CandlestickChart({ rows, height = 430, selectedIndicators, indicatorData }) {
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
      {/* Grid */}
      {yTicks.map((t, i) => (
        <line key={i} x1={padL} y1={toY(t)} x2={W - padR} y2={toY(t)}
          stroke="#374151" strokeWidth={0.6} />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((t, i) => (
        <text key={i} x={padL - 6} y={toY(t) + 4}
          fill="#9ca3af" fontSize={15} textAnchor="end">
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
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState(null);

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
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setRows(json.data || []);
      setIndicatorData(json.indicators || {});
    } catch (e) {
      setError(e.message || "Backend not reachable. Make sure FastAPI is running on port 8000.");
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
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setCompareData(await res.json());
    } catch (e) {
      setError(e.message || "Comparison failed.");
    } finally {
      setCompareLoading(false);
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
  const card       = { border: "1px solid #374151", borderRadius: 10, padding: "20px 26px", marginBottom: 20, background: "#1f2937" };
  const btnBase    = { padding: "11px 22px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 17 };
  const btnPrimary = { ...btnBase, background: "#3b82f6", color: "#fff" };
  const btnSec     = { ...btnBase, background: "#374151", color: "#d1d5db" };
  const lbl        = { fontSize: 16, color: "#9ca3af", marginBottom: 6, display: "block" };
  const sel        = { padding: "10px 14px", background: "#111827", color: "#e5e7eb", border: "1px solid #374151", borderRadius: 6, fontSize: 16 };
  const inp        = { ...sel, minWidth: 120 };
  const ttStyle    = { background: "#1f2937", border: "1px solid #374151", color: "#e5e7eb" };

  return (
    <div style={{ padding: "28px 36px", fontFamily: "system-ui,sans-serif", background: "#111827", minHeight: "100vh", color: "#e5e7eb", fontSize: 16 }}>
      <h2 style={{ margin: "0 0 20px 0", fontSize: 34, fontWeight: 700, color: "#f9fafb" }}>
        Stock Trends Analysis Dashboard
      </h2>

      {/* Controls */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <div><span style={lbl}>Ticker</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA" style={{ ...inp, width: 90 }} />
        </div>
        <div><span style={lbl}>Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={sel}>
            <option value="1d">1 day</option><option value="5d">5 days</option>
            <option value="1mo">1 month</option><option value="3mo">3 months</option>
            <option value="6mo">6 months</option><option value="1y">1 year</option>
            <option value="2y">2 years</option><option value="5y">5 years</option>
            <option value="10y">10 years</option><option value="ytd">Year to date</option>
            <option value="max">Max</option>
          </select>
        </div>
        <div><span style={lbl}>Interval</span>
          <select value={interval} onChange={(e) => setIntervalVal(e.target.value)} style={sel}>
            <option value="1m">1 min</option><option value="5m">5 min</option>
            <option value="15m">15 min</option><option value="30m">30 min</option>
            <option value="1h">1 hour</option><option value="1d">1 day</option>
            <option value="1wk">1 week</option><option value="1mo">1 month</option>
          </select>
        </div>
        <div><span style={lbl}>Chart Type</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["candle","line"].map((t) => (
              <button key={t} onClick={() => setChartType(t)}
                style={{ ...btnBase, background: chartType === t ? "#3b82f6" : "#374151", color: chartType === t ? "#fff" : "#d1d5db" }}>
                {t === "candle" ? "Candlestick" : "Line"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={analyze} style={{ ...btnPrimary, alignSelf: "flex-end" }} disabled={loading}>
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {/* Indicators */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 16, color: "#9ca3af", marginRight: 8 }}>Indicators:</span>
        {INDICATOR_OPTIONS.map(({ key, label, color }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 16, userSelect: "none" }}>
            <input type="checkbox" checked={selectedIndicators.includes(key)} onChange={() => toggleIndicator(key)} />
            <span style={{ color }}>{label}</span>
          </label>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...card, background: "#7f1d1d", border: "1px solid #ef4444", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* Charts */}
      {hasData && (
        <>
          {/* Price */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 22, color: "#f3f4f6" }}>{ticker} Price</h3>
            {chartType === "candle" ? (
              <CandlestickChart
                rows={rows}
                height={430}
                selectedIndicators={selectedIndicators}
                indicatorData={indicatorData}
              />
            ) : (
              <ResponsiveContainer width="100%" height={430}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={["auto","auto"]} stroke="#6b7280" />
                  <Tooltip contentStyle={ttStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="close"  dot={false} stroke="#60a5fa" name="Close" strokeWidth={1.5} />
                  {showBB && <Line type="monotone" dataKey="BB_upper"  dot={false} stroke="#a78bfa" name="BB Upper"  strokeDasharray="4 2" strokeWidth={1} />}
                  {showBB && <Line type="monotone" dataKey="BB_middle" dot={false} stroke="#a78bfa" name="BB Mid"    strokeWidth={1} />}
                  {showBB && <Line type="monotone" dataKey="BB_lower"  dot={false} stroke="#a78bfa" name="BB Lower"  strokeDasharray="4 2" strokeWidth={1} />}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* RSI */}
          {showRSI && (
            <div style={card}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#f3f4f6" }}>RSI (14)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0,100]} stroke="#6b7280" ticks={[0,30,50,70,100]} />
                  <Tooltip contentStyle={ttStyle} />
                  <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value:"70", fill:"#ef4444", fontSize:12 }} />
                  <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" label={{ value:"30", fill:"#22c55e", fontSize:12 }} />
                  <Line type="monotone" dataKey="RSI" dot={false} stroke="#38bdf8" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MACD */}
          {showMACD && (
            <div style={card}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#f3f4f6" }}>MACD</h3>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" hide />
                  <YAxis stroke="#6b7280" />
                  <Tooltip contentStyle={ttStyle} />
                  <ReferenceLine y={0} stroke="#6b7280" />
                  <Bar dataKey="MACD_hist" fill="#6b7280" name="Histogram" opacity={0.7} />
                  <Line type="monotone" dataKey="MACD"        dot={false} stroke="#fb7185" name="MACD"   strokeWidth={1.5} />
                  <Line type="monotone" dataKey="MACD_signal" dot={false} stroke="#fbbf24" name="Signal" strokeWidth={1.5} />
                  <Legend />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Volume */}
          <div style={card}>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 20, color: "#f3f4f6" }}>{ticker} Volume</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" hide />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={ttStyle} />
                <Bar dataKey="volume" fill="#3b82f6" opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!hasData && !loading && !error && (
        <div style={{ ...card, color: "#6b7280" }}>Enter a ticker and click Analyze.</div>
      )}

      {/* Comparison */}
      <div style={{ ...card, marginTop: 20 }}>
        <h3 style={{ margin: "0 0 14px 0", fontSize: 22, color: "#f3f4f6" }}>Multi-Ticker Comparison</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={compareInput} onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addCompareTicker()}
            placeholder="Add ticker…" style={{ ...inp, width: 110 }} />
          <button onClick={addCompareTicker} style={btnSec}>Add</button>
          {compareTickers.map((t, i) => (
            <span key={t} style={{ background: COMPARE_COLORS[i%5]+"33", color: COMPARE_COLORS[i%5], border:`1px solid ${COMPARE_COLORS[i%5]}`, padding:"3px 10px", borderRadius:20, fontSize:14, display:"flex", alignItems:"center", gap:5 }}>
              {t}
              <button onClick={() => removeCompareTicker(t)} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", padding:0 }}>×</button>
            </span>
          ))}
          {compareTickers.length > 0 && (
            <button onClick={compareStocks} style={btnPrimary} disabled={compareLoading}>
              {compareLoading ? "Loading…" : "Compare"}
            </button>
          )}
        </div>

        {compareData && compareChartData.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>Normalized to 100 at start of period</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={compareChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" hide />
                <YAxis stroke="#6b7280" />
                <Tooltip contentStyle={ttStyle} />
                <ReferenceLine y={100} stroke="#6b7280" strokeDasharray="3 3" />
                <Legend />
                {compareData.tickers.map((t, i) => (
                  <Line key={t} type="monotone" dataKey={t} dot={false}
                    stroke={COMPARE_COLORS[i%5]} name={t} strokeWidth={1.8} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

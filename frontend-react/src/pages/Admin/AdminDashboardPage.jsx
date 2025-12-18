import React, { useEffect, useMemo, useState, useRef, useContext } from "react";
import FlexTable from "../../components/FlexTable/FlexTable";
import SummaryCard from "../../components/SummaryCard/SummaryCard";
import MultiLineChart from "../../components/MultiLineChart";
import PieDonutChart from "../../components/PieDonutChart/PieDonutChart";
import DropdownSelect from "../../components/DropdownSelect/DropdownSelect";
import GenericModal from '../../components/GenericModal/GenericModal';
import { AuthContext } from "../../context/contextBase";
import {
  formatToUserTZSlash,
  isIsoLike,
  normalizeTimestampToMs,
} from "../../utils/dateUtils";

const BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_NODE_API_URL) ||
  "";
const ENDPOINTS = {
  users: `${BASE}/node/users`,
  subscribers: `${BASE}/node/subscribers`,
  marketlists: `${BASE}/node/marketlists`,
  anomalies: `${BASE}/node/anomalies`,
  cache: `${BASE}/node/cache`,
};

function safeCount(resp) {
  if (!resp) return 0;
  if (Array.isArray(resp)) return resp.length;
  if (typeof resp === "object") {
    if ("count" in resp && typeof resp.count === "number") return resp.count;
    if ("data" in resp && Array.isArray(resp.data)) return resp.data.length;
    if ("success" in resp && Array.isArray(resp.data)) return resp.data.length;
  }
  return 0;
}

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState({});
  const [previousCounts, setPreviousCounts] = useState({});
  const [lastWeekCounts, setLastWeekCounts] = useState(null);
  const [periodStats, setPeriodStats] = useState({});
  const [interval, setInterval] = useState("week");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartDates, setChartDates] = useState([]);
  const [chartSeries, setChartSeries] = useState([]);
  const [donutMode, setDonutMode] = useState("subscribers");
  const [donutData, setDonutData] = useState([]);
  const [singleLine, setSingleLine] = useState(false);
  const [chartHeight, setChartHeight] = useState(320);
  const summaryRef = useRef(null);
  const itemsRef = useRef({});
  const [recentActivity, setRecentActivity] = useState([]);
  const { user } = useContext(AuthContext) || {};
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  // adjust chart heights responsively based on viewport width (smaller)
  useEffect(() => {
    function updateHeight() {
      const w = window.innerWidth || document.documentElement.clientWidth;
      if (w < 480) setChartHeight(180);
      else if (w < 768) setChartHeight(220);
      else if (w < 1024) setChartHeight(280);
      else setChartHeight(320);
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  function tickerFromItem(it) {
    if (!it) return null;
    return (
      it.ticker ||
      it.symbol ||
      (it.meta && it.meta.ticker) ||
      (it.instrument && it.instrument.ticker) ||
      it.targetTicker ||
      null
    );
  }

  function buildDonutData(mode) {
    const items = (itemsRef.current && itemsRef.current[mode]) || [];
    const countsMap = {};
    if (mode === "subscribers") {
      // Subscribers likely store tickers as an array under several possible keys.
      const listKeys = [
        "tickers",
        "list",
        "subscriptions",
        "subscribed",
        "subscribedTickers",
        "symbols",
      ];
      for (const sub of items) {
        if (!sub) continue;
        let arr = null;
        for (const k of listKeys) {
          if (Array.isArray(sub[k]) && sub[k].length > 0) {
            arr = sub[k];
            break;
          }
        }
        // also check nested fields (e.g., sub.data.tickers)
        if (!arr && sub.data && typeof sub.data === "object") {
          for (const k of listKeys) {
            if (Array.isArray(sub.data[k]) && sub.data[k].length > 0) {
              arr = sub.data[k];
              break;
            }
          }
        }
        if (!arr) continue;
        for (const entry of arr) {
          let t = null;
          if (typeof entry === "string") t = entry;
          else if (entry && (entry.ticker || entry.symbol))
            t = entry.ticker || entry.symbol;
          if (!t) continue;
          countsMap[t] = (countsMap[t] || 0) + 1;
        }
      }
    } else {
      for (const it of items) {
        const t = tickerFromItem(it);
        if (!t) continue;
        countsMap[t] = (countsMap[t] || 0) + 1;
      }
    }
    const arr = Object.entries(countsMap).map(([name, value]) => ({
      name,
      value,
    }));
    arr.sort((a, b) => b.value - a.value);
    const top = arr.slice(0, 6);
    const other = arr.slice(6).reduce((s, x) => s + x.value, 0);
    if (other > 0) top.push({ name: "Other", value: other });
    setDonutData(top);
  }

  function extractTs(item) {
    const candidates = [
      "date",
      "datetime",
      "timestamp",
      "time",
      "createdAt",
      "created_at",
      "fetched_at",
      "fetchedAt",
      "updatedAt",
      "updated_at",
      "ts",
      "timeCreated",
    ];
    for (const key of candidates) {
      let v = item[key];
      if (v == null && item.meta && item.meta[key]) v = item.meta[key];
      if (v == null && item.instrument && item.instrument[key])
        v = item.instrument[key];
      if (v == null) continue;
      const norm = normalizeTimestampToMs(v);
      if (norm !== null) return norm;
      const parsed = Date.parse(String(v));
      if (!Number.isNaN(parsed)) return parsed;
      const num = Number(v);
      if (!Number.isNaN(num)) return num;
    }
    // try nested structures
    if (item.meta && typeof item.meta === "object") {
      for (const k of Object.keys(item.meta)) {
        const q = normalizeTimestampToMs(item.meta[k]);
        if (q !== null) return q;
      }
    }
    return null;
  }

  function buildChartSeries(itemsMap, chosenInterval) {
    const now = Date.now();
    let unitMs = 24 * 60 * 60 * 1000;
    let buckets = [];
    let n = 7;
    if (chosenInterval === "day") {
      unitMs = 60 * 60 * 1000;
      n = 24;
    } else if (chosenInterval === "week") {
      unitMs = 24 * 60 * 60 * 1000;
      n = 7;
    } else if (chosenInterval === "month") {
      unitMs = 24 * 60 * 60 * 1000;
      n = 30;
    } else if (chosenInterval === "year") {
      /* months */ n = 12;
    }

    if (chosenInterval === "year") {
      // start at beginning of the month n-1 months ago
      const list = [];
      const dt = new Date(now);
      dt.setDate(1);
      dt.setHours(0, 0, 0, 0);
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(dt.getFullYear(), dt.getMonth() - i, 1);
        list.push(d.getTime());
      }
      buckets = list;
    } else {
      const start = now - (n - 1) * unitMs;
      for (let i = 0; i < n; i++) buckets.push(start + i * unitMs);
    }

    const labels = buckets.map((b) => {
      try {
        if (chosenInterval === "day") {
          return new Date(b).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        const dt = new Date(b);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      } catch (e) {
        return String(b);
      }
    });

    const series = Object.keys(itemsMap || {}).map((key) => ({
      name: key,
      data: new Array(buckets.length).fill(0),
    }));

    // helper to find bucket index
    function findIndex(ts) {
      if (chosenInterval === "year") {
        for (let i = 0; i < buckets.length; i++) {
          const start = buckets[i];
          const end = i + 1 < buckets.length ? buckets[i + 1] : now + 1;
          if (ts >= start && ts < end) return i;
        }
        return -1;
      }
      const first = buckets[0];
      const idx = Math.floor((ts - first) / unitMs);
      if (idx < 0 || idx >= buckets.length) return -1;
      return idx;
    }

    for (const [ki, items] of Object.entries(itemsMap || {})) {
      const s = series.find((x) => x.name === ki);
      if (!s) continue;
      for (const it of items) {
        const ts = extractTs(it);
        if (ts === null) continue;
        const idx = findIndex(ts);
        if (idx >= 0) s.data[idx] += 1;
      }
    }

    setChartDates(labels);
    setChartSeries(series);
  }

  async function fetchAll(periodOverride, donutModeOverride) {
    setLoading(true);
    setError(null);
    try {
      const keys = Object.keys(ENDPOINTS);
      const promises = keys.map((k) =>
        fetch(ENDPOINTS[k])
          .then((r) => r.json())
          .catch(() => null)
      );
      const results = await Promise.all(promises);
      // store raw items for charting
      const itemsMap = {};
      keys.forEach((k, i) => {
        const res = results[i] || null;
        if (Array.isArray(res)) itemsMap[k] = res;
        else if (res && Array.isArray(res.data)) itemsMap[k] = res.data;
        else itemsMap[k] = [];
      });
      itemsRef.current = itemsMap;
      // build donut immediately from fetched items (allow override when caller wants new mode)
      try {
        buildDonutData(donutModeOverride || donutMode);
      } catch (e) {
        /* ignore */
      }
      const newCounts = {};
      const newPeriodStats = {};
      const now = Date.now();
      const msMap = {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
      };
      const chosen = periodOverride || interval;
      const periodMs = msMap[chosen] || msMap.week;
      let onePeriodAgo = now - periodMs;
      let twoPeriodAgo = now - 2 * periodMs;
      // Special-case 'day' to compare calendar days (today vs yesterday)
      if (chosen === "day") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        onePeriodAgo = startOfToday.getTime();
        twoPeriodAgo = onePeriodAgo - periodMs;
      }
      keys.forEach((k, i) => {
        const res = results[i] || null;
        let items = [];
        if (Array.isArray(res)) items = res;
        else if (res && Array.isArray(res.data)) items = res.data;
        newCounts[k] = items.length;

        // compute this period and previous period counts by scanning datetime-like fields
        let thisPeriod = 0;
        let prevPeriod = 0;
        // prefer collection-specific datetime fields when available
        let candidates = [
          "date",
          "datetime",
          "timestamp",
          "time",
          "createdAt",
          "created_at",
          "fetched_at",
          "updatedAt",
          "updated_at",
        ];
        if (k === "cache") {
          // cache entries should prefer `fetched_at` timestamp
          candidates = [
            "fetched_at",
            "fetchedAt",
            "date",
            "datetime",
            "timestamp",
            "time",
            "createdAt",
            "created_at",
            "updatedAt",
            "updated_at",
          ];
        }
        if (k === "users") {
          // users should use `createdAt` primarily (per request)
          candidates = [
            "createdAt",
            "timeCreated",
            "created_at",
            "date",
            "datetime",
            "timestamp",
            "time",
            "fetched_at",
            "updatedAt",
            "updated_at",
          ];
        }
        for (const it of items) {
          if (!it) continue;
          let d = null;
          for (const c of candidates) {
            const v = it[c];
            if (!v) continue;
            const parsed = Date.parse(v);
            if (!Number.isNaN(parsed)) {
              d = parsed;
              break;
            }
          }
          if (d === null && it.ts) {
            const parsed = Number(it.ts);
            if (!Number.isNaN(parsed)) d = parsed;
          }
          if (d === null) continue;
          if (d >= onePeriodAgo) thisPeriod += 1;
          else if (d >= twoPeriodAgo && d < onePeriodAgo) prevPeriod += 1;
        }
        newPeriodStats[k] = { thisPeriod, prevPeriod };
      });

      // save the current counts as "previous" before updating
      const old = counts || {};
      setPreviousCounts(old);
      try {
        localStorage.setItem("admin.previousCounts", JSON.stringify(old));
      } catch (e) {
        // ignore storage errors
      }
      setCounts(newCounts);
      setPeriodStats(newPeriodStats);
      // build chart series from fetched items
      try {
        buildChartSeries(itemsRef.current, periodOverride || interval);
      } catch (e) {
        // ignore chart build errors
      }

      // append to history in localStorage for weekly comparisons
      try {
        const raw = localStorage.getItem("admin.countHistory");
        const history = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        history.push({ ts: now, counts: newCounts });
        // keep only recent 60 entries
        const clipped = history.slice(-60);
        localStorage.setItem("admin.countHistory", JSON.stringify(clipped));
        // find snapshot closest to one period ago (or start of day for 'day')
        const periodAgo =
          (periodOverride || interval) === "day"
            ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
            : now - periodMs;
        let lastPeriod = null;
        for (let i = clipped.length - 1; i >= 0; i--) {
          if (clipped[i].ts <= periodAgo) {
            lastPeriod = clipped[i].counts;
            break;
          }
        }
        setLastWeekCounts(lastPeriod);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load persisted previous counts and history so indicators can show across reloads
    try {
      const rawPrev = localStorage.getItem("admin.previousCounts");
      if (rawPrev) setPreviousCounts(JSON.parse(rawPrev));
      const rawHist = localStorage.getItem("admin.countHistory");
      if (rawHist) {
        const hist = JSON.parse(rawHist);
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        let lastWeek = null;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].ts <= sevenDaysAgo) {
            lastWeek = hist[i].counts;
            break;
          }
        }
        if (lastWeek) setLastWeekCounts(lastWeek);
      }
    } catch (e) {
      // ignore
    }
    fetchAll();
    // fetch recent activity logs separately
    (async function fetchLogs() {
      try {
        const res = await fetch(`${BASE}/node/logs`);
        const json = await res.json();
        if (json && json.success && Array.isArray(json.groups)) setRecentActivity(json.groups);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Rebuild donut when counts update (i.e., after fetchAll) or when user switches mode
  useEffect(() => {
    try {
      buildDonutData(donutMode);
    } catch (e) {
      /* ignore */
    }
  }, [donutMode, counts]);

  const summaryItems = useMemo(
    () => [
      { key: "users", label: "Users" },
      { key: "subscribers", label: "Subscribers" },
      { key: "marketlists", label: "Marketlists" },
      { key: "anomalies", label: "Anomalies" },
      { key: "cache", label: "Cache" },
    ],
    []
  );

  // decide whether all cards fit in one line
  useEffect(() => {
    const check = () => {
      if (!summaryRef.current) return setSingleLine(false);
      const containerWidth = summaryRef.current.clientWidth;
      // estimate minimum card widths (conservative)
      const minCard = 140; // px (smaller cards)
      const gap = 16;
      const n = summaryItems.length;
      const required = n * minCard + Math.max(0, n - 1) * gap;
      setSingleLine(containerWidth >= required);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [summaryRef, summaryItems]);

  const periodLabelMap = {
    day: "1d",
    week: "7d",
    month: "30d",
    year: "1y",
  };

  const formatDate = (d) => {
    if (!d) return "";
    const tz = (user && user.timeZone) || undefined;
    // If numeric-like timestamp, normalize
    const ts = normalizeTimestampToMs(d);
    if (ts !== null) return formatToUserTZSlash(new Date(ts), tz);
    if (isIsoLike(String(d))) return formatToUserTZSlash(d, tz);
    try {
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      return formatToUserTZSlash(dt, tz);
    } catch (e) {
      return String(d);
    }
  };

  const formatTime = (d) => {
    if (!d) return "";
    const tz = (user && user.timeZone) || undefined;
    const ts = normalizeTimestampToMs(d);
    const dt = ts !== null ? new Date(ts) : new Date(d);
    try {
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      try { return new Date(d).toLocaleTimeString(); } catch { return String(d); }
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <div
        style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}
      >

<div
  style={{
    marginBottom: 16, // Added a little spacing below the whole header row
    width: "100%",
    display: "flex",
    justifyContent: "space-between", // Pushes items to opposite edges
    alignItems: "center",            // Vertically centers them
  }}
>
  <h1 style={{ marginTop : "10px" }}>Admin Dashboard</h1>

  <DropdownSelect
    value={interval}
    onChange={(v) => {
      setInterval(v);
      fetchAll(v);
    }}
    options={[
      { value: "day", label: "Day" },
      { value: "week", label: "Week" },
      { value: "month", label: "Month" },
      { value: "year", label: "Year" },
    ]}
    placeholder="Select period"
  />
</div>
        {singleLine ? (
          (() => {
            const maxInRow = summaryItems.length >= 4 ? 3 : summaryItems.length; // cap to 3 when 4+ items
            const firstRow = summaryItems.slice(0, maxInRow);
            const rest = summaryItems.slice(maxInRow);
            return (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    width: "100%",
                    alignItems: "stretch",
                    flexWrap: "nowrap",
                    overflowX: "auto",
                  }}
                  ref={summaryRef}
                >
                  {firstRow.map((it, idx) => (
                    <div
                      key={it.key}
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <SummaryCard
                        key={it.key}
                        label={it.label}
                        value={loading ? "..." : counts[it.key] ?? 0}
                        prev={
                          previousCounts ? previousCounts[it.key] : undefined
                        }
                        periodThis={
                          periodStats[it.key]
                            ? periodStats[it.key].thisPeriod
                            : undefined
                        }
                        periodPrev={
                          periodStats[it.key]
                            ? periodStats[it.key].prevPeriod
                            : undefined
                        }
                        periodLabel={periodLabelMap[interval]}
                        theme={idx % 2 === 0 ? "theme-light" : "theme-dark"}
                      />
                    </div>
                  ))}
                </div>
                {rest.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {rest.map((it, idx) => (
                      <div
                        key={it.key}
                        style={{
                          flex: "1 1 calc(33.333% - 16px)",
                          boxSizing: "border-box",
                        }}
                      >
                        <SummaryCard
                          key={it.key}
                          label={it.label}
                          value={loading ? "..." : counts[it.key] ?? 0}
                          prev={
                            previousCounts ? previousCounts[it.key] : undefined
                          }
                          periodThis={
                            periodStats[it.key]
                              ? periodStats[it.key].thisPeriod
                              : undefined
                          }
                          periodPrev={
                            periodStats[it.key]
                              ? periodStats[it.key].prevPeriod
                              : undefined
                          }
                          periodLabel={periodLabelMap[interval]}
                          theme={
                            (maxInRow + idx) % 2 === 0
                              ? "theme-light"
                              : "theme-dark"
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()
        ) : (
          <>
            {summaryItems.map((it, idx) => {
              // Alternate light/dark themes for cards
              const theme = idx % 2 === 0 ? "theme-light" : "theme-dark";
              return (
                <SummaryCard
                  key={it.key}
                  label={it.label}
                  value={loading ? "..." : counts[it.key] ?? 0}
                  prev={previousCounts ? previousCounts[it.key] : undefined}
                  periodThis={
                    periodStats[it.key]
                      ? periodStats[it.key].thisPeriod
                      : undefined
                  }
                  periodPrev={
                    periodStats[it.key]
                      ? periodStats[it.key].prevPeriod
                      : undefined
                  }
                  periodLabel={periodLabelMap[interval]}
                  theme={theme}
                />
              );
            })}
          </>
        )}
      </div>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
        <h3 >Collection Counts Over Time</h3>

            <MultiLineChart
              dates={chartDates}
              series={chartSeries}
              yLabel="Count"
              height={`${chartHeight}px`}
            />
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            {/* Donut on the right — top tickers by selected mode */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
                <h3>{donutMode === "subscribers" ? "Top Ticker Subscribers" : "Top Ticker Anomalies"}</h3>
              <DropdownSelect
                value={donutMode}
                onChange={(v) => {
                  setDonutMode(v);
                  setDonutData([]);
                  try {
                    fetchAll(undefined, v);
                  } catch (e) {
                    /* ignore */
                  }
                }}
                options={[
                  { value: "subscribers", label: "Subscribers" },
                  { value: "anomalies", label: "Anomalies" },
                ]}
                placeholder="Mode"
              />
            </div>
            
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
            
              <PieDonutChart
                data={donutData}
                title={
                  donutMode === "subscribers"
                    ? "Top Subscribers"
                    : "Top Anomalies"
                }
                width="100%"
                height={`${Math.max(160, Math.min(320, chartHeight))}px`}
              />
            </div>
          </div>
        </div>
      </div>
      <div>
        <h2 style={{ marginTop: 0 }}>Recent Activity (Node API usage)</h2>
        <div style={{ marginTop: 4 }}>
          {recentActivity && recentActivity.length > 0 ? (
            (() => {
              // Cap total visible items across all groups to 12
              const MAX_ITEMS = 12;
              let left = MAX_ITEMS;
              const displayGroups = [];
              for (const grp of recentActivity) {
                if (left <= 0) break;
                const arr = Array.isArray(grp.items) ? grp.items.slice(0, left) : [];
                if (arr.length) {
                  displayGroups.push({ date: grp.date, displayDate: grp.displayDate, items: arr });
                  left -= arr.length;
                }
              }

              return displayGroups.length > 0 ? displayGroups.map((grp) => {
                const items = grp.items.slice(0, 12);
                const cols = [];
                const colsCount = 4;
                const perCol = 3; // 3 lines per column
                for (let i = 0; i < colsCount; i++) {
                  const start = i * perCol;
                  const col = items.slice(start, start + perCol);
                  if (col.length) cols.push(col);
                }

                return (
                  <div key={grp.date} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 'clamp(13px, 1.2vw, 15px)' }}>{grp.displayDate}</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {cols.map((col, ci) => (
                        <div key={ci} style={{ flex: '1 1 0', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {col.map((it, ix) => (
                            <div key={ix} style={{ fontSize: 'clamp(13px, 1.3vw, 15px)', color: 'var(--text-primary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                              {(() => {
                                try {
                                  const dt = it.timestamp ? new Date(it.timestamp) : null;
                                  const itemKey = dt ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` : null;
                                  // user's local representation
                                  const userFull = it.timestamp ? formatToUserTZSlash(it.timestamp, (user && user.timeZone) || undefined) : '';
                                  const userDisplay = userFull ? (itemKey === grp.date ? String(userFull).split(' ')[1] : userFull) : '';
                                  // UTC short time for reference
                                  const utcFull = it.timestamp ? formatToUserTZSlash(it.timestamp, 'UTC') : '';
                                  const utcShort = utcFull ? String(utcFull).split(' ')[1] : '';
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 auto' }}>
                                      <div style={{ color: '#666', fontSize: 'clamp(11px, 0.9vw, 12px)' }}>{userDisplay}</div>
                                      {utcShort && <div style={{ color: '#999', fontSize: 'clamp(10px, 0.8vw, 11px)' }}>{utcShort} (UTC)</div>}
                                    </div>
                                  );
                                } catch (e) {
                                  return <div style={{ color: '#666', fontSize: 'clamp(12px, 1.0vw, 13px)' }}></div>;
                                }
                              })()}
                              <button
                                onClick={() => {
                                  try {
                                    // show user's local date and time: YYYY/MM/DD · HH:MM:SS
                                    const userLocalFull = it.timestamp ? formatToUserTZSlash(it.timestamp, (user && user.timeZone) || undefined) : '';
                                    const parts = userLocalFull ? String(userLocalFull).split(' ') : [];
                                    const dateOnly = parts.length ? parts[0] : (grp.displayDate || '');
                                    const userTime = parts.length > 1 ? parts.slice(1).join(' ') : '';
                                    const title = userTime ? `${dateOnly} · ${userTime}` : dateOnly;
                                    setModalTitle(title || (grp.displayDate || 'Log'));
                                    setModalContent((it.text || '').replace(/\n/g, ' '));
                                    setModalOpen(true);
                                  } catch (e) {
                                    setModalTitle(grp.displayDate || 'Log');
                                    setModalContent(String(it.text || ''));
                                    setModalOpen(true);
                                  }
                                }}
                                aria-label="View full log"
                                style={{
                                  background: 'var(--bg-secondary)',
                                  border: 'none',
                                  padding: 0,
                                  margin: 0,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  flex: '1 1 0',
                                  color: 'inherit',
                                  fontSize: 'inherit'
                                }}
                              >
                                {(it.text || '').replace(/\n/g, ' ')}
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                      {/* If no columns (shouldn't happen) show placeholder */}
                      {cols.length === 0 && <div style={{ color: '#666' }}>No recent activity</div>}
                    </div>
                  </div>
                );
              }) : <div style={{ color: '#666' }}>No recent activity</div>;
            })()
          ) : (
            <div style={{ color: '#666' }}>No recent activity</div>
          )}
        </div>
      </div>
      {/* Modal for full log text (uses GenericModal) */}
      <GenericModal isOpen={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)} showClose>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{modalContent}</div>
      </GenericModal>
    </div>
  );
}

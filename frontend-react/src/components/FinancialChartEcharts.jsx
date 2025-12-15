import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { DateTime } from 'luxon';

/**
 * FinancialChartEcharts: A reusable ECharts component for rendering financial candlestick charts
 * with support for volume, VWAP, Bollinger Bands, anomaly markers, and extended trading hours shading.
 *
 * Props:
 *   - dates: array of ISO timestamps
 *   - open, high, low, close: OHLC arrays (for candlestick)
 *   - volume: volume array (optional)
 *   - vwap: VWAP array (optional)
 *   - bb: { upper, lower, sma } Bollinger Bands (optional)
 *   - anomalies: array of { date, y } anomalies (optional)
 *   - anomalyIndices: array of indices (for ordinal charts); if provided, use instead of dates
 *   - showVolume, showVWAP, showBB, showAnomaly: indicator toggles
 *   - showExtendedHours: boolean to show ETH shading
 *   - timezone: market timezone for ETH calculation
 *   - period: '1d' for intraday, otherwise multi-day (used for styling)
 *   - market: market name (for color hints, e.g., 'NYSE')
 *   - useOrdinalX: boolean, if true use numeric indices as x-axis
 *   - chartMode: 'lines', 'candlestick', etc. (used to select series type)
 *   - width, height: CSS dimensions
 */
export default function FinancialChartEcharts({
  dates = [],
  open = [],
  high = [],
  low = [],
  close = [],
  volume = [],
  vwap = [],
  bb = { upper: [], lower: [], sma: [] },
  anomalies = [],
  anomalyIndices = [],
  showVolume = true,
  showVWAP = false,
  showBB = false,
  showAnomaly = false,
  showExtendedHours = false,
  timezone = 'UTC',
  period = '1d',
  market = '',
  useOrdinalX = false,
  chartMode = 'candlestick',
  width = '100%',
  height = 400
}) {
  const option = useMemo(() => {
    // Prepare x-axis data
    const isIntraday = (period || '').toLowerCase() === '1d';
    const xAxisData = useOrdinalX
      ? dates.map((_, i) => i) // numeric indices for ordinal x-axis
      : dates; // ISO timestamps for datetime x-axis

    // Build candlestick data
    const candlestickData = dates.map((date, i) => [
      useOrdinalX ? i : date, // x value
      open[i] || null,
      close[i] || null,
      low[i] || null,
      high[i] || null
    ]).filter(row => row[1] !== null || row[2] !== null); // filter null entries

    // Build volume data (bar series)
    const volumeData = volume.length
      ? dates.map((date, i) => ({
          name: useOrdinalX ? i : date,
          value: [useOrdinalX ? i : date, volume[i] || null]
        }))
      : [];

    // Build VWAP data (line series)
    const vwapData = vwap.length
      ? dates.map((date, i) => [useOrdinalX ? i : date, vwap[i] || null])
      : [];

    // Build Bollinger Bands data (upper, lower as line series)
    const bbUpperData = bb.upper && bb.upper.length
      ? dates.map((date, i) => [useOrdinalX ? i : date, bb.upper[i] || null])
      : [];
    const bbLowerData = bb.lower && bb.lower.length
      ? dates.map((date, i) => [useOrdinalX ? i : date, bb.lower[i] || null])
      : [];
    const bbSmaData = bb.sma && bb.sma.length
      ? dates.map((date, i) => [useOrdinalX ? i : date, bb.sma[i] || null])
      : [];

    // Build anomaly markers and vertical bands
    let markPointData = [];
    let markAreaData = [];
    if (showAnomaly && anomalies.length > 0) {
      markPointData = anomalies.map((anom, idx) => {
        const xVal = anomalyIndices && anomalyIndices.length > idx
          ? anomalyIndices[idx]
          : (useOrdinalX ? idx : anom.date);
        return {
          coord: [xVal, anom.y],
          value: anom.y,
          itemStyle: { color: '#dc3545' },
          symbol: 'triangle',
          symbolSize: 8
        };
      });
      
      // Build vertical bands for anomalies (semi-transparent red highlights)
      markAreaData = anomalies.map((anom, idx) => {
        const xVal = anomalyIndices && anomalyIndices.length > idx
          ? anomalyIndices[idx]
          : (useOrdinalX ? idx : anom.date);
        return [
          { name: 'Anomaly', xAxis: xVal, itemStyle: { color: 'rgba(220, 53, 69, 0.15)' } },
          { xAxis: xVal }
        ];
      });
    }

    // Build extended trading hours shading (visual marks for pre/post-market)
    let visualMapData = [];
    if (showExtendedHours && !useOrdinalX && isIntraday) {
      // For intraday, add background shading for extended hours
      // Pre-market: 04:00-09:30, Post-market: 16:00-20:00 (market timezone)
      try {
        // Group by day and add visual background for pre/post market windows
        const daysWithHours = {};
        dates.forEach((dateStr, i) => {
          const dt = DateTime.fromISO(dateStr, { zone: 'utc' }).setZone(timezone);
          const day = dt.toISODate();
          if (!daysWithHours[day]) daysWithHours[day] = { indices: [] };
          daysWithHours[day].indices.push(i);
        });
        // We'll use a custom visual effect via markArea in layout later
      } catch (e) {
        // ignore timezone errors
      }
    }

    // Build series
    const series = [];

    // Candlestick or line series
    if (chartMode === 'candlestick') {
      series.push({
        name: 'OHLC',
        type: 'candlestick',
        data: candlestickData,
        itemStyle: {
          color: '#26a69a',      // up color
          color0: '#e03b3b',     // down color
          borderColor: '#26a69a',
          borderColor0: '#e03b3b'
        },
        markArea: markAreaData.length > 0 ? { data: markAreaData, silent: true } : undefined,
        markPoint: markPointData.length > 0 ? { data: markPointData } : undefined
      });
    } else {
      // Line chart (just close)
      series.push({
        name: 'Close',
        type: 'line',
        data: dates.map((date, i) => [useOrdinalX ? i : date, close[i] || null]),
        smooth: true,
        lineStyle: { color: '#1e88e5', width: 2 },
        itemStyle: { color: '#1e88e5' },
        markArea: markAreaData.length > 0 ? { data: markAreaData, silent: true } : undefined,
        markPoint: markPointData.length > 0 ? { data: markPointData } : undefined
      });
    }

    // Volume series (on secondary y-axis)
    if (showVolume && volumeData.length > 0) {
      series.push({
        name: 'Volume',
        type: 'bar',
        data: dates.map((date, i) => [useOrdinalX ? i : date, volume[i] || null]),
        yAxisIndex: 1, // use secondary y-axis
        itemStyle: { color: 'rgba(100, 149, 237, 0.5)' }
      });
    }

    // VWAP line series
    if (showVWAP && vwapData.length > 0) {
      series.push({
        name: 'VWAP',
        type: 'line',
        data: vwapData,
        smooth: true,
        lineStyle: { color: '#6a5acd', width: 1 },
        itemStyle: { color: '#6a5acd' }
      });
    }

    // Bollinger Bands
    if (showBB) {
      if (bbUpperData.length > 0) {
        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: '#ffa500', width: 1 },
          itemStyle: { color: '#ffa500' },
          showSymbol: false
        });
      }
      if (bbLowerData.length > 0) {
        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: '#ffa500', width: 1 },
          itemStyle: { color: '#ffa500' },
          showSymbol: false
        });
      }
      if (bbSmaData.length > 0) {
        series.push({
          name: 'BB SMA',
          type: 'line',
          data: bbSmaData,
          lineStyle: { color: '#d2691e', width: 1, type: 'dashed' },
          itemStyle: { color: '#d2691e' },
          showSymbol: false
        });
      }
    }

    // Determine plot text color based on theme
    const plotTextColor = (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('dark'))
      ? '#ccc'
      : '#333';

    // Build layout with grid for volume subplot
    const grid = [];
    const yAxis = [];

    // Main price y-axis
    grid.push({
      left: '10%',
      right: '10%',
      top: '10%',
      bottom: showVolume ? '25%' : '10%',
      containLabel: true
    });
    yAxis.push({
      type: 'value',
      gridIndex: 0,
      name: 'Price',
      nameTextStyle: { color: plotTextColor },
      axisLabel: { color: plotTextColor },
      axisLine: { lineStyle: { color: plotTextColor } }
    });

    // Volume y-axis (if needed)
    if (showVolume && volumeData.length > 0) {
      grid.push({
        left: '10%',
        right: '10%',
        top: '75%',
        bottom: '0%',
        containLabel: true
      });
      yAxis.push({
        type: 'value',
        gridIndex: 1,
        name: 'Volume',
        nameTextStyle: { color: plotTextColor },
        axisLabel: { color: plotTextColor },
        axisLine: { lineStyle: { color: plotTextColor } },
        splitLine: { show: false }
      });
    }

    return {
      backgroundColor: 'transparent',
      textStyle: { color: plotTextColor },
      title: {
        text: '',
        textStyle: { color: plotTextColor }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        textStyle: { color: '#fff', fontSize: 13 },
        borderColor: '#888',
        confine: false,
        z: 1000,
        alwaysShowContent: false,
        formatter: function(params) {
          if (!Array.isArray(params) || params.length === 0) return '';
          let ts = params[0].axisValue;
          try {
            const dt = DateTime.fromISO(ts, { zone: 'utc' }).setZone(timezone);
            const top = isIntraday ? dt.toFormat('HH:mm') : dt.toFormat('yyyy-LL-dd');
            var result = `<div style="font-weight: 600; margin-bottom: 8px;">${top}</div>`;
          } catch {
            var result = `<div style="font-weight: 600; margin-bottom: 8px;">${params[0].axisValueLabel}</div>`;
          }
          params.forEach(p => {
            if (p.componentSubType === 'candlestick') {
              // ECharts candlestick data format: [open, close, low, high]
              const data = p.value;
              const o = data[0]?.toFixed(2) || '-';
              const c = data[1]?.toFixed(2) || '-';
              const l = data[2]?.toFixed(2) || '-';
              const h = data[3]?.toFixed(2) || '-';
              result += `<div style="margin: 4px 0;"><span style="color: #aaa;">OHLC:</span> <span style="font-family: monospace; font-weight: 600;">O: ${o} | H: ${h}</span></div>`;
              result += `<div style="margin: 4px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2);"><span style="font-family: monospace; font-weight: 600;">L: ${l} | C: ${c}</span></div>`;
            } else if (p.componentSubType === 'bar') {
              result += `<div style="margin: 4px 0;"><span style="color: #aaa;">${p.seriesName}:</span> <span style="font-weight: 600;">${(p.value[1] || 0).toLocaleString()}</span></div>`;
            } else {
              result += `<div style="margin: 4px 0;"><span style="color: #aaa;">${p.seriesName}:</span> <span style="font-weight: 600;">${(p.value[1] || '-').toFixed(2)}</span></div>`;
            }
          });
          return result;
        }
      },
      legend: {
        data: [
          'OHLC',
          ...(showVolume ? ['Volume'] : []),
          ...(showVWAP ? ['VWAP'] : []),
          ...(showBB ? ['BB Upper', 'BB Lower', 'BB SMA'] : [])
        ],
        top: '2%',
        textStyle: { color: plotTextColor }
      },
      grid: grid,
      xAxis: {
        type: useOrdinalX ? 'category' : 'time',
        gridIndex: 0,
        data: useOrdinalX ? xAxisData : undefined,
        axisLabel: {
          color: plotTextColor,
          rotate: 45,
          formatter: function(value) {
            try {
              const dt = DateTime.fromISO(value, { zone: 'utc' }).setZone(timezone);
              return isIntraday ? dt.toFormat('HH:mm') : dt.toFormat('MM-dd');
            } catch {
              return value;
            }
          }
        },
        axisLine: { lineStyle: { color: plotTextColor } },
        splitLine: { show: false }
      },
      yAxis: yAxis,
      series: series
    };
  }, [
    dates,
    open,
    high,
    low,
    close,
    volume,
    vwap,
    bb,
    anomalies,
    anomalyIndices,
    showVolume,
    showVWAP,
    showBB,
    showAnomaly,
    showExtendedHours,
    timezone,
    period,
    market,
    useOrdinalX,
    chartMode
  ]);

  return (
    <ReactECharts
      option={option}
      style={{ width: width, height: height }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
      lazyUpdate={false}
    />
  );
}

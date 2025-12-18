import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import PropTypes from 'prop-types';

const MultiLineChart = ({
  dates = [],           // X-axis labels or Time strings
  series = [],          // Array of objects: { name: 'Email', data: [120, ...] }
  stacked = false,      // If true, lines stack on top of each other
  stackGroup = 'Total', // The stack group name (useful if you have multiple stacks)
  theme = 'light',      // 'light' or 'dark'
  height = '400px',
  width = '100%',
  yLabel = '',          // Label for the Y-axis (e.g. "Revenue")
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], // Custom colors
  showLegend = true
}) => {

  // detect DOM theme class/attribute so chart updates when app toggles theme
  const domThemeFlag = (typeof document !== 'undefined') && (
    document.body.classList.contains('dark') ||
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
  );

  const option = useMemo(() => {
    // 1. Define strict black/white behavior: light -> black text; dark -> white text
    const isDark = (theme === 'dark') || domThemeFlag;
    const textColor = isDark ? '#ffffff' : '#000000';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#e6e6e6';
    const tooltipBg = isDark ? 'rgba(0,0,0,0.78)' : '#ffffff';
    
    // 2. Handle Empty State
    if (!series || series.length === 0) {
      return {
        title: {
          text: 'No Data Available',
          left: 'center',
          top: 'center',
          textStyle: { color: textColor, fontSize: 14 }
        }
      };
    }

    // 3. Detect Axis Type (Time vs Category)
    // Check if the first date entry looks like a timestamp or date string
    const firstDate = dates[0];
    const isTimeAxis = firstDate && (
      typeof firstDate === 'number' || 
      (typeof firstDate === 'string' && (firstDate.includes('-') || firstDate.includes('T')))
    );

    const xAxisConfig = isTimeAxis
      ? {
          type: 'time',
          boundaryGap: false,
          axisLine: { lineStyle: { color: textColor } },
          splitLine: { show: false }
        }
      : {
          type: 'category',
          boundaryGap: false,
          data: dates,
          axisLine: { lineStyle: { color: textColor } },
          axisTick: { alignWithLabel: true }
        };

    // 4. Transform Series Data
    const processedSeries = series.map((item, index) => {
      // If using time axis, ECharts expects data as [[date, value], [date, value]]
      const data = isTimeAxis 
        ? dates.map((d, i) => [d, item.data[i]]) 
        : item.data;

      return {
        name: item.name,
        type: 'line',
        stack: stacked ? stackGroup : undefined, // Apply stacking if enabled
        smooth: true,                            // Curved lines
        showSymbol: false,                       // Hide dots unless hovered
        symbolSize: 8,
        itemStyle: {
          color: colors[index % colors.length]   // Cycle through colors
        },
        lineStyle: {
          width: 3
        },
        areaStyle: stacked ? { opacity: 0.15 } : undefined, // Light fill if stacked
        emphasis: {
          focus: 'series' // Dim other lines on hover
        },
        data: data
      };
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: gridColor,
        textStyle: { color: textColor },
        axisPointer: { type: 'line' } // 'cross' or 'line'
      },
      legend: {
        show: showLegend,
        data: series.map(s => s.name),
        top: 0,
        left: '15%',
        bottom: 'auto',
        icon: 'circle',
        textStyle: { color: 'var(--text-primary)' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: showLegend ? 40 : 20,
        containLabel: true
      },
      xAxis: xAxisConfig,
      yAxis: {
        type: 'value',
        name: yLabel,
        nameLocation: 'end',
        splitLine: { lineStyle: { type: 'dashed', color: gridColor } },
        axisLabel: { color: 'var(--text-primary)' }
      },
      series: processedSeries
    };
  }, [dates, series, stacked, stackGroup, theme, yLabel, colors, showLegend, domThemeFlag]);

  return (
    <div style={{ width, height, position: 'relative' }}>
      <ReactECharts 
        option={option} 
        style={{ width: '100%', height: '100%' }}
        theme={theme}
        notMerge={true} // Ensures clean updates when data changes
      />
    </div>
  );
};

MultiLineChart.propTypes = {
  dates: PropTypes.array.isRequired,
  series: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    data: PropTypes.array.isRequired
  })).isRequired,
  stacked: PropTypes.bool,
  theme: PropTypes.oneOf(['light', 'dark']),
  height: PropTypes.string,
  colors: PropTypes.array
};

export default MultiLineChart;
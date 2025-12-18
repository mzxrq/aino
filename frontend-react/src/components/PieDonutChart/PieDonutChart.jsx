import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import PropTypes from 'prop-types';

const PieDonutChart = ({ data = [], title = '', height = '300px', width = '300px', colors }) => {
  const option = useMemo(() => {
    const defaultColors = colors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    return {
      backgroundColor: 'transparent',
      title: title ? { text: title, left: 'center', top: 8, textStyle: { fontSize: 14, color: 'var(--text-primary)' } } : undefined,
      tooltip: {
        backgroundColor: 'var(--bg-secondary)',
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        textStyle: { color: 'var(--text-primary)' }
      },
      legend: { orient: 'vertical', left: 'left', data: data.map(d => d.name), textStyle: { color: 'var(--text-primary)' } },
      color: defaultColors,
      series: [
        {
          name: title || 'Series',
          type: 'pie',
          radius: ['50%', '75%'],
          avoidLabelOverlap: false,
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: '16', fontWeight: 'bold', color: 'var(--text-primary)' } },
          labelLine: { show: false },
          data: data
        }
      ]
    };
  }, [data, title, colors]);

  return (
    <div style={{ width, height }}>
      <ReactECharts option={option} style={{ width: '100%', height: '100%' }} notMerge={true} />
    </div>
  );
};

PieDonutChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, value: PropTypes.number })),
  title: PropTypes.string,
  height: PropTypes.string,
  width: PropTypes.string,
  colors: PropTypes.array
};

export default PieDonutChart;

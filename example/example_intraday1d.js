/*
    * example_intraday1d.js
    * ------------------
    * This is an example ECharts option configuration for an intraday chart with breaks (single day).
    * It demonstrates how to set up time axis breaks and customize axis labels accordingly.
    * I would like to have a break in the intraday chart to represent a lunch break period.
    * and format the axis labels to show time before and after the break.
    * If the label falls within a break, it should show the start and end time of the break.
    * If the label falls on a trading period, it should show the time.
    * If the label is on the break boundary, it should show the break period.
    * If the label is on a weekend, it should not show any label.
    * If the label is on a holiday, it should not show any label.
    * If the label is too close to another label, it should not show any label.
    * I would like to customize the break area style to be invisible.
    * I would like to set a minimum zoom span of 1 hour for better visibility.
    * I would like to make the chart responsive to different screen sizes.
    * I would like to make the chart display 1 day of intraday data with breaks. !important
    * * Please adapt this chart to our existing ECharts setup.
    * ------------------
*/

var formatTime = echarts.time.format;
var _data = generateData1();
option = {
  // Choose axis ticks based on UTC time.
  useUTC: true,
  title: {
    text: 'Intraday Chart with Breaks (Single Day)',
    left: 'center'
  },
  tooltip: {
    show: true,
    trigger: 'axis'
  },
  xAxis: [
    {
      type: 'time',
      interval: 1000 * 60 * 30,
      axisLabel: {
        showMinLabel: true,
        showMaxLabel: true,
        formatter: (value, index, extra) => {
          if (!extra || !extra.break) {
            // The third parameter is `useUTC: true`.
            return formatTime(value, '{HH}:{mm}', true);
          }
          // Only render the label on break start, but not on break end.
          if (extra.break.type === 'start') {
            return (
              formatTime(extra.break.start, '{HH}:{mm}', true) +
              '/' +
              formatTime(extra.break.end, '{HH}:{mm}', true)
            );
          }
          return '';
        }
      },
      breakLabelLayout: {
        // Disable auto move of break labels if overlapping,
        // and use `axisLabel.formatter` to control the label display.
        moveOverlap: false
      },
      breaks: [
        {
          start: _data.breakStart,
          end: _data.breakEnd,
          gap: 0
        }
      ],
      breakArea: {
        expandOnClick: false,
        zigzagAmplitude: 0,
        zigzagZ: 200
      }
    }
  ],
  yAxis: {
    type: 'value',
    min: 'dataMin'
  },
  dataZoom: [
    {
      type: 'inside',
      xAxisIndex: 0
    },
    {
      type: 'slider',
      xAxisIndex: 0
    }
  ],
  series: [
    {
      type: 'line',
      symbolSize: 0,
      data: _data.seriesData
    }
  ]
};
/**
 * Generate random data, not relevant to echarts API.
 */
function generateData1() {
  var seriesData = [];
  var time = new Date('2024-04-09T09:30:00Z');
  var endTime = new Date('2024-04-09T15:00:00Z').getTime();
  var breakStart = new Date('2024-04-09T11:30:00Z').getTime();
  var breakEnd = new Date('2024-04-09T13:00:00Z').getTime();
  for (var val = 1669; time.getTime() <= endTime; ) {
    if (time.getTime() <= breakStart || time.getTime() >= breakEnd) {
      val =
        val +
        Math.floor((Math.random() - 0.5 * Math.sin(val / 1000)) * 20 * 100) /
          100;
      val = +val.toFixed(2);
      seriesData.push([time.getTime(), val]);
    }
    time.setMinutes(time.getMinutes() + 1);
  }
  return {
    seriesData: seriesData,
    breakStart: breakStart,
    breakEnd: breakEnd
  };
}
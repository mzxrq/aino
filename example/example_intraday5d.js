/* 
    * example_intraday5d.js
    * ------------------
    * This is an example ECharts option configuration for an intraday chart with breaks (multiple days).
    * It demonstrates how to set up time axis breaks for non-trading hours across multiple days
    * and customize axis labels accordingly.
    * I would like to have breaks in the intraday chart to represent non-trading hours between days.
    * and format the axis labels to show both time and date for that week.
    * If the label falls within a break, it should show the start and end time of the break.
    * If the label falls on a trading period, it should show the time and date.
    * If the label is on the date boundary, it should show the date as well.
    * If the label is on a break boundary, it should show the break period.
    * If the label is on a weekend, it should not show any label.
    * If the label is on a holiday, it should not show any label.
    * If the label is too close to another label, it should not show any label.
    * I would like to customize the break area style to be invisible.
    * I would like to set a minimum zoom span of 1 hour for better visibility.
    * I would like to make the chart responsive to different screen sizes.
    * I would like to make the chart display 5 days of intraday data with breaks. !important
    * Even if there are weekends or holidays in between, the breaks should be handled correctly.
    * Even if there are multiple consecutive holidays, the breaks should be handled correctly.
    * Even if it is Monday and there is still no data for the next day, the break should be handled correctly.
    * Even if it is Monday and there is still no data for the next several days, it should be rendering from Monday and leaving Tuesday, Wednesday, Thursday, Friday as empty.
    * * Please adapt this chart to our existing ECharts setup.
    * ------------------
*/
var roundTime = echarts.time.roundTime;
var formatTime = echarts.time.format;
var BREAK_GAP = '1%';
var DATA_ZOOM_MIN_VALUE_SPAN = 3600 * 1000;
var _data = generateData();
option = {
  // Choose axis ticks based on UTC time.
  useUTC: true,
  title: {
    text: 'Intraday Chart with Breaks (Multiple Days)',
    left: 'center'
  },
  tooltip: {
    show: true,
    trigger: 'axis'
  },
  grid: {
    outerBounds: {
      top: '20%',
      bottom: '30%'
    }
  },
  xAxis: [
    {
      type: 'time',
      interval: 1000 * 60 * 30,
      axisLabel: {
        showMinLabel: true,
        showMaxLabel: true,
        formatter(timestamp, _, opt) {
          if (opt.break) {
            // The third parameter is `useUTC: true`.
            return formatTime(timestamp, '{HH}:{mm}\n{weak|{dd}d}', true);
          }
          return formatTime(timestamp, '{HH}:{mm}', true);
        },
        rich: {
          weak: {
            color: '#999'
          }
        }
      },
      breaks: _data.breaks,
      breakArea: {
        expandOnClick: false,
        zigzagAmplitude: 0,
        zigzagZ: 200,
        itemStyle: {
          borderColor: 'none',
          opacity: 0
        }
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
      minValueSpan: DATA_ZOOM_MIN_VALUE_SPAN
    },
    {
      type: 'slider',
      top: '73%',
      minValueSpan: DATA_ZOOM_MIN_VALUE_SPAN
    }
  ],
  series: [
    {
      type: 'line',
      symbolSize: 0,
      areaStyle: {},
      data: _data.seriesData
    }
  ]
};
/**
 * Generate random data, not relevant to echarts API.
 */
function generateData() {
  var seriesData = [];
  var breaks = [];
  var time = new Date('2024-04-09T00:00:00Z');
  var endTime = new Date('2024-04-12T23:59:59Z').getTime();
  var todayCloseTime = new Date();
  updateDayTime(time, todayCloseTime);
  function updateDayTime(time, todayCloseTime) {
    roundTime(time, 'day', true);
    todayCloseTime.setTime(time.getTime());
    time.setUTCHours(9, 30); // Open time
    todayCloseTime.setUTCHours(16, 0); // Close time
  }
  var valBreak = false;
  for (var val = 1669; time.getTime() <= endTime; ) {
    var delta;
    if (valBreak) {
      delta =
        Math.floor((Math.random() - 0.5 * Math.sin(val / 1000)) * 20 * 100) /
        10;
      valBreak = false;
    } else {
      delta =
        Math.floor((Math.random() - 0.5 * Math.sin(val / 1000)) * 20 * 100) /
        100;
    }
    val = val + delta;
    val = +val.toFixed(2);
    seriesData.push([time.getTime(), val]);
    time.setMinutes(time.getMinutes() + 1);
    if (time.getTime() > todayCloseTime.getTime()) {
      // Use `NaN` to break the line.
      seriesData.push([time.getTime(), NaN]);
      var breakStart = todayCloseTime.getTime();
      time.setUTCDate(time.getUTCDate() + 1);
      updateDayTime(time, todayCloseTime);
      var breakEnd = time.getTime();
      valBreak = true;
      breaks.push({
        start: breakStart,
        end: breakEnd,
        gap: BREAK_GAP
      });
    }
  }
  return {
    seriesData: seriesData,
    breaks: breaks
  };
}
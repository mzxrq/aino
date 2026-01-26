import * as echarts from 'echarts/core';
import {
  CandlestickChart,
  LineChart,
  BarChart,
  ScatterChart
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  ToolboxComponent,
  AxisPointerComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Register only the components and charts used across the app
echarts.use([
  CandlestickChart,
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  ToolboxComponent,
  AxisPointerComponent,
  CanvasRenderer
]);

export default echarts;

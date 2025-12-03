import { useEffect, useState } from 'react';

export function useChartPreferences() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOverlay, setSidebarOverlay] = useState(true);
  const [sidebarDock, setSidebarDock] = useState('left'); // 'left' | 'right'
  const [showVolume, setShowVolume] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [plotlyTheme, setPlotlyTheme] = useState('auto');
  const [showLegend, setShowLegend] = useState(false); // Plotly legend visibility
  const [plotlyLegendPos, setPlotlyLegendPos] = useState('bottom-left'); // 'top-left'|'top-right'|'bottom-left'|'bottom-right'
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [toolbarDock, setToolbarDock] = useState('bottom'); // 'top' | 'bottom'
  const [legendPos, setLegendPos] = useState(null); // { top: number, left: number }

  // Load
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('chartPrefs') || '{}');
      if (saved.sidebarCollapsed !== undefined) setSidebarCollapsed(!!saved.sidebarCollapsed);
      if (saved.sidebarOverlay !== undefined) setSidebarOverlay(!!saved.sidebarOverlay);
      if (saved.sidebarDock) setSidebarDock(saved.sidebarDock);
      if (saved.showVolume !== undefined) setShowVolume(!!saved.showVolume);
      if (saved.showBollinger !== undefined) setShowBollinger(!!saved.showBollinger);
      if (saved.showRSI !== undefined) setShowRSI(!!saved.showRSI);
      if (saved.showVWAP !== undefined) setShowVWAP(!!saved.showVWAP);
      if (saved.showSMA !== undefined) setShowSMA(!!saved.showSMA);
      if (saved.plotlyTheme) setPlotlyTheme(saved.plotlyTheme);
      if (saved.showLegend !== undefined) setShowLegend(!!saved.showLegend);
      if (saved.plotlyLegendPos) setPlotlyLegendPos(saved.plotlyLegendPos);
      if (saved.toolbarCollapsed !== undefined) setToolbarCollapsed(!!saved.toolbarCollapsed);
      if (saved.toolbarDock) setToolbarDock(saved.toolbarDock);
      if (saved.legendPos) setLegendPos(saved.legendPos);
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    const prefs = { 
      sidebarCollapsed, sidebarOverlay, sidebarDock,
      showVolume, showBollinger, showRSI, showVWAP, showSMA,
      plotlyTheme, showLegend, plotlyLegendPos,
      toolbarCollapsed, toolbarDock,
      legendPos
    };
    try { localStorage.setItem('chartPrefs', JSON.stringify(prefs)); } catch {}
  }, [sidebarCollapsed, sidebarOverlay, sidebarDock, showVolume, showBollinger, showRSI, showVWAP, showSMA, plotlyTheme, showLegend, plotlyLegendPos, toolbarCollapsed, toolbarDock, legendPos]);

  return {
    sidebarCollapsed, setSidebarCollapsed,
    sidebarOverlay, setSidebarOverlay,
    sidebarDock, setSidebarDock,
    showVolume, setShowVolume,
    showBollinger, setShowBollinger,
    showRSI, setShowRSI,
    showVWAP, setShowVWAP,
    showSMA, setShowSMA,
    plotlyTheme, setPlotlyTheme,
    showLegend, setShowLegend,
    plotlyLegendPos, setPlotlyLegendPos,
    toolbarCollapsed, setToolbarCollapsed,
    toolbarDock, setToolbarDock,
    legendPos, setLegendPos,
  };
}

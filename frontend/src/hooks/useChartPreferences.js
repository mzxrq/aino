import { useEffect, useState } from 'react';

export function useChartPreferences() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOverlay, setSidebarOverlay] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [plotlyTheme, setPlotlyTheme] = useState('auto');
  const [showLegend, setShowLegend] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // Load
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('chartPrefs') || '{}');
      if (saved.sidebarCollapsed !== undefined) setSidebarCollapsed(!!saved.sidebarCollapsed);
      if (saved.sidebarOverlay !== undefined) setSidebarOverlay(!!saved.sidebarOverlay);
      if (saved.showVolume !== undefined) setShowVolume(!!saved.showVolume);
      if (saved.showBollinger !== undefined) setShowBollinger(!!saved.showBollinger);
      if (saved.showRSI !== undefined) setShowRSI(!!saved.showRSI);
      if (saved.showVWAP !== undefined) setShowVWAP(!!saved.showVWAP);
      if (saved.showSMA !== undefined) setShowSMA(!!saved.showSMA);
      if (saved.plotlyTheme) setPlotlyTheme(saved.plotlyTheme);
      if (saved.showLegend !== undefined) setShowLegend(!!saved.showLegend);
      if (saved.toolbarCollapsed !== undefined) setToolbarCollapsed(!!saved.toolbarCollapsed);
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    const prefs = { sidebarCollapsed, sidebarOverlay, showVolume, showBollinger, showRSI, showVWAP, showSMA, plotlyTheme, showLegend, toolbarCollapsed };
    try { localStorage.setItem('chartPrefs', JSON.stringify(prefs)); } catch {}
  }, [sidebarCollapsed, sidebarOverlay, showVolume, showBollinger, showRSI, showVWAP, showSMA, plotlyTheme, showLegend, toolbarCollapsed]);

  return {
    sidebarCollapsed, setSidebarCollapsed,
    sidebarOverlay, setSidebarOverlay,
    showVolume, setShowVolume,
    showBollinger, setShowBollinger,
    showRSI, setShowRSI,
    showVWAP, setShowVWAP,
    showSMA, setShowSMA,
    plotlyTheme, setPlotlyTheme,
    showLegend, setShowLegend,
    toolbarCollapsed, setToolbarCollapsed,
  };
}

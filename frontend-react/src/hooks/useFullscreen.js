import { useEffect, useState } from 'react';

export function useFullscreen(containerRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      const fsEl = document.fullscreenElement;
      const isFs = !!fsEl && (containerRef.current && (containerRef.current === fsEl || containerRef.current.contains(fsEl)));
      setIsFullscreen(isFs);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [containerRef]);

  async function toggleFullscreen() {
    try {
      const el = containerRef.current;
      if (!document.fullscreenElement) {
        if (el && el.requestFullscreen) await el.requestFullscreen();
        setIsFullscreen(true);
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }

  return { isFullscreen, toggleFullscreen };
}

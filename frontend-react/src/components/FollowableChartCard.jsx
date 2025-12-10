import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import ChartCardButtons from './ChartCardButtons';

/**
 * FollowableChartCard: Wrapper component that manages follow state and passes it to ChartCardButtons
 */
export default function FollowableChartCard({
  ticker,
  onExpandView,
  chartMode = 'lines',
  onModeChange,
  globalChartMode = 'auto',
  children // the chart content
}) {
  const { token, user } = useAuth();
  const [followed, setFollowed] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);

  // Check follow status on mount and when ticker/user changes
  useEffect(() => {
    let mounted = true;
    async function checkFollowStatus() {
      if (!user || !token) {
        if (mounted) setFollowed(false);
        return;
      }
      try {
        const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
        const res = await fetch(`${front}/node/subscribers/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            id: user.id || user._id || user.userId,
            ticker
          })
        });
        const j = await res.json();
        if (mounted) setFollowed(!!j.subscribed);
      } catch (e) {
        if (mounted) setFollowed(false);
      }
    }
    checkFollowStatus();
    return () => {
      mounted = false;
    };
  }, [ticker, token, user]);

  async function handleFollowToggle() {
    if (!user || !token) {
      alert('Please login to follow tickers');
      return;
    }

    const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    setIsLoadingFollow(true);

    try {
      if (followed) {
        // Unfollow
        const res = await fetch(`${front}/node/tickers/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            id: user.id || user._id || user.userId,
            tickers: [ticker]
          })
        });
        if (!res.ok) throw new Error('Failed to unfollow');
        setFollowed(false);
      } else {
        // Follow
        const res = await fetch(`${front}/node/subscribers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            id: user.id || user._id || user.userId,
            tickers: [ticker]
          })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || 'Failed to follow');
        setFollowed(true);
      }
    } catch (e) {
      alert(e.message || e.toString());
    } finally {
      setIsLoadingFollow(false);
    }
  }

  return (
    <>
      <div className="chart-card-header-with-buttons">
        <div className="chart-card-header-info">{children}</div>
        <ChartCardButtons
          ticker={ticker}
          followed={followed}
          onFollowToggle={handleFollowToggle}
          onExpandView={onExpandView}
          chartMode={chartMode}
          onModeChange={onModeChange}
          globalChartMode={globalChartMode}
          isLoadingFollow={isLoadingFollow}
        />
      </div>
    </>
  );
}

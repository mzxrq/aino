// MarketItemCard.jsx - web adaptation (consumes normalized item shape)
import React from "react";
import PropTypes from 'prop-types';

export default function MarketItemCard({ item }) {
  // normalized fields from MarketList: ticker, name, primaryExchange, sectorGroup, raw
  const ticker = item.ticker || item.Ticker || '';
  const company = item.name || item.company || item["Company Name"] || '';
  const primaryExchange = item.primaryExchange || item["Primary Exchange"] || '';
  const sectorGroup = item.sectorGroup || item["Sector Group"] || '';

  // optional numerical fields may be present on the normalized item or inside raw
  const price = (item.price ?? item.raw?.price ?? null);
  const change = (item.change ?? item.raw?.change ?? 0);
  const anomaly = (item.anomaly ?? item.raw?.anomaly ?? 0);

  const isUp = Number(change) >= 0;
  const priceStr = price != null ? new Intl.NumberFormat(undefined).format(price) : '-';
  const changeStr = `${Number(change) >= 0 ? '+' : ''}${Number(change).toFixed(1)}%`;

  return (
    <div style={styles.card}>
      {/* LEFT SIDE */}
      <div style={styles.leftSection}>
        <div style={styles.circle} />
        <div>
          <div style={styles.ticker}>{ticker}</div>
          <div style={styles.company}>{company || primaryExchange || 'Unknown'}</div>
          {sectorGroup ? <div style={styles.sector}>{sectorGroup}</div> : null}
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div style={styles.rightSection}>
        <div style={{ ...styles.price, color: isUp ? '#00FF88' : '#FF4F6D' }}>
          {priceStr}
        </div>

        <div style={{ ...styles.change, color: isUp ? '#00FF88' : '#FF4F6D' }}>
          {changeStr}
        </div>

        <div style={styles.anomaly}>
          Found {anomaly} {anomaly > 1 ? 'anomalies' : 'anomaly'}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#0A1221',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    border: '1px solid rgba(0,255,200,0.15)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 0 12px rgba(0,255,187,0.12)'
  },

  leftSection: {
    display: 'flex',
    alignItems: 'center',
  },

  circle: {
    width: 42,
    height: 42,
    borderRadius: 50,
    backgroundColor: '#1FC38A',
    marginRight: 14,
    flexShrink: 0
  },

  ticker: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 700,
  },

  company: {
    color: '#8CA0B3',
    fontSize: 12,
  },

  sector: {
    color: '#7DA8B8',
    fontSize: 11,
    marginTop: 4,
  },

  rightSection: {
    textAlign: 'right',
  },

  price: {
    fontSize: 18,
    fontWeight: 700,
  },

  change: {
    fontSize: 12,
    marginTop: 6,
  },

  anomaly: {
    color: '#00FFBB',
    fontSize: 12,
    marginTop: 6,
  },
};

MarketItemCard.propTypes = {
  item: PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string,
    primaryExchange: PropTypes.string,
    sectorGroup: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    change: PropTypes.number,
    anomaly: PropTypes.number,
    raw: PropTypes.object,
  }).isRequired,
};

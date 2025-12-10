// MarketItemCard.jsx
import React, { useState } from "react";
import PropTypes from "prop-types";

// Utility function to get company name from various possible fields
const getCompanyName = (item) => {
  return (
    item.companyName ||
    item.companyname ||
    item.company ||
    item.name ||
    item.Name ||
    item["Company Name"] ||
    item.company_name ||
    item.raw?.companyName ||
    item.raw?.company ||
    item.raw?.name ||
    "Unknown Company"
  );
};

export default function MarketItemCard({ item }) {
  const [logoError, setLogoError] = useState(false);

  // --- 1. Normalized Fields ---
  const ticker = item.ticker || item.Ticker || "";
  const company = getCompanyName(item);
  const primaryExchange = item.primaryExchange || item["Primary Exchange"] || "";
  const sectorGroup = item.sectorGroup || item["Sector Group"] || "";

  // --- 2. Numerical Fields ---
  const price = item.price ?? item.raw?.price ?? null;
  const change = Number(item.change ?? item.raw?.change ?? 0);
  const anomaly = Number(item.anomaly ?? item.raw?.anomaly ?? 0);

  const isUp = change >= 0;

  const priceStr =
    price != null
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(price)
      : "-";

  const changeStr = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const changeColor = isUp ? "#1FC38A" : "#E54C3A";
  const anomalyColor = anomaly > 0 ? "#00FFBB" : "#7DA8B8";

  // --- 3. Logo Handling ---
  // Optional automatic fallback using Clearbit (or your preferred source)
  const logoUrl = item.logo || `https://logo.clearbit.com/${ticker}.com`;
  const showLogo = logoUrl && !logoError;

  // --- 4. Render ---
  return (
    <div style={styles.card}>
      {/* LEFT SECTION */}
      <div style={styles.leftSection}>
        {showLogo ? (
          <img
            src={logoUrl}
            alt={ticker}
            style={styles.logo}
            onError={() => setLogoError(true)}
          />
        ) : (
          <div style={styles.circle}></div>
        )}

        <div style={styles.textBlock}>
          <div style={styles.ticker}>{ticker}</div>
          <div style={styles.company}>{company}</div>
          <div style={styles.sector}>
            {primaryExchange}
            {sectorGroup && ` • ${sectorGroup}`}
          </div>
        </div>
      </div>

      {/* RIGHT SECTION */}
      <div style={styles.rightSection}>
        <div style={{ ...styles.price }}>{priceStr}</div>
        <div style={{ ...styles.change, color: changeColor }}>{changeStr}</div>
        {anomaly > 0 && (
          <div style={{ ...styles.anomaly, color: anomalyColor }}>
            {anomaly} Anomaly{anomaly !== 1 ? "s" : ""} Detected
          </div>
        )}
      </div>
    </div>
  );
}

// --- Styles ---
const styles = {
  card: {
    backgroundColor: "#0E172A",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    border: "1px solid rgba(25, 36, 60, 0.9)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },

  leftSection: {
    display: "flex",
    alignItems: "center",
  },

  logo: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    marginRight: 14,
    flexShrink: 0,
    objectFit: "cover",
    backgroundColor: "#0E172A",
  },

  circle: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    backgroundColor: "#00B894",
    marginRight: 14,
    flexShrink: 0,
  },

  textBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },

  ticker: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: 700,
  },

  company: {
    color: "#A0AEC0",
    fontSize: 12,
  },

  sector: {
    color: "#718096",
    fontSize: 11,
  },

  rightSection: {
    textAlign: "right",
  },

  price: {
    fontSize: 18,
    fontWeight: 700,
    color: "#FFFFFF",
  },

  change: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 6,
  },

  anomaly: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 6,
  },
};

// --- Prop Types ---
MarketItemCard.propTypes = {
  item: PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string,
    companyName: PropTypes.string,
    primaryExchange: PropTypes.string,
    sectorGroup: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    change: PropTypes.number,
    anomaly: PropTypes.number,
    raw: PropTypes.object,
    logo: PropTypes.string,
  }).isRequired,
};

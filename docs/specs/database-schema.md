# MongoDB Database Schema

This document describes the MongoDB collections used by the Stock Anomaly Detection
project and the important fields stored in each collection.

---

## Collection: `users`

Stores user login and profile information.

| Field            | Type     | Description                                  |
| ---------------- | -------- | -------------------------------------------- |
| `_id`            | ObjectId | Primary key                                  |
| `email`          | String   | User email (login credential)                |
| `password`       | String   | Hashed password (bcrypt)                     |
| `name`           | String   | Full name                                    |
| `username`       | String   | Username                                     |
| `createdAt`      | Date     | Account creation timestamp                   |
| `sentOptions`    | String   | Preferred notification method (e.g. `email`) |
| `display_name`   | String   | Display name from LINE profile               |
| `last_login`     | Date     | Last login timestamp                         |
| `line_user_id`   | String   | LINE user id (for push messages)             |
| `picture_url`    | String   | LINE profile picture URL                     |
| `status_message` | String   | LINE status message                          |

---

## Collection: `subscribers`

Stores subscribers and their ticker subscriptions.

| Field     | Type          | Description                                  |
| --------- | ------------- | -------------------------------------------- |
| `_id`     | ObjectId      | Primary key                                  |
| `tickers` | Array[String] | List of stock tickers subscribed by the user |

---

## Collection: `anomalies`

Detected anomaly records produced by the detection engine.

| Field      | Type     | Description                                 |
| ---------- | -------- | ------------------------------------------- |
| `_id`      | ObjectId | Primary key                                 |
| `ticker`   | String   | Stock ticker symbol (e.g., `TSLA`)          |
| `datetime` | Date     | Timestamp of the recorded price             |
| `close`    | Number   | Closing price at that timestamp             |
| `volume`   | Number   | Trading volume                              |
| `sent`     | Boolean  | Whether the anomaly has been processed/sent |

---

## Collection: `marketlists`

Master list of market instruments and metadata (used to populate market lists).

| Field             | Type     | Description                                  |
| ----------------- | -------- | -------------------------------------------- |
| `_id`             | ObjectId | Primary key                                  |
| `country`         | String   | Country code (e.g., `US`)                    |
| `ticker`          | String   | Stock ticker symbol (e.g., `INTC`)           |
| `companyName`     | String   | Full company name                            |
| `primaryExchange` | String   | Exchange where the stock is listed           |
| `sectorGroup`     | String   | Industry / sector classification             |
| `status`          | String   | Activity status (e.g., `active`, `inactive`) |

---

## Collection: `cache`

Cache entries for chart payloads and other ephemeral data. Payload keys mirror
the JSON returned by the chart API.

| Field                              | Type            | Description                                              |
| ---------------------------------- | --------------- | -------------------------------------------------------- |
| `_id`                              | String/ObjectId | Primary key (e.g., `chart::TSLA::1d::1m`)                |
| `fetched_at`                       | Date            | UTC timestamp when cached                                |
| `ticker`                           | String          | Stock ticker symbol                                      |
| `companyName`                      | String          | Company name                                             |
| `primaryExchange`                  | String          | Exchange label                                           |
| `sectorGroup`                      | String          | Sector/industry grouping                                 |
| `status`                           | String          | Stock activity status (`active`, `inactive`, `delisted`) |
| `payload.dates`                    | Array[String]   | List of timestamp strings                                |
| `payload.open`                     | Array[Number]   | Open prices                                              |
| `payload.high`                     | Array[Number]   | High prices                                              |
| `payload.low`                      | Array[Number]   | Low prices                                               |
| `payload.close`                    | Array[Number]   | Close prices                                             |
| `payload.volume`                   | Array[Number]   | Trading volume values                                    |
| `payload.VWAP`                     | Array[Number]   | Volume-weighted average price                            |
| `payload.RSI`                      | Array[Number]   | Relative Strength Index values                           |
| `payload.displayTicker`            | String          | Display-friendly ticker                                  |
| `payload.rawTicker`                | String          | Raw ticker from DB/API                                   |
| `payload.price_change`             | Number          | Absolute price change                                    |
| `payload.pct_change`               | Number          | Percentage price change                                  |
| `payload.bollinger_bands.lower`    | Array[Number]   | Lower Bollinger Band                                     |
| `payload.bollinger_bands.upper`    | Array[Number]   | Upper Bollinger Band                                     |
| `payload.bollinger_bands.sma`      | Array[Number]   | Simple moving average (20-day)                           |
| `payload.anomaly_markers.dates`    | Array[String]   | Dates where anomalies occurred                           |
| `payload.anomaly_markers.y_values` | Array[Number]   | Price values of anomalies (Number or null)               |

---

## Example documents

Below are example documents for each collection and example insert commands you
can run in the Mongo shell or via `pymongo` for testing.

### `users` (example document)

```json
{
  "_id": { "$oid": "693230ed7f92bf43ff9dc29e" },
  "email": "alice@example.com",
  "password": "$2b$12$EXAMPLEBCRYPTHASHEDPASSWORD...",
  "name": "Alice Example",
  "username": "alice",
  "createdAt": { "$date": "2025-12-05T09:30:00Z" },
  "sentOptions": "email",
  "display_name": "Alice",
  "last_login": { "$date": "2025-12-05T12:05:00Z" },
  "line_user_id": "U1234567890abcdef",
  "picture_url": "https://example.com/avatars/alice.jpg",
  "status_message": "Trading smart"
}
```

Mongo shell insert:

```js
db.users.insertOne({
  email: "alice@example.com",
  password: "<bcrypt-hash>",
  name: "Alice Example",
  username: "alice",
  createdAt: new Date(),
  sentOptions: "email",
  display_name: "Alice",
  line_user_id: "U1234567890abcdef",
});
```

### `subscribers` (example document)

```json
{
  "_id": { "$oid": "6932310f7f92bf43ff9dc2a0" },
  "email": "alice@example.com",
  "tickers": ["AAPL", "INTC", "TSLA"]
}
```

Mongo shell insert:

```js
db.subscribers.insertOne({
  email: "alice@example.com",
  tickers: ["AAPL", "INTC", "TSLA"],
});
```

### `anomalies` (example document)

```json
{
  "_id": { "$oid": "6932316a7f92bf43ff9dc2a1" },
  "Ticker": "INTC",
  "Datetime": { "$date": "2025-12-05T11:45:00Z" },
  "Close": 35.12,
  "Volume": 2345678,
  "Sent": false
}
```

Mongo shell insert:

```js
db.anomalies.insertOne({
  Ticker: "INTC",
  Datetime: new Date(),
  Close: 35.12,
  Volume: 2345678,
  Sent: false,
});
```

### `marketlists` (example document)

```json
{
  "_id": { "$oid": "693232007f92bf43ff9dc2a2" },
  "country": "US",
  "ticker": "INTC",
  "companyName": "Intel Corporation",
  "primaryExchange": "NASDAQ",
  "sectorGroup": "CPUs/Integrated Devices",
  "status": "active"
}
```

Mongo shell insert:

```js
db.marketlists.insertOne({
  country: "US",
  ticker: "INTC",
  companyName: "Intel Corporation",
  primaryExchange: "NASDAQ",
  sectorGroup: "CPUs/Integrated Devices",
  status: "active",
});
```

### `cache` (example chart payload)

```json
{
  "_id": "chart::INTC::1mo::15m",
  "fetched_at": { "$date": "2025-12-05T12:00:00Z" },
  "ticker": "INTC",
  "companyName": "Intel Corporation",
  "primaryExchange": "NASDAQ",
  "sectorGroup": "CPUs/Integrated Devices",
  "status": "active",
  "payload": {
    "dates": ["2025-12-04T10:00:00Z", "2025-12-04T10:15:00Z"],
    "open": [35.0, 35.05],
    "high": [35.2, 35.25],
    "low": [34.9, 35.0],
    "close": [35.1, 35.12],
    "volume": [120000, 230000],
    "VWAP": [35.07, 35.1],
    "RSI": [45.2, 47.3],
    "bollinger_bands": {
      "lower": [33.5, 33.6],
      "upper": [36.5, 36.6],
      "sma": [34.0, 34.2]
    },
    "anomaly_markers": {
      "dates": ["2025-12-04T10:15:00Z"],
      "y_values": [35.12]
    }
  }
}
```

Mongo shell insert (example):

```js
db.cache.insertOne({
  _id: "chart::INTC::1mo::15m",
  fetched_at: new Date(),
  ticker: "INTC",
  companyName: "Intel Corporation",
  primaryExchange: "NASDAQ",
  payload: {
    /* ... */
  },
});
```

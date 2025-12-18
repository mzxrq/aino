# Favorites Feature Specification

## Overview
Favorites list is distinct from Followers/Subscriptions. Users can favorite any ticker to build a personal "watchlist" separate from subscription alerts.

---

## Data Model

### MongoDB Collection: `favorites`
```javascript
{
  _id: ObjectId,
  userId: ObjectId,          // ref users._id
  ticker: "AAPL",            // uppercase
  market: "US",              // market code: US, JP, TH
  addedAt: Date,             // creation timestamp
  note: "",                  // optional user note
  pinned: false              // optional: pin to top of list
}
```

### Indexes
```javascript
db.favorites.createIndex({ userId: 1, ticker: 1 }, { unique: true })
db.favorites.createIndex({ userId: 1, addedAt: -1 })
```

---

## API Endpoints (Node Backend)

### GET `/node/favorites`
Fetch user's favorites list. Requires auth.
```
Query params:
  limit=50 (default)
  skip=0
  sortBy=addedAt|ticker|pinned (default: addedAt)
  sortOrder=asc|desc (default: desc)

Response:
{
  success: true,
  data: [
    { _id, ticker, market, addedAt, pinned, note },
    ...
  ],
  total: 42,
  limit: 50,
  skip: 0
}
```

### POST `/node/favorites`
Add ticker to favorites. Requires auth.
```
Body:
{
  ticker: "AAPL",
  market: "US",
  note: "" (optional)
}

Response:
{
  success: true,
  data: { _id, ticker, market, addedAt, note, pinned }
}
```

### DELETE `/node/favorites/:tickerId`
Remove favorite. Requires auth.
```
Response:
{
  success: true,
  message: "Favorite removed"
}
```

### PATCH `/node/favorites/:tickerId`
Update favorite (e.g., pin, add note). Requires auth.
```
Body:
{
  pinned: true,
  note: "Strong buy signal detected"
}

Response:
{
  success: true,
  data: { _id, ticker, market, addedAt, note, pinned }
}
```

---

## Service Layer (Node)

### `backend-node/src/services/favoritesService.js`
- `addFavorite(userId, ticker, market, note)` — insert with duplicate check
- `removeFavorite(userId, tickerId)` — delete by _id
- `getFavorites(userId, { limit, skip, sortBy, sortOrder })` — paginated fetch
- `updateFavorite(userId, tickerId, { pinned, note })` — PATCH support
- **MongoDB fallback:** Read/write `src/cache/favorites.json` if DB unavailable

### `backend-node/src/controllers/favoritesController.js`
- Handlers for GET/POST/DELETE/PATCH routes
- Auth middleware: `requireAuth` (check token, load user)

### `backend-node/src/routes/favoritesRoutes.js`
- Register routes with auth middleware

---

## Frontend Integration (React)

### Components
- **FavoriteButton:** Star icon toggle; calls `POST /node/favorites` or `DELETE`.
  ```jsx
  <FavoriteButton 
    ticker="AAPL" 
    market="US"
    isFavorited={favoritesMap.has('AAPL')}
    onToggle={(isFav) => { ... }}
  />
  ```

- **FavoritesPage:** New page `/favorites` listing user's favorited tickers.
  - Search/filter by market
  - Sort by addedAt, ticker, pinned
  - Inline actions: remove, pin, add note
  - Integrate anomaly badges and current price

### Context/State
- `AuthContext`: Already normalizes user `id`
- Add to `useFetch` or similar: cache favorites list with TTL

---

## Comparison with Followers/Subscriptions

| Feature | Favorites | Followers/Subscriptions |
|---------|-----------|------------------------|
| Purpose | Personal watchlist | Get alerts on anomalies |
| Storage | `favorites` collection | `subscribers` collection |
| Trigger | Manual star click | Follow ticker |
| Notifications | None (view only) | LINE alerts on anomaly |
| Persistence | Per user | Per user |
| UI | Star icon, separate page | Heart/Follow button |

---

## Implementation Order
1. Create `favoritesService.js` (MongoDB + JSON fallback)
2. Create `favoritesController.js` (CRUD handlers)
3. Create `favoritesRoutes.js` (register with auth middleware)
4. Add `FavoriteButton.jsx` component
5. Create `/favorites` page (`FavoritesPage.jsx`)
6. Update `MarketList.jsx` to pass `isFavorited` to button
7. Update navigation to include Favorites link

---

## Notes
- User sees favorites only on their own account (auth enforced)
- Favorite can be added without following (no subscription) or vice versa
- Pinned favorites sort to top; useful for "watch these closely" list

# FootPulse

Football history and statistics from public data sources, with source attribution and explicit data-coverage boundaries.

## Current implementation

- Responsive React + TypeScript dashboard.
- OpenLigaDB match adapter with league/season selection and search.
- Loading and error states; no invented fallback scores.
- Match detail modal using only available source fields.
- YouTube search links for video discovery (not a verified archive yet).
- Initial normalized PostgreSQL schema for players, teams, competitions, seasons, matches, events, statistics, source IDs and video links.

Player/team profiles, historical imports and curated video metadata are intentionally not represented as complete until suitable free sources and reuse terms are verified.

## Run

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev:web
```

The frontend calls OpenLigaDB from the browser. Network or CORS restrictions are displayed as errors instead of fake results.

## Database

Apply `database/migrations/001_initial.sql` to PostgreSQL before using stored historical data. A backend and ingestion worker are the next implementation step.

## Free-data policy

Free access does not imply unrestricted reuse or complete historical coverage. Verify source terms, rate limits, attribution and redistribution rights before importing. Preserve external IDs, source payloads and import timestamps. Never replace missing statistics with invented values.

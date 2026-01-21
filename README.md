# 2026isback.com

Simulates 2016-era radio tracklists for Poland and US with synchronized YouTube playback.

## Running locally

Docker is all you need:

```bash
docker compose up --build
```

Visit http://localhost

The SQLite database lives in `data-n-analysis/database/` and persists between container restarts.

## How it works

- Backend generates radio logs using a simulator that goes back 10 years
- Frontend fetches tracklists from `/tracklist/us` and `/tracklist/pl`
- YouTube player syncs to the current song position based on server time
- Tracklists regenerate daily and are cached in memory

## Tech stack

- **Frontend**: React 19 + Vite (SWC), hosted by .NET static files
- **Backend**: .NET 10.0 Web API, minimal API with OpenAPI in dev
- **Database**: SQLite with Microsoft.Data.Sqlite
- **Runtime**: Alpine Linux in Docker (multi-stage build)
- **YouTube**: react-youtube (embeds, no API key needed)

## API

- `GET /tracklist/us` - US radio tracklist for today
- `GET /tracklist/pl` - Polish radio tracklist for today
- `GET /` - React SPA

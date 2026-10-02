# VPS release lane

These files are examples only; no live VPS change is performed by committing them.

## Intended production route

Frontend API base:

`https://midconversation.com/movie-ladder-api`

Nginx strips that prefix and proxies to the local Flask/Gunicorn service on `127.0.0.1:8092`.

## Bounded release sequence

1. Verify current host, user, repo path and active service state before changing anything.
2. Clone/pull this repository into the approved deployment directory.
3. Create a Python virtual environment and install `server/requirements.txt`.
4. Create a private persistent data directory owned only by the service account.
5. Copy `deploy/env.example` to a protected file outside the repo and replace the admin placeholder.
6. Install the systemd unit using the actual approved paths/user.
7. Add the nginx location to the existing HTTPS vhost; run `nginx -t` before reload.
8. Start/restart the API service.
9. Verify:
   - `GET /movie-ladder-api/api/health`
   - CORS from `https://ronavis.github.io`
   - Google sign-in returns the expected admin flag for the configured identity
   - non-admin identity receives 403 from `/api/admin/tmdb`
   - saving a TMDB token returns only configured/status fields, never the token
   - `GET /api/tmdb/search?title=Jaws&year=1975` returns normalized artwork after TMDB is configured
10. Only after those receipts pass, treat the frontend Settings page as live.

## Secrets

Never put the Google admin binding or TMDB Read Access Token in GitHub.

The admin binding belongs in the private service environment. The TMDB token is entered later through the admin Settings page and is written under `MOVIE_LADDER_DATA_DIR`.

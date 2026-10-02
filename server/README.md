# Movie Ladder API

This small Flask service keeps Google authorization and the TMDb credential off GitHub Pages.

## Required environment

- `MOVIE_LADDER_DATA_DIR` — private persistent directory, outside the repo checkout.
- `MOVIE_LADDER_ADMIN_EMAILS` **or** `MOVIE_LADDER_ADMIN_SUBS` — the only identity/identities allowed to open admin settings.
- `MOVIE_LADDER_GOOGLE_CLIENT_ID` — optional override; defaults to the public Google client ID used by the frontend.
- `MOVIE_LADDER_ALLOWED_ORIGINS` — optional comma-separated browser origins. Defaults to `https://ronavis.github.io` plus local port 8000.

The TMDb Read Access Token is intentionally **not** an environment requirement. The administrator saves/replaces it through the web Settings screen after Google sign-in. It is persisted as a mode-0600 private settings file inside `MOVIE_LADDER_DATA_DIR` and is never returned by the API.

## API surface

- `GET /api/health` — public health check
- `GET /api/session` — verified Google identity + admin flag
- `GET /api/admin/tmdb` — admin-only status; never returns the token
- `PUT /api/admin/tmdb` — admin-only save + verify token
- `POST /api/admin/tmdb/test` — admin-only test stored token
- `DELETE /api/admin/tmdb` — admin-only disconnect
- `GET /api/tmdb/movie/:id` — normalized TMDb movie metadata/artwork
- `GET /api/tmdb/search?title=...&year=...` — normalized search helper

## Suggested production mount

The frontend currently expects:

`https://midconversation.com/movie-ladder-api`

Deploy this service behind that path, stripping `/movie-ladder-api` before requests reach Flask, or update `config.js` to the actual public API base.

Run with a production WSGI server such as:

```sh
gunicorn -w 2 -b 127.0.0.1:8092 'server.app:create_app()'
```

The reverse proxy should terminate HTTPS and forward only the intended API path.

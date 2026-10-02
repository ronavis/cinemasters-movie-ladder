# Cinemasters Movie Ladder

A mobile-first movie trivia prototype for **Cinemasters of the Universe**.

**Live game:** https://ronavis.github.io/cinemasters-movie-ladder/

The project is intentionally focused on making the game fun first. It is not yet tied to the visual theme or navigation of cinemastersoftheuniverse.com.

## Current game

- 10-rung Movie Ladder
- 3-ticket life system
- escalating difficulty and point values
- anonymous play
- Google sign-in foundation for persistent identity
- admin-only Settings visibility
- TMDB connection management through the private API
- live TMDB artwork lookup with graceful fallback when the API is unavailable

## Trust boundary

The GitHub Pages site is presentation only.

The planned API lives at:

`https://midconversation.com/movie-ladder-api`

The browser may hold a short-lived Google ID credential in `sessionStorage`, matching the pattern used by Nick's Arcade. It **never** stores the TMDB API Read Access Token.

The API:

1. verifies the Google ID token with Google;
2. decides whether the verified identity is the configured Movie Ladder administrator;
3. exposes TMDB settings only to that administrator;
4. stores the TMDB token in private VPS storage with mode-0600 file permissions;
5. never returns that token to the browser;
6. proxies normalized movie metadata and artwork URLs to the public game.

The administrator is configured on the VPS with `MOVIE_LADDER_ADMIN_EMAILS` and/or the stronger stable Google subject binding `MOVIE_LADDER_ADMIN_SUBS`. No administrator identity is hard-coded into the public frontend.

## Source layout

- `index.html` — game, account dialog and admin Settings screen
- `styles.css` — iPhone-first responsive UI
- `config.js` — public API base + public Google OAuth client ID
- `app.js` — game flow, Google sign-in, settings calls and TMDB artwork loading
- `data/questions.js` — prototype questions + TMDB lookup metadata
- `server/app.py` — Flask identity/TMDB API
- `server/README.md` — deployment contract
- `.github/workflows/validate.yml` — JavaScript/Python syntax and API-construction validation

## TMDB

Movie Ladder uses an application-level **API Read Access Token** as a Bearer token. The admin Settings screen verifies a submitted token against TMDB's application-level configuration endpoint before it is saved.

The UI includes TMDB's required attribution notice. Before treating this as a release-complete integration, add one of TMDB's current approved logo assets to the Credits/About presentation as required by their branding guidance.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Deployment

GitHub Pages serves the `gh-pages` branch. Source work happens on `main`.

The frontend remains fully playable if the API is unavailable; TMDB artwork and account/admin features simply fall back until the VPS API is deployed and configured.

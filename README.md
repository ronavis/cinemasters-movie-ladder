# Cinemasters Movie Ladder

A mobile-first movie trivia prototype for **Cinemasters of the Universe**.

This repository is intentionally focused on the game itself before any integration with the main Cinemasters website.

## Prototype goals

- Feel excellent on an iPhone in portrait orientation.
- Make each run quick, visual, and replayable.
- Use a 3-ticket ladder structure with escalating difficulty.
- Keep movie data and artwork behind a clean data seam so TMDb can be connected later.
- Stay deployable as a static GitHub Pages app while the gameplay is being worked out.

## Planned public URL

Once GitHub Pages is enabled from the `gh-pages` branch:

https://ronavis.github.io/cinemasters-movie-ladder/

## Current architecture

No backend is required for the prototype.

- `index.html` — game shell
- `styles.css` — responsive mobile-first presentation
- `app.js` — game state, scoring, lives, question flow, replay
- `data/questions.js` — curated prototype question catalog

A later TMDb integration can populate movie metadata and artwork without changing the core game loop.

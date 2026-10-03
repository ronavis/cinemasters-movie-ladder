# Cinemasters Movie Ladder

A mobile-first movie trivia game for **Cinemasters of the Universe**.

**Live game:** https://ronavis.github.io/cinemasters-movie-ladder/

Movie Ladder is built around a 10-rung run. The player starts as a Moviegoer, climbs toward Cinemaster, and gets three tickets (lives). Questions become harder and more valuable as the player climbs.

---

## What is live today

- 10-rung Movie Ladder
- 3-ticket life system
- escalating difficulty and point values
- anonymous play
- optional Google sign-in
- Ron-only administrator Settings
- TMDb-backed movie posters
- TMDb actor profile photos for cast questions
- TMDb director profile photos for director questions
- 2x2 poster-grid answers when all four choices are movies
- server-backed CSV question imports
- one question selected from each rung's question pool for every new run
- rank-specific result graphics
- recent run history and personal bests
- signed-in run history synced through the VPS

The frontend is static GitHub Pages. The private API runs inside the existing Nick's Arcade Flask service on the VPS.

---

# Adding trivia questions

## Recommended method: CSV import

New questions should normally be added from:

**Movie Ladder -> Settings -> Trivia question bank**

Only the verified Movie Ladder administrator can see and use these controls.

The flow is:

1. Sign in with the Movie Ladder administrator Google account.
2. Open **Settings**.
3. Find **Trivia question bank**.
4. Download the blank CSV template.
5. Fill in the CSV.
6. Choose the CSV file in Settings.
7. Click **Validate & preview**.
8. Fix any reported row errors.
9. Review the preview.
10. Choose whether to **Add new questions** or **Replace all previously imported questions**.
11. Click **Import questions**.

Selecting a file does **not** write anything to production. Validation is preview-only. The bank is changed only after the explicit Import action.

The blank template lives at:

`data/trivia-template.csv`

---

## How the question bank works

A game is always **10 rungs**.

Imported questions do not make the ladder longer. Every question belongs to a rung from 1 through 10.

At the beginning of a new run, Movie Ladder builds a pool for each rung from:

- the built-in question assigned to that rung; and
- all CSV-imported questions assigned to that rung.

It then chooses one candidate for each rung.

Example:

- built-in Rung 7 question: Brazil
- CSV imports: four additional Rung 7 questions

Rung 7 now has five possible questions, but the game is still only 10 rungs long.

Built-in questions remain available even when CSV questions are imported. The **Replace** option replaces the previously imported question bank; it does not delete the built-ins.

The **Clear imported questions** button also leaves the built-in questions untouched.

---

# CSV column reference

The current template header is:

```csv
rung,question,answer_type,answer1,answer1_year,answer2,answer2_year,answer3,answer3_year,answer4,answer4_year,correct,explanation,display_title,display_year,genre,hero_movie,hero_year,difficulty,points
```

## Required columns

| Column | Meaning |
| --- | --- |
| `rung` | Ladder rung, 1 through 10 |
| `question` | The question shown to the player |
| `answer_type` | `text`, `actor`, `director`, or `movie` |
| `answer1` ... `answer4` | Four distinct answer choices |
| `correct` | Correct answer number: **1, 2, 3, or 4** |

## Optional columns

| Column | Meaning |
| --- | --- |
| `answer1_year` ... `answer4_year` | Movie release years. Most useful for `movie` questions so TMDb resolves the intended posters. |
| `explanation` | Feedback shown after answering. If blank, Movie Ladder generates a simple “The correct answer is ...” message. |
| `display_title` | Neutral title shown above the question. |
| `display_year` | Year shown beside the display title. |
| `genre` | Subtitle/category shown with the display title. Defaults to `Trivia`. |
| `hero_movie` | Movie to use for the large hero poster on text/person questions. |
| `hero_year` | Release year used to improve the hero-movie TMDb match. |
| `difficulty` | Optional display label. If blank, a default based on the rung is used. |
| `points` | Optional point value. If blank, defaults to rung x 100. |

### Import limits

- up to **500 questions per CSV import**
- up to **1 MB per CSV**
- up to **5,000 imported questions** in the stored bank

Duplicate questions within the same CSV are rejected. In **Add** mode, questions already present in the imported bank are skipped.

---

# The four answer types

## 1. `text`

Use this when the choices are facts, numbers, characters, objects, dates, etc.

Example:

```csv
3,How fast must the DeLorean travel to trigger time travel?,text,77 mph,,88 mph,,99 mph,,100 mph,,2,The DeLorean activates time travel at 88 mph.,Back to the Future,1985,Sci-Fi / Comedy,Back to the Future,1985,Easy,300
```

The question uses the `hero_movie` poster and ordinary text answer buttons.

---

## 2. `actor`

Use this when all four choices are performers.

Example:

```csv
1,Who played Indiana Jones?,actor,Harrison Ford,,Kurt Russell,,Tom Selleck,,Michael Douglas,,1,Harrison Ford played Indiana Jones.,Raiders of the Lost Ark,1981,Adventure,Raiders of the Lost Ark,1981,Warm-up,100
```

Movie Ladder:

- uses the hero movie poster;
- searches TMDb for each person;
- prefers people whose known department is **Acting**; and
- places circular profile photos beside the answer names when available.

If TMDb has no usable profile photo, the answer gracefully remains text-only.

---

## 3. `director`

Use this when all four choices are directors.

Example:

```csv
2,Who directed Jaws?,director,George Lucas,,Steven Spielberg,,Brian De Palma,,William Friedkin,,2,Steven Spielberg directed Jaws.,Jaws,1975,Thriller,Jaws,1975,Warm-up,200
```

This works like an actor question, except TMDb person lookup prefers the **Directing** department.

If TMDb does not provide a usable director-profile image, Movie Ladder tries the same person's **Acting** profile as a photo fallback. This is useful for filmmaker-performers such as Jordan Peele or Greta Gerwig.

The fallback changes only the image lookup. The answer remains a director answer, and Movie Ladder requires the returned acting-profile name to match the requested person before using the photo.

---

## 4. `movie`

Use this whenever all four choices are movies.

Example:

```csv
5,Which of these movies was released first?,movie,Rocky,1976,Star Wars,1977,Jaws,1975,Alien,1979,3,Jaws was released in 1975.,Release Order,,Timeline,,,Movie buff,500
```

Movie Ladder replaces the single hero poster and ordinary answer buttons with a **2x2 grid of four TMDb posters**. The posters themselves are the answer buttons.

For `movie` rows:

- fill in the answer-year columns whenever possible;
- `hero_movie` is not needed;
- use a neutral `display_title` such as “Release Order” or “49th Academy Awards.”

### Ordered release-timeline questions

Movie Ladder automatically turns a four-poster movie question into an **ordered timeline interaction** when:

- `genre` is exactly `Timeline` (case-insensitive); and
- all four answer movies have a release year.

Instead of choosing one answer, the player taps the posters from **earliest release to latest release**.

The first selected poster gets a **1** badge, the next gets **2**, then **3**, then **4**. The answer is scored only after all four posters have been selected.

Movie Ladder prefers TMDb's **full release date** for ordering. This allows two movies from the same year to be ordered correctly—for example, *Taxi Driver* and *Network* are both 1976 releases.

If exact release dates cannot resolve a tied-year set safely, Movie Ladder falls back to the original single-answer wording rather than inventing an order.

If the sequence is wrong, Movie Ladder keeps the player's numbered order visible and shows the correct chronological order in the feedback.

---

# Do not give away the answer with artwork

This is an important content rule.

If the question asks the player to identify one movie from four movie choices, do **not** use the correct movie as a hero image or title.

Bad:

> Display title: Rocky  
> Question: Which film won Best Picture?

That telegraphs the answer.

Good:

> Display title: 49th Academy Awards  
> Question: Which film won Best Picture at the 49th Academy Awards?

The four answer posters then receive equal visual treatment.

As a general rule:

- **one movie is the subject** -> a full hero poster is appropriate;
- **four movies are the choices** -> use `answer_type=movie` and let the four-poster grid own the artwork.

---

# Choosing a rung

The rung controls where the question can appear.

Current default difficulty/points model:

| Rung | Default difficulty | Default points |
| ---: | --- | ---: |
| 1 | Warm-up | 100 |
| 2 | Warm-up | 200 |
| 3 | Easy | 300 |
| 4 | Movie buff | 400 |
| 5 | Movie buff | 500 |
| 6 | Movie buff | 600 |
| 7 | Film nerd | 700 |
| 8 | Film nerd | 800 |
| 9 | Deep cut | 900 |
| 10 | Cinemaster | 1,000 |

CSV rows may override the difficulty label and point value, but the rung still determines where the question enters the run.

---

# Admin import modes

## Add new questions; skip duplicates

This is the normal mode.

- existing imported questions remain;
- new questions are added;
- exact normalized duplicates already in the bank are skipped.

## Replace all previously imported questions

Use this when a CSV should become the entire **imported** bank.

This does not remove the built-in questions.

## Clear imported questions

Deletes the server-stored imported bank and returns the game to built-ins only.

---

# Where imported questions are stored

Imported questions are **not** committed to GitHub.

They are normalized and stored privately on the VPS in the existing Nick's Arcade SQLite-backed `metadata` store.

Relevant metadata keys:

- `movie_ladder_custom_questions`
- `movie_ladder_questions_updated_at`

This means:

- imports are immediately available to all players;
- GitHub Pages does not contain the private stored bank;
- normal Nick's Arcade data backups protect the imported bank;
- redeploying the application code does not intentionally replace the persistent imported questions.

The public game can read normalized questions from:

`GET /arcade-api/movie-ladder/questions`

The validate/import/delete endpoints require authenticated Movie Ladder administrator authority.

---

# TMDb behavior

Movie Ladder uses TMDb for presentation data.

## Movie lookup

Used for:

- hero posters;
- four-movie answer grids.

Movie title + year is preferred whenever the year is known.

## Person lookup

Used for:

- actor answers;
- director answers.

Actor questions prefer TMDb's **Acting** department.

Director questions prefer TMDb's **Directing** department.

## Credential boundary

The TMDb API Read Access Token:

- is configured through administrator Settings;
- is sent to the VPS over HTTPS;
- is verified server-side;
- is stored in the private SQLite-backed metadata store;
- is never returned to the browser.

The browser receives normalized public movie/person information, not the TMDb credential.

This product uses the TMDb API but is not endorsed or certified by TMDb.

---

# Question correctness analytics

Movie Ladder records anonymous per-question answer events so the question bank can be tuned using real play data.

The goal is editorial quality: identify questions that are consistently too easy, too hard, confusing, misleading, or poor fits for their rung.

For each answered question, Movie Ladder records:

- a random event UUID;
- the random run UUID;
- question ID;
- rung;
- answer type;
- a snapshot of the question and four answer choices;
- the selected answer index or ordered timeline sequence;
- the correct answer index or correct timeline sequence;
- whether the response was correct;
- server timestamp.

These analytics events do **not** store the player's Google email or account identity.

Anonymous players contribute to the same aggregate question-quality data.

The browser keeps a small local retry queue and attempts to resend events if the analytics API is temporarily unavailable.

Public recording endpoint:

`POST /arcade-api/movie-ladder/question-events`

Question-level aggregate statistics are administrator-only:

`GET /arcade-api/movie-ladder/admin/question-stats`

The aggregate response includes attempts, correct answers, wrong answers, accuracy percentage, rung, answer type, question text, and last-seen timestamp.

This gives the administrator a basis for decisions such as:

- reconsider a question that most players repeatedly miss;
- move a question to a different rung;
- replace confusing wording or weak distractors;
- identify questions that are so easy they add little value.

---

# Run history, best runs, and result ranks

Movie Ladder records a summary when a run ends.

The result screen uses six outcome ranks:

- **Moviegoer**
- **Video Store Clerk**
- **Projectionist**
- **Film Buff**
- **Movie Scholar**
- **Cinemaster**

**Cinemaster is reserved for clearing all 10 rungs.** Reaching Rung 10 and losing there still finishes as Movie Scholar.

Each rank has its own result graphic and result copy.

## Viewing runs

Use the **Runs** button in the Movie Ladder toolbar, or **View Run History** on the result screen.

The history view shows:

- best score;
- highest rung reached;
- number of Cinemaster clears;
- the five best runs by score;
- recent runs.

Best Runs are ordered primarily by score, then by completed clear, then by rung reached.

## Anonymous play

Anonymous runs are saved in browser `localStorage` on that device.

The browser keeps up to 50 local run summaries.

Anonymous history does not automatically exist on another device.

## Signed-in play

Signed-in runs are also saved to the private VPS and tied to the verified Google account identity.

When an existing signed-in session is restored, Movie Ladder attempts to sync local device runs to the account. The same happens when a player signs in manually.

This lets signed-in run history follow the player across devices while preserving anonymous play.

The server stores run summaries only:

- run UUID;
- score;
- rung reached;
- completed/not completed;
- result rank;
- lives remaining;
- correct answer count;
- wrong answer count;
- best streak;
- server timestamp.

Run history is private to the authenticated player. It is not a public leaderboard.

Server endpoints:

- `POST /arcade-api/movie-ladder/runs`
- `GET /arcade-api/movie-ladder/runs`

---

# Authentication and administrator access

Playing does not require an account.

Google sign-in is used for identity. Movie Ladder Settings is shown only to the configured Movie Ladder administrator.

The backend independently checks administrator authority for sensitive operations. Hiding a Settings button in the browser is not the security boundary.

The production Movie Ladder administrator list is configured server-side with:

`MOVIE_LADDER_ADMIN_EMAILS`

---

# Architecture

## Frontend

Repository:

`ronavis/cinemasters-movie-ladder`

Live GitHub Pages site:

https://ronavis.github.io/cinemasters-movie-ladder/

Important files:

- `index.html` - screens, Settings, account UI
- `styles.css` - mobile-first presentation
- `app.js` - game flow, question pools, TMDb presentation, Google identity, CSV admin UI
- `config.js` - public frontend configuration
- `data/questions.js` - built-in/fallback questions
- `data/trivia-template.csv` - blank admin import template
- `.github/workflows/validate.yml` - frontend validation

Source work happens on `main`.

Production GitHub Pages serves `gh-pages`.

## Backend

The production API is part of the existing Nick's Arcade backend:

Repository:

`ronavis/nicks-arcade`

Public API base:

`https://midconversation.com/arcade-api`

Production service:

`nicks-arcade`

The Movie Ladder API is namespaced below the existing service, for example:

- `/movie-ladder/tmdb/search`
- `/movie-ladder/tmdb/person`
- `/movie-ladder/questions`
- `/movie-ladder/admin/questions/validate`
- `/movie-ladder/admin/questions/import`

No TMDb credential or imported private question-bank storage belongs in the public frontend repository.

---

# Deployment notes

## Frontend

1. Work on `main`.
2. Run/verify **Validate Movie Ladder**.
3. Move `gh-pages` to the exact validated `main` commit.
4. Verify the GitHub Pages build **and deploy** jobs both succeed.

### Important: browser caching

When changing any of these files:

- `app.js`
- `styles.css`
- `data/questions.js`

also bump their query-string asset version in `index.html`.

Example:

```html
<script src="app.js?v=20261002-csv-import-1"></script>
```

A new tab can still reuse a cached asset if the URL did not change. Do not assume “new tab” means “new JavaScript.”

This project has already paid tuition for that lesson.

## Backend

Backend production releases are immutable directories under:

`/opt/nicks-arcade/releases/`

`/opt/nicks-arcade/current` points at the active release.

Deployment practice:

1. verify the currently active release;
2. verify baseline health/data;
3. create a persistent-data backup;
4. stage an immutable release;
5. verify the exact reviewed Git blob/source;
6. restart only `nicks-arcade`;
7. verify health and new endpoints;
8. verify existing Nick's Arcade leaderboard data is unchanged;
9. automatically roll back if post-activation validation fails.

Do not infer that production changed merely because a Git branch moved. Production truth comes from the active VPS release and deployment receipts.

---

# Validation and safety expectations

Before publishing frontend changes:

- JavaScript syntax passes;
- app/API construction passes;
- GitHub Pages build succeeds;
- GitHub Pages deployment succeeds.

Before deploying backend changes:

- backend compiles;
- full pytest suite passes;
- the exact deployment commit/blob is pinned;
- persistent data is backed up;
- production health and existing Nick's Arcade receipts are checked afterward.

The CSV-import backend has explicit coverage for:

- admin-only validation/import/delete;
- preview without mutation;
- text questions;
- actor questions;
- director questions;
- four-movie poster questions;
- append mode;
- duplicate skipping;
- replace mode;
- clear mode;
- persistence across app reopen;
- malformed-row rejection without partial writes.

---

# Current content strategy

## Replay variety

Question selection uses a persistent per-rung recent-history bag rather than unrestricted random picks.

For each rung, Movie Ladder avoids recently seen questions until the rest of that rung's current pool has had a chance to appear. The history is stored locally in the browser and automatically adapts when questions are added or removed.

More questions still increase variety, but repeated runs should no longer feel like ten independent coin flips.

## Gameplay scrolling

After an answer is resolved, Movie Ladder scrolls the feedback and **Next rung** control into view. Advancing to the next rung scrolls the new compact HUD back into view so phone players do not have to manually chase the game up and down the page.

## Era and difficulty guidance

Movie Ladder should lean heavily toward **1970s through current releases**.

Pre-1970 movies are still welcome, but use them sparingly so difficulty comes from movie knowledge rather than forcing otherwise strong players to blind-guess an unfamiliar era.

Credits questions need extra care:

- actor and director questions can appear throughout the ladder when the names are reasonably recognizable;
- editing and cinematography are generally **Rung 10 / Cinemaster material**;
- do not use an editor or cinematographer credit as a mid-ladder difficulty shortcut unless the person is unusually famous and the connection is broadly recognizable.

The intended curve is deeper knowledge as the player climbs, not increasingly obscure production credits.

The built-in questions are useful as:

- a guaranteed fallback;
- a smoke-test set for every visual question type;
- an example of intended rung difficulty.

The long-term content model is the server-backed question bank, not editing JavaScript every time trivia is added.

When adding questions, favor variety:

- text/fact questions;
- actor questions;
- director questions;
- four-movie visual questions;
- different eras and genres;
- questions whose artwork does not accidentally reveal the answer.

---

# Quick admin checklist

When adding a batch of trivia:

1. Download the current template.
2. Keep every row on a rung from 1-10.
3. Use exactly four different answers.
4. Set `correct` to 1-4.
5. Choose the right `answer_type`.
6. Add years for movie choices whenever possible.
7. Give text/actor/director questions a hero movie when appropriate.
8. Keep movie-choice display titles neutral.
9. Validate and preview in Settings.
10. Import only after the preview looks right.
11. Start a few fresh runs and verify posters/headshots/questions in the actual game.

If something looks wrong, fix the CSV and re-import rather than editing production storage by hand.

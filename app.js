(() => {
  const builtInQuestions = (Array.isArray(window.CINEMASTERS_QUESTIONS) ? window.CINEMASTERS_QUESTIONS : [])
    .map((question, i) => ({
      ...question,
      id:question.id || `builtin-rung-${Number(question.rung) || i + 1}-${i + 1}`,
      rung:Number(question.rung) || i + 1
    }));
  let questionPool = [...builtInQuestions];
  let questions = [...builtInQuestions];
  const config = window.MOVIE_LADDER_CONFIG || {};
  const el = id => document.getElementById(id);
  const screens = [el("welcome"), el("game"), el("result"), el("settings")];
  const welcome = el("welcome"), game = el("game"), result = el("result"), settings = el("settings");
  const ranks = ["Moviegoer","Video Store Clerk","Video Store Clerk","Projectionist","Projectionist","Film Buff","Film Buff","Movie Scholar","Movie Scholar","Cinemaster"];
  const mediaCache = new Map();
  const personCache = new Map();
  const movieOrderCache = new Map();

  let index = 0, lives = 3, score = 0, streak = 0, maxStreak = 0;
  let correctCount = 0, wrongCount = 0, locked = false, runRecorded = false;
  let currentRunId = "";
  let orderSelections = [];
  let previousScreen = welcome;
  let googlePromise = null;
  let tmdbFetchEnabled = true;
  const state = {
    token:"",
    user:null,
    tmdb:null,
    importedQuestionCount:0,
    triviaCsv:"",
    triviaValidated:false
  };

  function closeAppMenu(){
    const menu = el("appMenu");
    if(menu) menu.removeAttribute("open");
  }

  function show(screen){
    const active = screens.find(s => s.classList.contains("active"));
    const menu = el("appMenu");
    if(menu){
      menu.removeAttribute("open");
      menu.hidden = screen === settings;
    }
    if(screen === settings && active && active !== settings) previousScreen = active;
    screens.forEach(s => s.classList.remove("active"));
    screen.classList.add("active");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function apiUrl(path){
    const base = String(config.apiBase || "").replace(/\/$/,"");
    if(!base) throw new Error("Movie Ladder API is not configured yet.");
    return base + path;
  }

  function identityApiUrl(path){
    const base = String(config.identityApiBase || "").replace(/\/$/,"");
    if(!base) throw new Error("Movie Ladder identity service is not configured yet.");
    return base + path;
  }

  async function identityApi(path, options = {}){
    const headers = new Headers(options.headers || {});
    if(state.token) headers.set("Authorization", "Bearer " + state.token);
    let response;
    try {
      response = await fetch(identityApiUrl(path), {...options, headers, cache:"no-store"});
    } catch (_) {
      const error = new Error("The Google identity service could not be reached.");
      error.code = "IDENTITY_OFFLINE";
      throw error;
    }
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if(!response.ok) throw new Error(payload.error || "Google identity verification failed.");
    return payload;
  }

  async function api(path, options = {}){
    const headers = new Headers(options.headers || {});
    if(state.token) headers.set("Authorization", "Bearer " + state.token);
    let response;
    try {
      response = await fetch(apiUrl(path), {...options, headers});
    } catch (_) {
      const error = new Error("The Movie Ladder account service is not online yet. You can still play normally.");
      error.code = "SERVICE_OFFLINE";
      throw error;
    }
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if(!response.ok) throw new Error(payload.error || "Movie Ladder account service returned an error.");
    return payload;
  }

  const RUNS_KEY = "movie_ladder_runs_v1";
  const QUESTION_HISTORY_KEY = "movie_ladder_question_history_v1";

  const outcomeArt = {
    "Moviegoer": `<svg viewBox="0 0 240 180" role="img" aria-label="Moviegoer ticket badge"><rect x="24" y="42" width="192" height="96" rx="18" fill="#f1d34f"/><circle cx="24" cy="90" r="13" fill="#fffdf8"/><circle cx="216" cy="90" r="13" fill="#fffdf8"/><path d="M78 67h84v46H78z" fill="#245f50"/><path d="M94 78h52v24H94z" fill="#fffdf8"/><circle cx="106" cy="90" r="5" fill="#ef6a2f"/><circle cx="134" cy="90" r="5" fill="#ef6a2f"/></svg>`,
    "Video Store Clerk": `<svg viewBox="0 0 240 180" role="img" aria-label="Video cassette badge"><rect x="30" y="38" width="180" height="104" rx="12" fill="#3477b2"/><rect x="48" y="54" width="144" height="66" rx="8" fill="#fffdf8"/><circle cx="86" cy="87" r="20" fill="#173f36"/><circle cx="154" cy="87" r="20" fill="#173f36"/><circle cx="86" cy="87" r="8" fill="#f1d34f"/><circle cx="154" cy="87" r="8" fill="#f1d34f"/><rect x="84" y="126" width="72" height="10" rx="4" fill="#173f36"/></svg>`,
    "Projectionist": `<svg viewBox="0 0 240 180" role="img" aria-label="Projectionist film reel badge"><circle cx="88" cy="86" r="52" fill="#245f50"/><circle cx="88" cy="86" r="12" fill="#fffdf8"/><circle cx="88" cy="52" r="12" fill="#f1d34f"/><circle cx="58" cy="80" r="12" fill="#f1d34f"/><circle cx="70" cy="113" r="12" fill="#f1d34f"/><circle cx="112" cy="113" r="12" fill="#f1d34f"/><circle cx="118" cy="72" r="12" fill="#f1d34f"/><path d="M132 72h48v28h-48z" fill="#3477b2"/><path d="M180 77l42-18v54l-42-18z" fill="#ef6a2f"/><rect x="114" y="126" width="84" height="12" rx="6" fill="#173f36"/></svg>`,
    "Film Buff": `<svg viewBox="0 0 240 180" role="img" aria-label="Film Buff clapperboard badge"><rect x="38" y="70" width="164" height="78" rx="10" fill="#245f50"/><path d="M36 66l14-40 164 32-11 34z" fill="#173f36"/><path d="M62 31l20 4-20 33-20-4zM111 40l20 4-20 33-20-4zM160 49l20 4-20 33-20-4z" fill="#f1d34f"/><rect x="58" y="92" width="124" height="10" rx="5" fill="#fffdf8"/><rect x="58" y="116" width="82" height="10" rx="5" fill="#fffdf8"/></svg>`,
    "Movie Scholar": `<svg viewBox="0 0 240 180" role="img" aria-label="Movie Scholar book and film badge"><path d="M30 50q48-16 90 8v88q-42-24-90-8z" fill="#3477b2"/><path d="M210 50q-48-16-90 8v88q42-24 90-8z" fill="#245f50"/><path d="M120 58v88" stroke="#fffdf8" stroke-width="5"/><circle cx="172" cy="78" r="28" fill="#f1d34f"/><circle cx="172" cy="78" r="6" fill="#173f36"/><circle cx="172" cy="62" r="6" fill="#173f36"/><circle cx="158" cy="84" r="6" fill="#173f36"/><circle cx="184" cy="89" r="6" fill="#173f36"/></svg>`,
    "Cinemaster": `<svg viewBox="0 0 240 180" role="img" aria-label="Cinemaster trophy badge"><path d="M76 32h88v58q0 44-44 44T76 90z" fill="#f1d34f"/><path d="M76 48H46q0 42 38 48M164 48h30q0 42-38 48" fill="none" stroke="#ef6a2f" stroke-width="12" stroke-linecap="round"/><circle cx="120" cy="78" r="27" fill="#245f50"/><circle cx="120" cy="78" r="6" fill="#fffdf8"/><circle cx="120" cy="61" r="6" fill="#fffdf8"/><circle cx="104" cy="83" r="6" fill="#fffdf8"/><circle cx="135" cy="84" r="6" fill="#fffdf8"/><rect x="109" y="130" width="22" height="20" fill="#173f36"/><rect x="82" y="148" width="76" height="12" rx="6" fill="#173f36"/></svg>`
  };

  const outcomeCopy = {
    "Moviegoer": ["Opening Night", "The trailers are over, but the lobby is still open. Another run awaits."],
    "Video Store Clerk": ["Rewind & Return", "You know your way around the shelves. Time to recommend yourself another run."],
    "Projectionist": ["Keep the Reel Turning", "You made it into the booth. A little more film knowledge keeps the picture rolling."],
    "Film Buff": ["Certified Film Buff", "Now we're talking. You climbed past casual movie night and into serious territory."],
    "Movie Scholar": ["So Close to Mastery", "That was a deep run. The last stretch is where Movie Ladder starts showing its teeth."],
    "Cinemaster": ["Cinemaster!", "You cleared the entire ladder. The house lights are yours."]
  };

  function resultRankFor(rungReached, completed){
    if(completed) return "Cinemaster";
    if(rungReached <= 1) return "Moviegoer";
    if(rungReached <= 3) return "Video Store Clerk";
    if(rungReached <= 5) return "Projectionist";
    if(rungReached <= 7) return "Film Buff";
    return "Movie Scholar";
  }

  function newRunId(){
    if(window.crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
      const value = Math.random() * 16 | 0;
      return (char === "x" ? value : (value & 3 | 8)).toString(16);
    });
  }

  function loadLocalRuns(){
    try {
      const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
      return Array.isArray(runs) ? runs.filter(run => run && run.id) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalRun(run){
    const runs = loadLocalRuns().filter(existing => existing.id !== run.id);
    runs.unshift(run);
    try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0,50))); } catch (_) {}
  }

  function summarizeRuns(runs){
    return {
      totalRuns:runs.length,
      bestScore:runs.reduce((best, run) => Math.max(best, Number(run.score) || 0), 0),
      highestRung:runs.reduce((best, run) => Math.max(best, Number(run.rungReached) || 0), 0),
      clears:runs.filter(run => run.completed).length
    };
  }

  function mergeRuns(...lists){
    const byId = new Map();
    lists.flat().forEach(run => {
      if(run?.id && !byId.has(run.id)) byId.set(run.id, run);
    });
    return [...byId.values()];
  }

  function sortBestRuns(runs){
    return [...runs].sort((a,b) =>
      (Number(b.score)||0) - (Number(a.score)||0) ||
      Number(Boolean(b.completed)) - Number(Boolean(a.completed)) ||
      (Number(b.rungReached)||0) - (Number(a.rungReached)||0) ||
      (Number(a.createdAt)||0) - (Number(b.createdAt)||0)
    );
  }

  function resetRunState(){
    index = 0;
    lives = 3;
    score = 0;
    streak = 0;
    maxStreak = 0;
    correctCount = 0;
    wrongCount = 0;
    locked = false;
    runRecorded = false;
    currentRunId = newRunId();
    orderSelections = [];
  }

  async function syncLocalRunsToAccount(){
    if(!state.user || !state.token) return;
    const localRuns = loadLocalRuns();
    await Promise.allSettled(localRuns.map(run => api("/movie-ladder/runs", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        id:run.id,
        score:Number(run.score)||0,
        rungReached:Number(run.rungReached)||1,
        completed:Boolean(run.completed),
        livesRemaining:Number(run.livesRemaining)||0,
        correctCount:Number(run.correctCount)||0,
        wrongCount:Number(run.wrongCount)||0,
        maxStreak:Number(run.maxStreak)||0
      })
    })));
  }

  function formatRunDate(epoch){
    if(!epoch) return "";
    try {
      return new Date(epoch * 1000).toLocaleString([], {
        month:"short", day:"numeric", hour:"numeric", minute:"2-digit"
      });
    } catch (_) {
      return "";
    }
  }

  function renderRunList(container, runs){
    container.replaceChildren();
    if(!runs.length){
      const empty = document.createElement("div");
      empty.className = "runs-empty";
      empty.textContent = "No runs yet. Your next climb will show up here.";
      container.appendChild(empty);
      return;
    }
    runs.forEach((run, position) => {
      const row = document.createElement("div");
      row.className = "run-row";

      const rank = document.createElement("div");
      rank.className = "run-rank";
      rank.textContent = run.rank || resultRankFor(Number(run.rungReached)||1, Boolean(run.completed));

      const meta = document.createElement("div");
      meta.className = "run-meta";
      meta.textContent = `Rung ${run.rungReached} • ${formatRunDate(run.createdAt)}`;

      const scoreBox = document.createElement("div");
      scoreBox.className = "run-score";
      scoreBox.innerHTML = `<strong>${(Number(run.score)||0).toLocaleString()}</strong><span>pts</span>`;

      if(position === 0 && container.id === "bestRunsList"){
        const medal = document.createElement("span");
        medal.className = "best-run-medal";
        medal.textContent = "★";
        row.appendChild(medal);
      }

      const text = document.createElement("div");
      text.className = "run-text";
      text.append(rank, meta);
      row.append(text, scoreBox);
      container.appendChild(row);
    });
  }

  async function openRuns(){
    const localRuns = loadLocalRuns();
    let serverRecent = [];
    let serverBest = [];
    let serverSummary = null;

    if(state.user){
      try {
        await syncLocalRunsToAccount();
        const payload = await api("/movie-ladder/runs?limit=30");
        serverRecent = Array.isArray(payload.recent) ? payload.recent : [];
        serverBest = Array.isArray(payload.best) ? payload.best : [];
        serverSummary = payload.summary || null;
      } catch (_) {}
    }

    const runs = mergeRuns(localRuns, serverRecent, serverBest);
    const recent = [...runs].sort((a,b) => (Number(b.createdAt)||0) - (Number(a.createdAt)||0)).slice(0,20);
    const best = sortBestRuns(runs).slice(0,5);
    const localSummary = summarizeRuns(runs);
    const summary = state.user && serverSummary
      ? {
          totalRuns:Number(serverSummary.totalRuns)||0,
          bestScore:Math.max(Number(serverSummary.bestScore)||0, localSummary.bestScore),
          highestRung:Math.max(Number(serverSummary.highestRung)||0, localSummary.highestRung),
          clears:Math.max(Number(serverSummary.clears)||0, localSummary.clears)
        }
      : localSummary;

    el("runsBestScore").textContent = summary.bestScore.toLocaleString();
    el("runsHighestRung").textContent = summary.highestRung || "—";
    el("runsClears").textContent = summary.clears.toLocaleString();
    el("runsIdentityNote").textContent = state.user
      ? "Signed-in runs sync across devices. Runs made anonymously on this device are included too."
      : "These runs are stored on this device. Sign in to sync future and saved device runs to your account.";

    renderRunList(el("bestRunsList"), best);
    renderRunList(el("recentRunsList"), recent);
    el("runsDialog").showModal();
  }

  function questionKey(question){
    if(question?.id) return String(question.id);
    const answers = Array.isArray(question?.answers) ? question.answers.join("|") : "";
    return [question?.rung || "", question?.question || "", answers].join("::");
  }

  function loadQuestionHistory(){
    try {
      const history = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY) || "{}");
      return history && typeof history === "object" && !Array.isArray(history) ? history : {};
    } catch (_) {
      return {};
    }
  }

  function saveQuestionHistory(history){
    try { localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
  }

  function randomChoice(items){
    return items[Math.floor(Math.random() * items.length)];
  }

  function buildRunQuestions(){
    const run = [];
    const history = loadQuestionHistory();

    for(let rung = 1; rung <= 10; rung++){
      const candidates = questionPool.filter(question => Number(question.rung) === rung);
      const fallback = builtInQuestions.find(question => Number(question.rung) === rung);
      const choices = candidates.length ? candidates : (fallback ? [fallback] : []);
      if(!choices.length) continue;

      const byKey = new Map(choices.map(question => [questionKey(question), question]));
      const validKeys = new Set(byKey.keys());
      let recent = Array.isArray(history[rung])
        ? history[rung].filter(key => validKeys.has(key))
        : [];

      // Keep only the most recent unique appearances.
      recent = recent.filter((key, i) => recent.lastIndexOf(key) === i);
      const keep = Math.max(0, choices.length - 1);
      if(recent.length > keep) recent = recent.slice(-keep);

      let available = choices.filter(question => !recent.includes(questionKey(question)));
      if(!available.length) available = choices;

      const selected = randomChoice(available);
      const selectedKey = questionKey(selected);
      recent.push(selectedKey);
      if(recent.length > keep) recent = recent.slice(-keep);

      history[rung] = recent;
      run.push(selected);
    }

    saveQuestionHistory(history);
    return run;
  }

  function questionFitsDifficulty(question){
    const rung = Number(question?.rung) || 0;
    if(rung >= 10) return true;
    const text = String(question?.question || "").toLowerCase();
    return !/\b(cinematograph(?:er|y)|editor|edited)\b/.test(text);
  }

  async function loadQuestionBank(){
    try {
      const payload = await api("/movie-ladder/questions");
      const importedAll = Array.isArray(payload.questions)
        ? payload.questions.filter(question => Number(question.rung) >= 1 && Number(question.rung) <= 10)
        : [];
      const imported = importedAll.filter(questionFitsDifficulty);
      state.importedQuestionCount = importedAll.length;
      questionPool = [...builtInQuestions, ...imported];
      if(welcome.classList.contains("active")){
        questions = buildRunQuestions();
      }
      paintQuestionBankCount();
    } catch (_) {
      state.importedQuestionCount = 0;
      questionPool = [...builtInQuestions];
      paintQuestionBankCount();
    }
  }

  function paintQuestionBankCount(){
    const badge = el("questionBankCount");
    if(!badge) return;
    const count = state.importedQuestionCount;
    badge.textContent = `${count.toLocaleString()} imported`;
    el("triviaClearButton").disabled = count === 0;
  }

  function mediaKey(q){
    return q?.tmdb ? q.tmdb.title + "|" + (q.tmdb.year || "") : "";
  }

  async function getMedia(q){
    if(!tmdbFetchEnabled || !q?.tmdb || !config.apiBase) return null;
    const key = mediaKey(q);
    if(mediaCache.has(key)) return mediaCache.get(key);
    const params = new URLSearchParams({title:q.tmdb.title});
    if(q.tmdb.year) params.set("year", q.tmdb.year);
    const media = await api("/movie-ladder/tmdb/search?" + params.toString());
    mediaCache.set(key, media);
    return media;
  }

  async function getPerson(name, department="Acting"){
    if(!name || !config.apiBase) return null;
    const key = department + "|" + name;
    if(personCache.has(key)) return personCache.get(key);
    try {
      const params = new URLSearchParams({name, department});
      const person = await api("/movie-ladder/tmdb/person?" + params.toString());
      if(department === "Directing" && person?.department !== "Directing"){
        personCache.set(key, null);
        return null;
      }
      personCache.set(key, person);
      return person;
    } catch (_) {
      personCache.set(key, null);
      return null;
    }
  }

  function setArtworkFallback(title){
    const wrap = el("artworkWrap"), fallback = el("artworkFallback"), grid = el("posterGrid");
    wrap.classList.remove("has-artwork","poster-grid-mode");
    wrap.style.backgroundImage = "";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", title);
    grid.hidden = true;
    grid.replaceChildren();
    fallback.hidden = false;
    el("fallbackTitle").textContent = title;
  }

  function isMovieOrderQuestion(q){
    if(!Array.isArray(q?.answerMovies) || q.answerMovies.length !== 4) return false;
    if(String(q.genre || "").trim().toLowerCase() !== "timeline") return false;
    return q.answerMovies.every(choice => {
      const year = Number(choice.year);
      return Number.isInteger(year) && year >= 1880 && year <= 2200;
    });
  }

  function movieOrderKey(q){
    return q.answerMovies
      .map(choice => [choice.title || "", choice.year || ""].join("|"))
      .join("::");
  }

  function releaseDateValue(value){
    const text = String(value || "").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const parsed = Date.parse(text + "T00:00:00Z");
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function resolveMovieOrder(q){
    const key = movieOrderKey(q);
    if(movieOrderCache.has(key)) return movieOrderCache.get(key);

    const pending = Promise.all(q.answerMovies.map(async (choice, i) => {
      let releaseDate = "";
      try {
        const media = await getMedia({tmdb:choice});
        releaseDate = String(media?.releaseDate || "");
      } catch (_) {}

      return {
        i,
        title:choice.title,
        year:Number(choice.year),
        releaseDate,
        dateValue:releaseDateValue(releaseDate)
      };
    })).then(items => {
      const exactDates = items.map(item => item.dateValue);
      if(
        exactDates.every(Number.isFinite) &&
        new Set(exactDates).size === items.length
      ){
        return {
          indexes:[...items].sort((a,b) => a.dateValue - b.dateValue).map(item => item.i),
          items
        };
      }

      const years = items.map(item => item.year);
      if(
        years.every(year => Number.isInteger(year)) &&
        new Set(years).size === items.length
      ){
        return {
          indexes:[...items].sort((a,b) => a.year - b.year).map(item => item.i),
          items
        };
      }

      return null;
    });

    movieOrderCache.set(key, pending);
    return pending;
  }

  function formatReleaseDate(value){
    const parsed = releaseDateValue(value);
    if(!Number.isFinite(parsed)) return "";
    try {
      return new Date(parsed).toLocaleDateString("en-US", {
        month:"short",
        day:"numeric",
        year:"numeric",
        timeZone:"UTC"
      });
    } catch (_) {
      return String(value);
    }
  }

  async function renderPosterGrid(q){
    const wrap = el("artworkWrap"), fallback = el("artworkFallback"), grid = el("posterGrid");
    wrap.classList.remove("has-artwork");
    wrap.classList.add("poster-grid-mode");
    wrap.style.backgroundImage = "";
    wrap.removeAttribute("role");
    wrap.setAttribute("aria-label", "Movie choices");
    fallback.hidden = true;
    grid.hidden = false;
    grid.replaceChildren();
    grid.classList.remove("order-correct","order-wrong","order-loading");
    const orderMode = isMovieOrderQuestion(q);
    grid.classList.toggle("order-grid", orderMode);
    grid.classList.toggle("order-loading", orderMode);
    orderSelections = [];

    q.answerMovies.forEach((choice, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "poster-choice";
      button.dataset.answerIndex = String(i);
      button.setAttribute("aria-label", choice.title + (choice.year ? ` (${choice.year})` : ""));
      if(orderMode) button.disabled = true;
      button.addEventListener("click", () => orderMode ? chooseMovieOrder(i, button, q) : choose(i, button));

      const label = document.createElement("span");
      label.className = "poster-choice-title";
      label.textContent = choice.title;
      button.appendChild(label);
      grid.appendChild(button);

      getMedia({tmdb:choice}).then(media => {
        if(questions[index] !== q || !media?.poster) return;
        const preload = new Image();
        preload.onload = () => {
          if(questions[index] !== q) return;
          button.style.backgroundImage = `url("${media.poster.replace(/"/g, "%22")}")`;
          button.classList.add("loaded");
        };
        preload.src = media.poster;
      }).catch(() => {});
    });

    if(orderMode){
      resolveMovieOrder(q).then(order => {
        if(questions[index] !== q) return;
        grid.classList.remove("order-loading");
        [...grid.querySelectorAll("[data-answer-index]")].forEach(button => {
          button.disabled = false;
        });
        if(!order){
          grid.dataset.orderFallback = "single";
          grid.classList.remove("order-grid");
          el("questionText").textContent = q.question;
        } else {
          delete grid.dataset.orderFallback;
        }
      }).catch(() => {
        if(questions[index] !== q) return;
        grid.classList.remove("order-loading");
        [...grid.querySelectorAll("[data-answer-index]")].forEach(button => {
          button.disabled = false;
        });
        grid.dataset.orderFallback = "single";
        grid.classList.remove("order-grid");
        el("questionText").textContent = q.question;
      });
    }
  }

  async function loadMedia(q){
    setArtworkFallback(q.movie);
    if(!q?.tmdb) return;
    try {
      const media = await getMedia(q);
      if(!media || index >= questions.length || questions[index] !== q) return;
      const image = media.poster || media.backdrop;
      if(!image) return;

      const wrap = el("artworkWrap"), fallback = el("artworkFallback");
      const preload = new Image();

      preload.onload = () => {
        if(index >= questions.length || questions[index] !== q) return;
        wrap.style.backgroundImage = `url("${image.replace(/"/g, "%22")}")`;
        wrap.setAttribute("aria-label", (media.title || q.movie) + " movie poster");
        wrap.classList.add("has-artwork");
        fallback.hidden = true;
      };

      preload.onerror = () => setArtworkFallback(q.movie);
      preload.src = image;
    } catch (_) {
      setArtworkFallback(q.movie);
    }
  }

  async function getAnswerProfile(name, department="Acting"){
    const primary = await getPerson(name, department);
    if(primary?.profile) return primary;

    if(department === "Directing"){
      const acting = await getPerson(name, "Acting");
      const requestedName = String(name || "").trim().toLocaleLowerCase();
      const returnedName = String(acting?.name || "").trim().toLocaleLowerCase();
      if(acting?.profile && requestedName && requestedName === returnedName){
        return acting;
      }
    }

    return primary;
  }

  async function addAnswerProfiles(button, names, label, department="Acting"){
    const profiles = document.createElement("span");
    profiles.className = "answer-profiles";
    const text = document.createElement("span");
    text.className = "answer-label";
    text.textContent = label;
    button.append(profiles, text);

    const people = await Promise.all(names.map(name => getAnswerProfile(name, department)));
    people.filter(person => person?.profile).forEach(person => {
      const img = document.createElement("img");
      img.className = "answer-avatar";
      img.src = person.profile;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      profiles.appendChild(img);
    });
    if(!profiles.children.length) profiles.remove();
  }

  function markAnswer(button, symbol){
    let mark = button.querySelector(".answer-state");
    if(!mark){
      mark = document.createElement("span");
      mark.className = "answer-state";
      button.prepend(mark);
    }
    mark.textContent = symbol;
  }

  async function loadHeroRail(){
    const rail = el("heroPosterRail");
    if(!rail || !tmdbFetchEnabled) return;

    const candidates = [];
    const seenMedia = new Set();

    [...questions, ...builtInQuestions, ...questionPool].forEach(question => {
      const key = mediaKey(question);
      if(!key || seenMedia.has(key)) return;
      seenMedia.add(key);
      candidates.push(question);
    });

    const posters = [];
    const seenPosters = new Set();

    for(const question of candidates.slice(0,18)){
      try {
        const media = await getMedia(question);
        if(!media?.poster || seenPosters.has(media.poster)) continue;
        posters.push(media);
        seenPosters.add(media.poster);
        if(posters.length === 4) break;
      } catch (_) {}
    }

    if(!posters.length) return;

    rail.replaceChildren();
    posters.forEach(media => {
      const img = document.createElement("img");
      img.src = media.poster;
      img.alt = "";
      rail.appendChild(img);
    });
    rail.dataset.posterCount = String(posters.length);
    rail.classList.add("populated");
  }

  function renderLadder(){
    const ladder = el("ladderDots");
    if(!ladder) return;
    ladder.replaceChildren();
    questions.forEach((q, i) => {
      const dot = document.createElement("span");
      dot.className = "ladder-dot";
      if(i < index) dot.classList.add("complete");
      if(i === index) dot.classList.add("current");
      dot.title = `Rung ${i+1}: ${ranks[i] || "Cinemaster"}`;
      ladder.appendChild(dot);
    });
  }

  function prefersReducedMotion(){
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function scrollIntoGameView(target, block="center"){
    if(!target?.scrollIntoView) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior:prefersReducedMotion() ? "auto" : "smooth",
        block
      });
    });
  }

  function revealAnswerResult(){
    const next = el("nextButton");
    scrollIntoGameView(next, "center");
  }

  function renderStreak(){
    const label = el("streakLabel");
    label.hidden = streak < 2;
    label.textContent = `🔥 ${streak} correct`;
  }

  function animateScore(){
    const scoreLabel = el("scoreLabel");
    scoreLabel.classList.remove("bump");
    void scoreLabel.offsetWidth;
    scoreLabel.classList.add("bump");
  }

  function render(){
    const q = questions[index];
    if(!q){ finish(false); return; }
    locked = false;
    el("rankLabel").textContent = ranks[index] || "Cinemaster";
    el("ticketsLabel").textContent = lives > 0 ? "🎟️ ".repeat(lives).trim() : "No tickets";
    el("scoreLabel").textContent = score.toLocaleString() + " pts";
    el("rungLabel").textContent = `Rung ${index+1} / ${questions.length}`;
    el("difficultyLabel").textContent = q.difficulty;
    el("progressBar").style.width = `${((index+1)/questions.length)*100}%`;
    renderLadder();
    renderStreak();
    el("movieTitle").textContent = q.movie;
    el("movieSubtitle").textContent = [q.year,q.genre].filter(Boolean).join(" • ");
    el("pointsBadge").textContent = "Worth " + q.points.toLocaleString() + " pts";
    const orderMode = isMovieOrderQuestion(q);
    let questionCopy = orderMode
      ? "Tap the movies in release order, earliest to latest."
      : q.question;

    if(
      !orderMode &&
      q.year &&
      /academy awards/i.test(String(questionCopy)) &&
      !new RegExp("\\(" + q.year + "\\)").test(String(questionCopy))
    ){
      questionCopy = String(questionCopy).replace(/\?$/, "") + " (" + q.year + ")?";
    }

    el("questionText").textContent = questionCopy;

    const answers = el("answers");
    answers.innerHTML = "";

    if(Array.isArray(q.answerMovies) && q.answerMovies.length === q.answers.length){
      answers.hidden = true;
      renderPosterGrid(q);
    } else {
      answers.hidden = false;
      loadMedia(q);
      q.answers.forEach((label, i) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-button";
        button.dataset.answerIndex = String(i);
        button.addEventListener("click", () => choose(i, button));
        answers.appendChild(button);

        const people = q.answerPeople?.[i];
        if(Array.isArray(people) && people.length){
          button.classList.add("person-answer");
          addAnswerProfiles(button, people, label, q.personDepartment || "Acting");
        } else {
          const text = document.createElement("span");
          text.className = "answer-label";
          text.textContent = label;
          button.appendChild(text);
        }
      });
    }

    el("feedback").hidden = true;
    el("nextButton").hidden = true;

    const card = document.querySelector(".question-card");
    card.classList.remove("entering");
    void card.offsetWidth;
    card.classList.add("entering");

    const nextQuestion = questions[index + 1];
    if(nextQuestion?.tmdb) getMedia(nextQuestion).catch(() => {});
    if(Array.isArray(nextQuestion?.answerMovies)){
      nextQuestion.answerMovies.forEach(choice => getMedia({tmdb:choice}).catch(() => {}));
    }
  }

  async function chooseMovieOrder(choice, button, q){
    if(locked || button.disabled) return;

    const resolved = await resolveMovieOrder(q);
    if(!resolved){
      choose(choice, button);
      return;
    }

    orderSelections.push(choice);
    const position = orderSelections.length;
    button.disabled = true;
    button.classList.add("order-selected");

    const badge = document.createElement("span");
    badge.className = "order-badge";
    badge.textContent = String(position);
    button.appendChild(badge);

    const title = q.answerMovies[choice]?.title || q.answers[choice] || "movie";
    button.setAttribute("aria-label", `${title}, selected position ${position} of 4`);

    if(orderSelections.length < 4) return;

    locked = true;
    const buttons = [...el("posterGrid").querySelectorAll("[data-answer-index]")];
    buttons.forEach(item => { item.disabled = true; });

    const expected = resolved.indexes;
    const good = orderSelections.every((value, i) => value === expected[i]);

    if(good){
      score += q.points;
      streak++;
      correctCount++;
      maxStreak = Math.max(maxStreak, streak);
      el("posterGrid").classList.add("order-correct");
      buttons.forEach(item => item.classList.add("correct"));
      animateScore();
    } else {
      lives--;
      wrongCount++;
      streak = 0;
      el("posterGrid").classList.add("order-wrong");
    }

    const yearCounts = resolved.items.reduce((counts, item) => {
      counts[item.year] = (counts[item.year] || 0) + 1;
      return counts;
    }, {});

    const correctOrder = expected
      .map(i => {
        const item = resolved.items[i];
        const detail = yearCounts[item.year] > 1 && item.releaseDate
          ? formatReleaseDate(item.releaseDate)
          : item.year;
        return `${q.answerMovies[i].title} (${detail})`;
      })
      .join(" → ");

    el("scoreLabel").textContent = score.toLocaleString() + " pts";
    el("ticketsLabel").textContent = lives > 0 ? "🎟️ ".repeat(lives).trim() : "No tickets";
    renderStreak();

    el("feedback").textContent = (good ? "Correct — climb! " : "Ticket lost. ")
      + "Correct order: " + correctOrder + ".";
    el("feedback").hidden = false;

    const next = el("nextButton");
    next.textContent = lives === 0 ? "See my run" : index === questions.length - 1 ? "Claim Cinemaster status" : "Next rung →";
    next.hidden = false;
    revealAnswerResult();
  }

  function choose(choice, button){
    if(locked) return;
    locked = true;
    const q = questions[index];
    const buttons = [...document.querySelector(".question-card").querySelectorAll("[data-answer-index]")];
    buttons.forEach(b => b.disabled = true);
    const good = choice === q.correct;
    if(good){
      score += q.points;
      streak++;
      correctCount++;
      maxStreak = Math.max(maxStreak, streak);
      button.classList.add("correct");
      markAnswer(button, "✓");
      animateScore();
    } else {
      lives--;
      wrongCount++;
      streak = 0;
      button.classList.add("wrong");
      markAnswer(button, "✕");
      const correct = buttons.find(b => Number(b.dataset.answerIndex) === q.correct);
      if(correct){
        correct.classList.add("correct");
        markAnswer(correct, "✓");
      }
    }

    el("scoreLabel").textContent = score.toLocaleString() + " pts";
    el("ticketsLabel").textContent = lives > 0 ? "🎟️ ".repeat(lives).trim() : "No tickets";
    renderStreak();
    el("feedback").textContent = (good ? "Correct — climb! " : "Ticket lost. ") + q.note;
    el("feedback").hidden = false;
    const next = el("nextButton");
    next.textContent = lives === 0 ? "See my run" : index === questions.length - 1 ? "Claim Cinemaster status" : "Next rung →";
    next.hidden = false;
    revealAnswerResult();
  }

  async function finish(won){
    const rungReached = won ? 10 : Math.min(index + 1, 10);
    const rank = resultRankFor(rungReached, won);
    const previousRuns = loadLocalRuns();
    const previousBest = previousRuns.reduce((best, run) => Math.max(best, Number(run.score)||0), 0);

    const run = {
      id:currentRunId || newRunId(),
      score,
      rungReached,
      completed:Boolean(won),
      rank,
      livesRemaining:lives,
      correctCount,
      wrongCount,
      maxStreak,
      createdAt:Math.floor(Date.now()/1000)
    };

    if(!runRecorded){
      runRecorded = true;
      saveLocalRun(run);
      if(state.user){
        api("/movie-ladder/runs", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            id:run.id,
            score:run.score,
            rungReached:run.rungReached,
            completed:run.completed,
            livesRemaining:run.livesRemaining,
            correctCount:run.correctCount,
            wrongCount:run.wrongCount,
            maxStreak:run.maxStreak
          })
        }).catch(() => {});
      }
    }

    const [title, copy] = outcomeCopy[rank];
    el("resultGraphic").innerHTML = outcomeArt[rank] || "";
    el("resultRank").textContent = rank;
    el("resultTitle").textContent = title;
    el("resultCopy").textContent = won
      ? copy
      : `${copy} You reached rung ${rungReached} with ${score.toLocaleString()} points.`;
    el("finalRung").textContent = rungReached;
    el("finalScore").textContent = score.toLocaleString();
    el("finalBestStreak").textContent = maxStreak;
    el("personalBestBanner").hidden = !(previousRuns.length === 0 || score > previousBest);
    show(result);
  }

  function renderAuth(){
    const signed = Boolean(state.user);
    el("accountButton").textContent = signed ? "Account" : "Sign in";
    el("settingsButton").hidden = !state.user?.admin;
    el("signedOutPanel").hidden = signed;
    el("signedInPanel").hidden = !signed;
    if(signed){
      el("accountDialogTitle").textContent = "Your account";
      el("accountIdentity").textContent = state.user.email;
      el("accountRole").textContent = state.user.admin ? "Administrator" : "Player";
      el("openSettingsFromAccount").hidden = !state.user.admin;
      if(state.user.admin) el("adminIdentity").textContent = state.user.email + " • Google-verified Movie Ladder administrator";
    } else {
      el("accountDialogTitle").textContent = "Sign in";
    }
  }

  function signOut(){
    state.token = "";
    state.user = null;
    state.tmdb = null;
    try { sessionStorage.removeItem("movie_ladder_session"); } catch (_) {}
    window.google?.accounts.id.disableAutoSelect();
    renderAuth();
    el("accountDialog").close();
    if(settings.classList.contains("active")) show(welcome);
  }

  async function signIn(token){
    state.token = token;
    const verified = await identityApi("/session");
    const email = String(verified.email || "").toLowerCase();
    state.user = {
      email,
      admin: Boolean(email && config.adminEmail && email === String(config.adminEmail).toLowerCase())
    };
    try { sessionStorage.setItem("movie_ladder_session", token); } catch (_) {}
    renderAuth();
    if(state.user.admin) refreshTmdbStatus();
    syncLocalRunsToAccount().catch(() => {});
    el("accountDialog").close();
  }

  function ensureGoogle(){
    if(window.google?.accounts?.id) return Promise.resolve();
    if(googlePromise) return googlePromise;
    googlePromise = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google sign-in did not load."));
      document.head.append(script);
    });
    return googlePromise;
  }

  async function prepareGoogleButton(){
    el("loginHelp").textContent = "Checking account service…";
    el("googleButton").replaceChildren();
    try {
      await identityApi("/health");
      el("loginHelp").textContent = "Loading Google sign-in…";
      await ensureGoogle();
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        auto_select: false,
        callback: async response => {
          try { await signIn(response.credential); }
          catch(error){ state.token = ""; el("loginHelp").textContent = error.message; }
        }
      });
      el("googleButton").replaceChildren();
      google.accounts.id.renderButton(el("googleButton"), {theme:"outline",size:"large",text:"signin_with",width:280});
      el("loginHelp").textContent = "Google verifies identity; the game never receives your Google password.";
    } catch(error){
      el("loginHelp").textContent = error.code === "IDENTITY_OFFLINE"
        ? "Google sign-in is temporarily unavailable. You can keep playing without an account."
        : error.message;
      el("loginHelp").classList.toggle("service-offline", error.code === "IDENTITY_OFFLINE");
    }
  }

  async function openAccount(){
    renderAuth();
    el("accountDialog").showModal();
    if(!state.user) await prepareGoogleButton();
  }

  function formatVerified(epoch){
    if(!epoch) return "";
    try { return new Date(epoch * 1000).toLocaleString(); } catch (_) { return ""; }
  }

  function paintTmdbStatus(){
    const status = state.tmdb || {configured:false};
    const pill = el("tmdbStatusPill");
    pill.classList.remove("good","bad");
    if(status.configured){
      pill.textContent = "Connected";
      pill.classList.add("good");
    } else {
      pill.textContent = "Not connected";
      pill.classList.add("bad");
    }
    el("tmdbAccountLabel").textContent = status.configured ? "TMDB API Read Access Token is stored only on the VPS." : "";
    el("tmdbVerifiedLabel").textContent = status.lastVerifiedAt ? "Last verified: " + formatVerified(status.lastVerifiedAt) : "";
    el("tmdbTestButton").disabled = !status.configured;
    el("tmdbDisconnectButton").disabled = !status.configured;
  }

  async function refreshTmdbStatus(){
    if(!state.user?.admin) return;
    try {
      state.tmdb = await api("/movie-ladder/admin/tmdb");
      paintTmdbStatus();
    } catch(error) {
      el("tmdbStatusPill").textContent = "API unavailable";
      el("tmdbStatusPill").classList.add("bad");
      el("tmdbMessage").textContent = error.message;
    }
  }

  function resetTriviaPreview(message=""){
    state.triviaValidated = false;
    el("triviaImportButton").disabled = true;
    el("triviaPreview").hidden = true;
    el("triviaPreviewRows").replaceChildren();
    el("triviaPreviewSummary").textContent = "CSV preview";
    el("triviaPreviewNote").textContent = "";
    el("triviaImportMessage").textContent = message;
  }

  function questionTypeLabel(question){
    if(Array.isArray(question.answerMovies)) return "movie";
    if(question.personDepartment === "Directing") return "director";
    if(Array.isArray(question.answerPeople)) return "actor";
    return "text";
  }

  function paintTriviaPreview(payload){
    const rows = el("triviaPreviewRows");
    rows.replaceChildren();
    (payload.preview || []).forEach(question => {
      const tr = document.createElement("tr");
      const values = [
        question.rung,
        questionTypeLabel(question),
        question.question,
        question.answers?.[question.correct] || ""
      ];
      values.forEach(value => {
        const td = document.createElement("td");
        td.textContent = String(value ?? "");
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    });
    el("triviaPreviewSummary").textContent = `${payload.count.toLocaleString()} valid question${payload.count === 1 ? "" : "s"}`;
    el("triviaPreviewNote").textContent = payload.truncated ? "Showing first 20" : "All rows shown";
    el("triviaPreview").hidden = false;
  }

  async function refreshQuestionBankStatus(){
    if(!state.user?.admin) return;
    try {
      const payload = await api("/movie-ladder/admin/questions");
      state.importedQuestionCount = Number(payload.count) || 0;
      paintQuestionBankCount();
    } catch(error) {
      el("questionBankCount").textContent = "Unavailable";
      el("triviaImportMessage").textContent = error.message;
    }
  }

  async function validateTriviaCsv(){
    if(!state.user?.admin || !state.triviaCsv) return;
    resetTriviaPreview("Validating CSV…");
    el("triviaValidateButton").disabled = true;
    try {
      const payload = await api("/movie-ladder/admin/questions/validate", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({csv:state.triviaCsv})
      });
      state.triviaValidated = true;
      paintTriviaPreview(payload);
      el("triviaImportButton").disabled = false;
      el("triviaImportMessage").textContent = "Looks good. Nothing has been saved yet.";
    } catch(error) {
      el("triviaImportMessage").textContent = error.message;
    } finally {
      el("triviaValidateButton").disabled = !state.triviaCsv;
    }
  }

  async function importTriviaCsv(){
    if(!state.user?.admin || !state.triviaCsv || !state.triviaValidated) return;
    const mode = el("triviaImportMode").value === "replace" ? "replace" : "append";
    el("triviaImportButton").disabled = true;
    el("triviaImportMessage").textContent = mode === "replace"
      ? "Replacing imported question bank…"
      : "Importing questions…";
    try {
      const payload = await api("/movie-ladder/admin/questions/import", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({csv:state.triviaCsv, mode})
      });
      state.importedQuestionCount = Number(payload.count) || 0;
      paintQuestionBankCount();
      await loadQuestionBank();
      el("triviaImportMessage").textContent = mode === "replace"
        ? `Imported ${payload.added.toLocaleString()} question${payload.added === 1 ? "" : "s"}. The imported bank now has ${payload.count.toLocaleString()}.`
        : `Added ${payload.added.toLocaleString()} question${payload.added === 1 ? "" : "s"}; skipped ${payload.skipped.toLocaleString()} duplicate${payload.skipped === 1 ? "" : "s"}.`;
      state.triviaCsv = "";
      state.triviaValidated = false;
      el("triviaCsvFile").value = "";
      el("triviaValidateButton").disabled = true;
      el("triviaImportButton").disabled = true;
      el("triviaPreview").hidden = true;
    } catch(error) {
      el("triviaImportMessage").textContent = error.message;
      el("triviaImportButton").disabled = false;
    }
  }

  async function clearTriviaBank(){
    if(!state.user?.admin || state.importedQuestionCount === 0) return;
    if(!confirm("Clear every CSV-imported Movie Ladder question? The built-in questions will remain.")) return;
    el("triviaClearButton").disabled = true;
    el("triviaImportMessage").textContent = "Clearing imported questions…";
    try {
      await api("/movie-ladder/admin/questions", {method:"DELETE"});
      state.importedQuestionCount = 0;
      await loadQuestionBank();
      paintQuestionBankCount();
      resetTriviaPreview("Imported question bank cleared. Built-in questions are untouched.");
    } catch(error) {
      el("triviaImportMessage").textContent = error.message;
      paintQuestionBankCount();
    }
  }

  async function openSettings(){
    if(!state.user?.admin) return;
    show(settings);
    el("tmdbMessage").textContent = "";
    el("triviaImportMessage").textContent = "";
    await Promise.all([refreshTmdbStatus(), refreshQuestionBankStatus()]);
  }

  el("startButton").addEventListener("click", () => {
    questions = buildRunQuestions();
    resetRunState();
    show(game); render();
  });
  el("nextButton").addEventListener("click", () => {
    if(lives === 0){ finish(false); return; }
    if(index === questions.length - 1){ finish(true); return; }
    index++;
    render();
    scrollIntoGameView(document.querySelector(".game-hud"), "start");
  });
  el("replayButton").addEventListener("click", () => {
    questions = buildRunQuestions();
    resetRunState();
    show(game); render();
  });
  el("homeButton").addEventListener("click", () => { closeAppMenu(); show(welcome); });
  el("runsButton").addEventListener("click", () => { closeAppMenu(); openRuns(); });
  el("resultRunsButton").addEventListener("click", openRuns);
  el("closeRunsButton").addEventListener("click", () => el("runsDialog").close());
  el("accountButton").addEventListener("click", () => { closeAppMenu(); openAccount(); });
  el("closeAccountButton").addEventListener("click", () => el("accountDialog").close());
  el("signOutButton").addEventListener("click", signOut);
  el("settingsButton").addEventListener("click", () => { closeAppMenu(); openSettings(); });
  el("openSettingsFromAccount").addEventListener("click", () => { el("accountDialog").close(); openSettings(); });
  el("settingsBackButton").addEventListener("click", () => show(previousScreen || welcome));

  el("triviaCsvFile").addEventListener("change", async event => {
    resetTriviaPreview();
    const file = event.target.files?.[0];
    if(!file){
      state.triviaCsv = "";
      el("triviaValidateButton").disabled = true;
      return;
    }
    try {
      state.triviaCsv = await file.text();
      el("triviaValidateButton").disabled = !state.triviaCsv;
      el("triviaImportMessage").textContent = `${file.name} loaded. Validate it before importing.`;
    } catch (_) {
      state.triviaCsv = "";
      el("triviaValidateButton").disabled = true;
      el("triviaImportMessage").textContent = "Could not read that CSV file.";
    }
  });
  el("triviaValidateButton").addEventListener("click", validateTriviaCsv);
  el("triviaImportButton").addEventListener("click", importTriviaCsv);
  el("triviaClearButton").addEventListener("click", clearTriviaBank);

  el("tmdbForm").addEventListener("submit", async event => {
    event.preventDefault();
    if(!state.user?.admin) return;
    const token = el("tmdbToken").value.trim();
    if(!token){ el("tmdbMessage").textContent = "Paste the TMDB API Read Access Token first."; return; }
    el("tmdbMessage").textContent = "Verifying with TMDB…";
    try {
      state.tmdb = await api("/movie-ladder/admin/tmdb", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token})
      });
      el("tmdbToken").value = "";
      tmdbFetchEnabled = true;
      mediaCache.clear();
      paintTmdbStatus();
      el("tmdbMessage").textContent = "TMDB connected. New rounds can now load live artwork.";
    } catch(error){ el("tmdbMessage").textContent = error.message; }
  });

  el("tmdbTestButton").addEventListener("click", async () => {
    el("tmdbMessage").textContent = "Testing saved credential…";
    try {
      const tested = await api("/movie-ladder/admin/tmdb/test", {method:"POST"});
      state.tmdb = {...state.tmdb,...tested,configured:true};
      tmdbFetchEnabled = true;
      paintTmdbStatus();
      el("tmdbMessage").textContent = "TMDB responded successfully.";
    } catch(error){ el("tmdbMessage").textContent = error.message; }
  });

  el("tmdbDisconnectButton").addEventListener("click", async () => {
    if(!confirm("Disconnect TMDB from Movie Ladder?")) return;
    try {
      state.tmdb = await api("/movie-ladder/admin/tmdb", {method:"DELETE"});
      tmdbFetchEnabled = false;
      mediaCache.clear();
      paintTmdbStatus();
      el("tmdbMessage").textContent = "TMDB disconnected. The game will use built-in fallback art.";
    } catch(error){ el("tmdbMessage").textContent = error.message; }
  });

  async function restoreSession(){
    try { state.token = sessionStorage.getItem("movie_ladder_session") || ""; } catch (_) {}
    if(!state.token){ renderAuth(); return; }
    try {
      const verified = await identityApi("/session");
      const email = String(verified.email || "").toLowerCase();
      state.user = {
        email,
        admin: Boolean(email && config.adminEmail && email === String(config.adminEmail).toLowerCase())
      };
      renderAuth();
      if(state.user.admin) refreshTmdbStatus();
      syncLocalRunsToAccount().catch(() => {});
    } catch (_) {
      state.token = "";
      state.user = null;
      try { sessionStorage.removeItem("movie_ladder_session"); } catch (_) {}
      renderAuth();
    }
  }

  renderAuth();
  resetRunState();
  restoreSession();
  loadQuestionBank().finally(() => loadHeroRail());
})();
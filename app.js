(() => {
  const builtInQuestions = (Array.isArray(window.CINEMASTERS_QUESTIONS) ? window.CINEMASTERS_QUESTIONS : [])
    .map((question, i) => ({...question, rung:Number(question.rung) || i + 1}));
  let questionPool = [...builtInQuestions];
  let questions = [...builtInQuestions];
  const config = window.MOVIE_LADDER_CONFIG || {};
  const el = id => document.getElementById(id);
  const screens = [el("welcome"), el("game"), el("result"), el("settings")];
  const welcome = el("welcome"), game = el("game"), result = el("result"), settings = el("settings");
  const ranks = ["Moviegoer","Video Store Clerk","Video Store Clerk","Projectionist","Projectionist","Film Buff","Film Buff","Movie Scholar","Movie Scholar","Cinemaster"];
  const mediaCache = new Map();
  const personCache = new Map();

  let index = 0, lives = 3, score = 0, streak = 0, locked = false;
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

  function show(screen){
    const active = screens.find(s => s.classList.contains("active"));
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

  function buildRunQuestions(){
    const run = [];
    for(let rung = 1; rung <= 10; rung++){
      const candidates = questionPool.filter(question => Number(question.rung) === rung);
      const fallback = builtInQuestions.find(question => Number(question.rung) === rung);
      const choices = candidates.length ? candidates : (fallback ? [fallback] : []);
      if(!choices.length) continue;
      run.push(choices[Math.floor(Math.random() * choices.length)]);
    }
    return run;
  }

  async function loadQuestionBank(){
    try {
      const payload = await api("/movie-ladder/questions");
      const imported = Array.isArray(payload.questions)
        ? payload.questions.filter(question => Number(question.rung) >= 1 && Number(question.rung) <= 10)
        : [];
      state.importedQuestionCount = imported.length;
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

    q.answerMovies.forEach((choice, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "poster-choice";
      button.dataset.answerIndex = String(i);
      button.setAttribute("aria-label", choice.title + (choice.year ? ` (${choice.year})` : ""));
      button.addEventListener("click", () => choose(i, button));

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

  async function addAnswerProfiles(button, names, label, department="Acting"){
    const profiles = document.createElement("span");
    profiles.className = "answer-profiles";
    const text = document.createElement("span");
    text.className = "answer-label";
    text.textContent = label;
    button.append(profiles, text);

    const people = await Promise.all(names.map(name => getPerson(name, department)));
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
    const picks = questions.slice(0,4);
    const results = await Promise.allSettled(picks.map(getMedia));
    const posters = results
      .filter(result => result.status === "fulfilled" && result.value?.poster)
      .map(result => result.value);
    if(!posters.length) return;
    rail.replaceChildren();
    posters.forEach(media => {
      const img = document.createElement("img");
      img.src = media.poster;
      img.alt = "";
      rail.appendChild(img);
    });
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
    el("pointsBadge").textContent = "+" + q.points.toLocaleString();
    el("questionText").textContent = q.question;

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
      button.classList.add("correct");
      markAnswer(button, "✓");
      animateScore();
    } else {
      lives--;
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
  }

  function finish(won){
    show(result);
    el("resultEmoji").textContent = won ? "🏆" : "🎬";
    el("resultTitle").textContent = won ? "Cinemaster!" : "The credits roll…";
    el("resultCopy").textContent = won
      ? "You cleared the entire ladder. Personal bests, daily ranks and streaks can plug into the same signed-in account next."
      : `Your run ended on rung ${index+1}. Three tickets keeps mistakes meaningful without making the game feel cruel.`;
    el("finalRung").textContent = won ? questions.length : index + 1;
    el("finalScore").textContent = score.toLocaleString();
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
    index = 0; lives = 3; score = 0; streak = 0;
    show(game); render();
  });
  el("nextButton").addEventListener("click", () => {
    if(lives === 0){ finish(false); return; }
    if(index === questions.length - 1){ finish(true); return; }
    index++; render();
  });
  el("replayButton").addEventListener("click", () => {
    questions = buildRunQuestions();
    index = 0; lives = 3; score = 0; streak = 0;
    show(game); render();
  });
  el("homeButton").addEventListener("click", () => show(welcome));
  el("accountButton").addEventListener("click", openAccount);
  el("closeAccountButton").addEventListener("click", () => el("accountDialog").close());
  el("signOutButton").addEventListener("click", signOut);
  el("settingsButton").addEventListener("click", openSettings);
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
    } catch (_) {
      state.token = "";
      state.user = null;
      try { sessionStorage.removeItem("movie_ladder_session"); } catch (_) {}
      renderAuth();
    }
  }

  renderAuth();
  restoreSession();
  loadQuestionBank().finally(() => loadHeroRail());
})();
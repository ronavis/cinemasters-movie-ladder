(() => {
  const questions = Array.isArray(window.CINEMASTERS_QUESTIONS) ? window.CINEMASTERS_QUESTIONS : [];
  const config = window.MOVIE_LADDER_CONFIG || {};
  const el = id => document.getElementById(id);
  const screens = [el("welcome"), el("game"), el("result"), el("settings")];
  const welcome = el("welcome"), game = el("game"), result = el("result"), settings = el("settings");
  const ranks = ["Moviegoer","Video Store Clerk","Video Store Clerk","Projectionist","Projectionist","Film Buff","Film Buff","Movie Scholar","Movie Scholar","Cinemaster"];
  const mediaCache = new Map();

  let index = 0, lives = 3, score = 0, locked = false;
  let previousScreen = welcome;
  let googlePromise = null;
  let tmdbFetchEnabled = true;
  const state = { token:"", user:null, tmdb:null };

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

  function setArtworkFallback(title, label){
    const img = el("movieArtwork"), fallback = el("artworkFallback");
    img.hidden = true;
    img.removeAttribute("src");
    fallback.hidden = false;
    el("fallbackTitle").textContent = title;
    el("artworkBadge").textContent = label;
  }

  async function loadMedia(q){
    setArtworkFallback(q.movie, "TMDB artwork");
    if(!tmdbFetchEnabled || !q.tmdb || !config.apiBase) return;
    const key = q.tmdb.title + "|" + (q.tmdb.year || "");
    try {
      let media = mediaCache.get(key);
      if(!media){
        const params = new URLSearchParams({title:q.tmdb.title});
        if(q.tmdb.year) params.set("year", q.tmdb.year);
        media = await api("/api/tmdb/search?" + params.toString());
        mediaCache.set(key, media);
      }
      if(index >= questions.length || questions[index] !== q) return;
      const image = media.backdrop || media.poster;
      if(!image){ el("artworkBadge").textContent = "TMDB • no artwork"; return; }
      const img = el("movieArtwork"), fallback = el("artworkFallback");
      img.onload = () => { if(questions[index] === q){ img.hidden = false; fallback.hidden = true; el("artworkBadge").textContent = "Artwork via TMDB"; } };
      img.onerror = () => setArtworkFallback(q.movie, "TMDB artwork unavailable");
      img.src = image;
      img.alt = (media.title || q.movie) + " artwork from TMDB";
    } catch (error) {
      if(!/could not find that movie/i.test(error.message)) tmdbFetchEnabled = false;
      setArtworkFallback(q.movie, "Artwork unavailable");
    }
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
    el("movieTitle").textContent = q.movie;
    el("movieSubtitle").textContent = [q.year,q.genre].filter(Boolean).join(" • ");
    el("pointsBadge").textContent = "+" + q.points.toLocaleString();
    el("sourceChip").textContent = q.source;
    el("questionText").textContent = q.question;
    loadMedia(q);

    const answers = el("answers");
    answers.innerHTML = "";
    q.answers.forEach((label, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-button";
      button.textContent = label;
      button.addEventListener("click", () => choose(i, button));
      answers.appendChild(button);
    });

    el("feedback").hidden = true;
    el("nextButton").hidden = true;
  }

  function choose(choice, button){
    if(locked) return;
    locked = true;
    const q = questions[index];
    const buttons = [...el("answers").querySelectorAll("button")];
    buttons.forEach(b => b.disabled = true);
    const good = choice === q.correct;
    if(good){
      score += q.points;
      button.classList.add("correct");
      button.textContent = "✓ " + button.textContent;
    } else {
      lives--;
      button.classList.add("wrong");
      button.textContent = "✕ " + button.textContent;
      const correct = buttons[q.correct];
      correct.classList.add("correct");
      correct.textContent = "✓ " + correct.textContent;
    }

    el("scoreLabel").textContent = score.toLocaleString() + " pts";
    el("ticketsLabel").textContent = lives > 0 ? "🎟️ ".repeat(lives).trim() : "No tickets";
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
      state.tmdb = await api("/api/admin/tmdb");
      paintTmdbStatus();
    } catch(error) {
      el("tmdbStatusPill").textContent = "API unavailable";
      el("tmdbStatusPill").classList.add("bad");
      el("tmdbMessage").textContent = error.message;
    }
  }

  async function openSettings(){
    if(!state.user?.admin) return;
    show(settings);
    el("tmdbMessage").textContent = "";
    await refreshTmdbStatus();
  }

  el("startButton").addEventListener("click", () => { index = 0; lives = 3; score = 0; show(game); render(); });
  el("nextButton").addEventListener("click", () => {
    if(lives === 0){ finish(false); return; }
    if(index === questions.length - 1){ finish(true); return; }
    index++; render();
  });
  el("replayButton").addEventListener("click", () => { index = 0; lives = 3; score = 0; show(game); render(); });
  el("homeButton").addEventListener("click", () => show(welcome));
  el("accountButton").addEventListener("click", openAccount);
  el("closeAccountButton").addEventListener("click", () => el("accountDialog").close());
  el("signOutButton").addEventListener("click", signOut);
  el("settingsButton").addEventListener("click", openSettings);
  el("openSettingsFromAccount").addEventListener("click", () => { el("accountDialog").close(); openSettings(); });
  el("settingsBackButton").addEventListener("click", () => show(previousScreen || welcome));

  el("tmdbForm").addEventListener("submit", async event => {
    event.preventDefault();
    if(!state.user?.admin) return;
    const token = el("tmdbToken").value.trim();
    if(!token){ el("tmdbMessage").textContent = "Paste the TMDB API Read Access Token first."; return; }
    el("tmdbMessage").textContent = "Verifying with TMDB…";
    try {
      state.tmdb = await api("/api/admin/tmdb", {
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
      const tested = await api("/api/admin/tmdb/test", {method:"POST"});
      state.tmdb = {...state.tmdb,...tested,configured:true};
      tmdbFetchEnabled = true;
      paintTmdbStatus();
      el("tmdbMessage").textContent = "TMDB responded successfully.";
    } catch(error){ el("tmdbMessage").textContent = error.message; }
  });

  el("tmdbDisconnectButton").addEventListener("click", async () => {
    if(!confirm("Disconnect TMDB from Movie Ladder?")) return;
    try {
      state.tmdb = await api("/api/admin/tmdb", {method:"DELETE"});
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
})();
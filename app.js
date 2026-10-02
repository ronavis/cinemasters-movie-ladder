(() => {
  const questions = Array.isArray(window.CINEMASTERS_QUESTIONS) ? window.CINEMASTERS_QUESTIONS : [];
  const el = id => document.getElementById(id);
  const welcome = el("welcome"), game = el("game"), result = el("result");
  const ranks = ["Moviegoer","Video Store Clerk","Video Store Clerk","Projectionist","Projectionist","Film Buff","Film Buff","Movie Scholar","Movie Scholar","Cinemaster"];
  let index = 0, lives = 3, score = 0, locked = false;

  function show(screen){ [welcome,game,result].forEach(s=>s.classList.remove("active")); screen.classList.add("active"); window.scrollTo({top:0,behavior:"smooth"}); }

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
    el("fallbackTitle").textContent = q.movie;

    const img = el("movieArtwork"), fallback = el("artworkFallback");
    if(q.image){
      img.src = q.image; img.alt = q.movie + " artwork"; img.hidden = false; fallback.hidden = true;
      img.onerror = () => { img.hidden = true; fallback.hidden = false; };
    } else {
      img.hidden = true; fallback.hidden = false;
    }

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
      ? "You cleared the entire ladder. This is where a real build can add personal bests, daily ranks, streaks and share cards."
      : `Your run ended on rung ${index+1}. Three tickets keeps mistakes meaningful without making the game feel cruel.`;
    el("finalRung").textContent = won ? questions.length : index + 1;
    el("finalScore").textContent = score.toLocaleString();
  }

  el("startButton").addEventListener("click", () => { index = 0; lives = 3; score = 0; show(game); render(); });
  el("nextButton").addEventListener("click", () => {
    if(lives === 0){ finish(false); return; }
    if(index === questions.length - 1){ finish(true); return; }
    index++; render();
  });
  el("replayButton").addEventListener("click", () => { index = 0; lives = 3; score = 0; show(game); render(); });
})();
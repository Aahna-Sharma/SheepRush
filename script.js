// script.js — final corrected version
"use strict";

/* DOM refs */
const container = document.getElementById("gameContainer");
const sheep = document.querySelector(".sheep");
const obstacle = document.querySelector(".obstacle");
const gameOverEl =
  document.getElementById("gameOver") || document.querySelector(".gameOver");
const scoreCont = document.getElementById("scoreCont");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");

/* guards */
if (!sheep) throw new Error("Missing .sheep element");
if (!obstacle) throw new Error("Missing .obstacle element");

/* audio */
const audio = new Audio("music.mp3");
audio.loop = true;
audio.preload = "auto";
audio.volume = 0.6;
const audiogo = new Audio("gameover.mp3");

/* simple helpers */
function tryPlay(a) {
  a?.play?.().catch(() => {});
}
function tryPause(a) {
  try {
    a?.pause?.();
  } catch (e) {}
}

/* device detect */
const isMobile =
  (typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches) ||
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

/* state */
let score = 0;
let gameRunning = false;
let paused = false;
let gameLoopId = null;
let scoredForThisObstacle = false;


/* pointer dedupe (retained) */
let lastPointerTime = 0;
function recordPointer() {
  lastPointerTime = Date.now();
}
function isRecentPointer() {
  return Date.now() - lastPointerTime < 450;
}

/* preload assets (non-blocking) */
const imagesToLoad = [
  "sheep.png",
  "dragon.png",
  "green-meadow-landscape-game-background-vector.jpg",
];
const audiosToLoad = ["music.mp3", "gameover.mp3"];
let loadedCount = 0;
const totalAssets = imagesToLoad.length + audiosToLoad.length;
function markLoaded() {
  loadedCount++;
}
imagesToLoad.forEach((src) => {
  const i = new Image();
  i.onload = markLoaded;
  i.onerror = markLoaded;
  i.src = src;
});
audiosToLoad.forEach((src) => {
  const a = document.createElement("audio");
  a.onloadeddata = markLoaded;
  a.onerror = markLoaded;
  a.src = src;
});

/* geometry helpers */
function ensureSheepLeft() {
  if (!sheep.style.left || sheep.style.left === "")
    sheep.style.left = (sheep.offsetLeft || 10) + "px";
}
function containerRect() {
  return (
    (container && container.getBoundingClientRect()) || {
      left: 0,
      right: window.innerWidth,
    }
  );
}

/* movement helpers */
function computeStep() {
  const w = (container && container.clientWidth) || window.innerWidth;
  return Math.max(8, Math.round(w * 0.07));
}

/* Dino-like single jump: fixed vertical keyframes (in CSS) + small horizontal nudge (consistent)
   Horizontal nudge is NOT based on obstacle position anymore — keeps jump deterministic.
*/
let isCurrentlyJumping = false;
function isJumping() {
  return isCurrentlyJumping || sheep.classList.contains("animateSheep");
}
function jump() {
  if (!gameRunning || paused) return;
  if (isJumping()) return;

  ensureSheepLeft();

  // fixed forward nudge (desktop vs mobile)
  const w = (container && container.clientWidth) || window.innerWidth;
  const forwardPx = Math.round(w * (isMobile ? 0.14 : 0.18)); // mobile 14% now (tuned)
  const maxLeft = Math.max(
    0,
    ((container && container.clientWidth) || window.innerWidth) -
      sheep.offsetWidth -
      6
  );
  const startLeft = sheep.offsetLeft;
  const targetLeft = Math.min(maxLeft, startLeft + forwardPx);

  // vertical animation
  isCurrentlyJumping = true;
  sheep.classList.add("animateSheep");

  // horizontal transition timed to CSS jump duration variable (--sheep-jump-ms) or default 520ms
  const jumpMs =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--sheep-jump-ms"
      )
    ) || 520;
  // use double rAF for reliable start on mobile
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sheep.style.transition = `left ${jumpMs}ms ease`;
      sheep.style.left = targetLeft + "px";
    });
  });

  // cleanup after jump finishes
  setTimeout(() => {
    sheep.style.transition = "";
    sheep.classList.remove("animateSheep");
    isCurrentlyJumping = false;
  }, jumpMs + 8);
}

/* left & right controls */
function moveLeft() {
  if (!gameRunning || paused) return;
  ensureSheepLeft();
  sheep.style.left = Math.max(0, sheep.offsetLeft - computeStep()) + "px";
}
function moveRight() {
  if (!gameRunning || paused) return;
  ensureSheepLeft();
  const m = Math.max(
    0,
    (container.clientWidth || window.innerWidth) - sheep.offsetWidth - 6
  );
  sheep.style.left = Math.min(m, sheep.offsetLeft + computeStep()) + "px";
}

/* collision detection (tuned) */
function detectCollision() {
  if (!gameRunning || paused) return false;
  const s = sheep.getBoundingClientRect();
  const o = obstacle.getBoundingClientRect();
  const cont = containerRect();

  // if obstacle not yet on screen -> no collision
  if (o.left > cont.right - 8) return false;
  // basic AABB reject
  if (o.right < s.left || o.left > s.right) return false;

  const dx = Math.abs(s.left + s.width / 2 - (o.left + o.width / 2));
  const dy = Math.abs(s.top + s.height / 2 - (o.top + o.height / 2));
  const xFactor = isMobile ? 0.22 : 0.3;
  const yFactor = isMobile ? 0.28 : 0.36;
  const thresholdX = (s.width + o.width) * xFactor;
  const thresholdY = (s.height + o.height) * yFactor;
  return dx < thresholdX && dy < thresholdY;
}

/* scoring: simple and robust
   - when obstacle.right < sheep.left AND not scoredForThisObstacle -> +1 and set flag
   - when obstacle.left > container.right - margin -> reset flag for next cycle
*/
function checkScore() {
  if (!gameRunning || paused) return;
  const s = sheep.getBoundingClientRect();
  const o = obstacle.getBoundingClientRect();
  const cont = containerRect();

  // reset when obstacle cycles back from right side
  if (o.left > cont.right - 20) {
    scoredForThisObstacle = false;
    return;
  }

  if (!scoredForThisObstacle && o.right < s.left) {
    scoredForThisObstacle = true;
    score++;
    updateScore();
    // optional: speed up the obstacle a touch
    try {
      const computed =
        getComputedStyle(obstacle).getPropertyValue("animation-duration");
      const cur = parseFloat(computed) || 5;
      obstacle.style.animationDuration = Math.max(0.8, cur - 0.08) + "s";
    } catch (e) {}
  }
}

/* update score UI */
function updateScore() {
  if (scoreCont) scoreCont.textContent = "Your Score: " + score;
}

/* main loop */
function gameStep() {
  if (!gameRunning || paused) return;
  if (detectCollision()) {
    handleGameOver();
    return;
  }
  checkScore();
  gameLoopId = requestAnimationFrame(gameStep);
}
function startLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(gameStep);
}
function stopLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = null;
}

/* start / begin / restart / game over */
function beginRun() {
  // called when start button pressed and assets allowed
  scoredForThisObstacle = false;
  score = 0;
  updateScore();
  gameRunning = true;
  paused = false;
  if (startOverlay && startOverlay.parentElement) startOverlay.remove();
  // reset obstacle animation from fresh frame
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");
  tryPlay(audio);
  startLoop();
  if (pauseBtn) pauseBtn.textContent = "Pause";
}

function startGame() {
  if (gameRunning) return;
  recordPointer();
  const deadline = Date.now() + 1600;
  const waitAssets = () => {
    if (loadedCount >= totalAssets || Date.now() > deadline) {
      beginRun();
    } else setTimeout(waitAssets, 120);
  };
  waitAssets();
}

function restartGame() {
  // resets game but does NOT auto-begin unless user presses Start
  gameRunning = false;
  paused = false;
  if (audio) tryPause(audio);
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "100vw";
  sheep.style.left = "10px";
  score = 0;
  updateScore();
  if (startOverlay && !document.body.contains(startOverlay))
    document.body.appendChild(startOverlay);
  if (gameOverEl) gameOverEl.textContent = "Welcome to SheepRush";
  stopLoop();
}

function handleGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  stopLoop();
  if (gameOverEl) gameOverEl.textContent = "Game Over!";
  tryPlay(audiogo);
  tryPause(audio);
  obstacle.classList.remove("obstacleAni");
  // add restart hint
  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  const hint = document.createElement("div");
  hint.className = "restartHint";
  hint.textContent = "Press Start to play again";
  (gameOverEl && gameOverEl.parentElement
    ? gameOverEl.parentElement
    : document.body
  ).appendChild(hint);
}

/* Pause / resume */
function setPaused(p) {
  if (!gameRunning) return;
  paused = p;
  if (p) {
    // freeze
    obstacle.style.animationPlayState = "paused";
    stopLoop();
    tryPause(audio);
    if (pauseBtn) {
      pauseBtn.textContent = "Resume";
      pauseBtn.setAttribute("aria-pressed", "true");
    }
  } else {
    obstacle.style.animationPlayState = "running";
    tryPlay(audio);
    startLoop();
    if (pauseBtn) {
      pauseBtn.textContent = "Pause";
      pauseBtn.setAttribute("aria-pressed", "false");
    }
  }
}
function togglePause() {
  setPaused(!paused);
}

/* input wiring */
if (leftBtn)
  leftBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recordPointer();
    moveLeft();
  });
if (rightBtn)
  rightBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recordPointer();
    moveRight();
  });
if (jumpBtn)
  jumpBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recordPointer();
    jump();
  });

// keyboard events
document.addEventListener("keydown", (e) => {
  // block starting with keys — require Start button
  if (!gameRunning && (e.key === "Enter" || e.key === " ")) return;
  if (e.key === "ArrowUp" || e.key === "w") jump();
  if (e.key === "ArrowLeft" || e.key === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key === "d") moveRight();
  if (e.key === "p" || e.key === "P") togglePause();
  if ((e.key === "r" || e.key === "R") && !gameRunning) restartGame();
});

// start button
if (startBtn)
  startBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    recordPointer();
    startGame();
  });

// pause button
if (pauseBtn)
  pauseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!gameRunning) return;
    togglePause();
  });

// global click: do not auto-restart when overlay present
document.addEventListener("click", (e) => {
  if (isRecentPointer()) return;
  if (startOverlay && document.body.contains(startOverlay)) return;
  // if game over and overlay absent, clicking won't auto-start — user must press Start
});

/* init: make sure obstacle is not animating until start */
obstacle.classList.remove("obstacleAni");
obstacle.style.left = "100vw";
updateScore();
if (gameOverEl) gameOverEl.textContent = "Press Start to play";

/* expose debug hooks */
window.__SheepRush = {
  jump,
  moveLeft,
  moveRight,
  startGame,
  restartGame,
  togglePause,
  getScore: () => score,
  isMobile,
};

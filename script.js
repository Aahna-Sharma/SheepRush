// script.js — Mobile-stable final: wait for images + visualViewport safe-recalc + clean restart
"use strict";

/* DOM refs */
const container = document.getElementById("gameContainer");
const sheepWrap = document.querySelector(".sprite.sheep");
const obstacleWrap = document.querySelector(".sprite.obstacle");
const sheepImg = sheepWrap.querySelector("img");
const obstacleImg = obstacleWrap.querySelector("img");
const scoreCont = document.getElementById("scoreCont");
const gameOverEl = document.getElementById("gameOver");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");

/* audio */
const audio = new Audio("music.mp3");
audio.loop = true;
const audiogo = new Audio("gameover.mp3");

/* state */
let gameRunning = false;
let paused = false;
let rafId = null;
let score = 0;

/* physics jump state */
let sheepBaseBottom = 0; // stable baseline px for wrappers
let y = 0; // vertical offset (px) above baseline (0 = on ground)
let vy = 0; // vertical velocity (px/frame)
let gravity = 1.05; // gravity
let jumpPower = 22; // initial upward velocity
let onGround = true;

/* obstacle movement */
let obstacleX = 0; // left position in px relative to container
let baseSpeed = 6; // base pixels per frame (scaled)
let speedInc = 0.12; // per score increment

/* speed scaling & sheep start params */
const SPEED_REFERENCE_WIDTH = 900;
const MIN_SPEED_SCALE = 0.6;
const MAX_SPEED_SCALE = 1.5;
const SHEEP_LEFT_PERCENT = 0.12;
const SHEEP_LEFT_MIN_PX = 8;
const SHEEP_LEFT_MAX_PX = 420;

/* -------------------------
   Responsive tuning
   ------------------------- */
function tuneForScreen() {
  const h = window.innerHeight;
  if (h <= 520) {
    jumpPower = 26;
    gravity = 1.15;
    baseSpeed = 5.8;
  } else if (h <= 640) {
    jumpPower = 23;
    gravity = 1.08;
    baseSpeed = 6.0;
  } else if (h <= 800) {
    jumpPower = 21;
    gravity = 1.02;
    baseSpeed = 6.4;
  } else {
    jumpPower = 20;
    gravity = 0.95;
    baseSpeed = 6.8;
  }
}
tuneForScreen();

/* compute speed scale to normalize feeling across widths */
function computeSpeedScale() {
  const w =
    (container && container.clientWidth) ||
    window.innerWidth ||
    SPEED_REFERENCE_WIDTH;
  let scale = w / SPEED_REFERENCE_WIDTH;
  if (scale < MIN_SPEED_SCALE) scale = MIN_SPEED_SCALE;
  if (scale > MAX_SPEED_SCALE) scale = MAX_SPEED_SCALE;
  return scale;
}

/* compute responsive sheep left */
function computeSheepStartLeft() {
  const w = (container && container.clientWidth) || window.innerWidth || 360;
  let leftPx = Math.round(w * SHEEP_LEFT_PERCENT);
  leftPx = Math.max(leftPx, SHEEP_LEFT_MIN_PX);
  leftPx = Math.min(leftPx, SHEEP_LEFT_MAX_PX);
  return leftPx + "px";
}

/* -------------------------
   Helpers that fix mobile timing problems
   - waitForImages() ensures we measure AFTER images load
   - stableMeasure() sets stable baseline & initial left
   ------------------------- */
function waitForImages() {
  // resolve immediately if already loaded
  const p1 = sheepImg.complete
    ? Promise.resolve()
    : new Promise((res) =>
        sheepImg.addEventListener("load", res, { once: true })
      );
  const p2 = obstacleImg.complete
    ? Promise.resolve()
    : new Promise((res) =>
        obstacleImg.addEventListener("load", res, { once: true })
      );
  return Promise.all([p1, p2]);
}

function stableMeasureAndInit() {
  // Clear inline offsets that could be left from previous runs
  sheepWrap.style.bottom = "";
  sheepWrap.style.left = "";
  obstacleWrap.style.bottom = "";
  obstacleWrap.style.left = "";

  // Force a reflow then measure computed style; this avoids measuring while browser UI is animating
  // Using requestAnimationFrame twice gives the viewport time to stabilize
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Read computed bottom (CSS var converted by CSS)
        const computedBottom = parseInt(
          getComputedStyle(sheepWrap).bottom || 0,
          10
        );
        sheepBaseBottom = isNaN(computedBottom) ? 0 : computedBottom;

        // Force sheep start left to a deterministic responsive value
        sheepWrap.style.left = computeSheepStartLeft();
        // Force sheep bottom to exact baseline (clear rounding differences)
        sheepWrap.style.bottom = sheepBaseBottom + "px";

        // Set obstacle baseline ONCE (do not update per-frame)
        obstacleWrap.style.bottom = sheepBaseBottom + "px";

        // reset obstacle position to off-screen right and clear scored flag
        const cw = container.clientWidth || window.innerWidth;
        obstacleX = cw + 20;
        obstacleWrap.style.left = obstacleX + "px";
        obstacleWrap.dataset.scored = "0";

        resolve();
      });
    });
  });
}

/* -------------------------
   Initialize: wait images, measure stable baseline
   ------------------------- */
async function initStable() {
  try {
    await waitForImages();
  } catch (e) {
    // continue even if images error; we still try to measure
  }
  await stableMeasureAndInit();
}
initStable();

/* Also re-measure when visualViewport resizes (mobile address bar show/hide),
   but only after a tiny debounce so we don't thrash.
*/
let vvDebounce = 0;
function scheduleStableRecalc() {
  clearTimeout(vvDebounce);
  vvDebounce = setTimeout(() => {
    stableMeasureAndInit();
  }, 120);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleStableRecalc);
}
window.addEventListener("resize", scheduleStableRecalc);

/* -------------------------
   Physics & utilities
   ------------------------- */
function applyPhysics() {
  if (!onGround) {
    y += vy;
    vy -= gravity;
    if (y <= 0) {
      y = 0;
      vy = 0;
      onGround = true;
    }
  }
  sheepWrap.style.bottom = sheepBaseBottom + y + "px";
}

function rects() {
  const s = sheepImg.getBoundingClientRect();
  const o = obstacleImg.getBoundingClientRect();
  return { s, o };
}

function verticalOverlapPx(s, o) {
  const topOverlap = Math.max(s.top, o.top);
  const bottomOverlap = Math.min(s.bottom, o.bottom);
  return Math.max(0, bottomOverlap - topOverlap);
}

/* -------------------------
   Main loop
   ------------------------- */
function loop() {
  if (!gameRunning || paused) return;

  applyPhysics();

  const speedScale = computeSpeedScale();
  const speed = (baseSpeed + score * speedInc) * speedScale;
  obstacleX -= speed;
  obstacleWrap.style.left = obstacleX + "px";

  const { s, o } = rects();
  const vertOverlap = verticalOverlapPx(s, o);
  const minOverlap = Math.min(s.height, o.height) * 0.12;

  if (vertOverlap >= minOverlap) {
    if (obstacleWrap.dataset.scored !== "1" && o.right < s.left) {
      obstacleWrap.dataset.scored = "1";
      score++;
      scoreCont.textContent = "Your Score: " + score;
    }

    if (!(o.right < s.left || o.left > s.right)) {
      const dx = Math.abs(s.left + s.width / 2 - (o.left + o.width / 2));
      const dy = Math.abs(s.top + s.height / 2 - (o.top + o.height / 2));
      if (dx < s.width * 0.45 && dy < s.height * 0.45) {
        return onGameOver();
      }
    }
  } else {
    if (obstacleWrap.dataset.scored === "1") obstacleWrap.dataset.scored = "0";
  }

  const obsWidth = obstacleWrap.offsetWidth || (o && o.width) || 120;
  if (obstacleX < -obsWidth) resetObstacle();

  rafId = requestAnimationFrame(loop);
}

/* -------------------------
   Reset helpers used by loop / restart
   ------------------------- */
function resetObstacle() {
  const cw = container.clientWidth || window.innerWidth;
  obstacleX = cw + 20;
  obstacleWrap.style.left = obstacleX + "px";
  // keep obstacle bottom equal to stable baseline (do not follow sheep)
  obstacleWrap.style.bottom = sheepBaseBottom + "px";
  obstacleWrap.dataset.scored = "0";
}

/* -------------------------
   Start / Restart / GameOver
   ------------------------- */
async function beginRun() {
  // ensure stable baseline recomputed right before starting (useful on mobile)
  if (rafId) cancelAnimationFrame(rafId);
  tuneForScreen();
  await stableMeasureAndInit();

  // reset state
  score = 0;
  scoreCont.textContent = "Your Score: 0";
  obstacleWrap.dataset.scored = "0";

  onGround = true;
  y = 0;
  vy = 0;
  sheepWrap.style.bottom = sheepBaseBottom + "px";

  resetObstacle();

  // UI: remove overlay and set welcome text
  if (startOverlay && startOverlay.parentElement) startOverlay.remove();
  if (gameOverEl) gameOverEl.textContent = "Welcome to SheepRush";

  // audio & start
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (e) {}
  gameRunning = true;
  paused = false;
  rafId = requestAnimationFrame(loop);
}

function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  paused = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  try {
    audiogo.currentTime = 0;
    audiogo.play().catch(() => {});
  } catch (e) {}
  try {
    audio.pause();
  } catch (e) {}

  // ensure overlay shows and message is clear
  if (!document.body.contains(startOverlay)) {
    document.body.appendChild(startOverlay);
    startOverlay.style.display = "flex";
  }
  if (gameOverEl) gameOverEl.textContent = "Game Over! Tap Start to play again";

  obstacleWrap.dataset.scored = "0";
}

/* -------------------------
   Actions: jump / pause
   ------------------------- */
function doJump() {
  if (!gameRunning || paused) return;
  if (!onGround) return;
  onGround = false;
  vy = jumpPower;
}

function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  if (paused) {
    if (rafId) cancelAnimationFrame(rafId);
    try {
      audio.pause();
    } catch (e) {}
    if (gameOverEl) gameOverEl.textContent = "Paused";
    if (pauseBtn) {
      pauseBtn.setAttribute("aria-pressed", "true");
      pauseBtn.textContent = "Resume";
    }
  } else {
    if (gameOverEl) gameOverEl.textContent = "";
    if (pauseBtn) {
      pauseBtn.setAttribute("aria-pressed", "false");
      pauseBtn.textContent = "Pause";
    }
    try {
      audio.play().catch(() => {});
    } catch (e) {}
    rafId = requestAnimationFrame(loop);
  }
}

/* -------------------------
   Input wiring
   ------------------------- */
document.addEventListener("pointerdown", (e) => {
  if (e.target === pauseBtn) return;
  if (!gameRunning) {
    beginRun();
    return;
  }
  if (gameRunning && !paused) doJump();
});

if (startBtn)
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    beginRun();
  });
if (pauseBtn)
  pauseBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    togglePause();
  });

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!gameRunning) beginRun();
    else doJump();
  } else if (e.key === "p" || e.key === "P") {
    togglePause();
  } else if ((e.key === "r" || e.key === "R") && !gameRunning) {
    beginRun();
  }
});

/* -------------------------
   Init UI text & ensure overlay initially visible
   ------------------------- */
scoreCont.textContent = "Your Score: 0";
gameOverEl.textContent = "Tap anywhere to start";

if (startOverlay && !document.body.contains(startOverlay)) {
  document.body.appendChild(startOverlay);
  startOverlay.style.display = "flex";
}

/* expose debug helpers */
window.__SheepRush = {
  beginRun,
  onGameOver,
  doJump,
  togglePause,
  getScore: () => score,
};

/* script.js - corrected: stable scoring, stronger movement, pointer dedupe, proper resume positions */

/* audio */
const audiogo = new Audio("gameover.mp3");
const audio = new Audio("music.mp3");
audio.loop = true;
audio.preload = "auto";
audio.volume = 0.6;

/* DOM */
const container = document.getElementById("gameContainer");
const sheep = document.querySelector(".sheep");
const obstacle = document.querySelector(".obstacle");
const gameOverEl = document.querySelector(".gameOver");
const scoreCont = document.getElementById("scoreCont");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");

/* state */
let score = 0;
let gameRunning = false;
let gameLoopId = null;
let ignoreCollisions = true;
let prevObstacleCenter = Number.POSITIVE_INFINITY;
let restartHintAdded = false;

/* scoring cooldown to avoid double-count */
let crossCooldown = false;

/* pointer dedupe */
let lastPointerTime = 0;
function recordPointer() {
  lastPointerTime = Date.now();
}
function isRecentPointer() {
  return Date.now() - lastPointerTime < 400;
}

/* preload assets (non-blocking: errors count as loaded after attempt) */
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

/* helper */
function tryPlaySound(a) {
  a.play().catch(() => {});
}

/* Movement helpers - container-relative step (bigger % for better feel) */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}
function jump() {
  if (isJumping()) return;
  sheep.classList.add("animateSheep");
  // remove after animation time
  setTimeout(() => sheep.classList.remove("animateSheep"), 600);
}

/* If the sheep lacks an explicit left inline, freeze its computed left at start of game
   so jumps do not affect layout. We'll set this in startGame() */
function ensureSheepHasInlineLeft() {
  if (!sheep.style.left || sheep.style.left === "") {
    // read its current offsetLeft and write back as inline px value
    const leftPx = sheep.offsetLeft || 10;
    sheep.style.left = leftPx + "px";
  }
}

function computeStep() {
  const w = (container && container.clientWidth) || window.innerWidth;
  // 12% step gives a noticeably larger movement on mobile; tune if needed
  return Math.max(8, Math.round(w * 0.12));
}

function moveLeft() {
  ensureSheepHasInlineLeft();
  const step = computeStep();
  const newLeft = Math.max(0, sheep.offsetLeft - step);
  sheep.style.left = newLeft + "px";
}

function moveRight() {
  ensureSheepHasInlineLeft();
  const step = computeStep();
  // account for container padding/reserved bottom not affecting width; subtract small margin
  const maxLeft = Math.max(
    0,
    (container.clientWidth || window.innerWidth) - sheep.offsetWidth - 6
  );
  const newLeft = Math.min(maxLeft, sheep.offsetLeft + step);
  sheep.style.left = newLeft + "px";
}

/* unified pointer handler to avoid duplicate touch+click */
function onControlPointer(ev, action) {
  ev.preventDefault();
  ev.stopPropagation();
  recordPointer();
  if (action === "left") moveLeft();
  else if (action === "right") moveRight();
  else if (action === "jump") jump();
}

/* attach pointer handlers */
if (leftBtn)
  leftBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "left"));
if (rightBtn)
  rightBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "right"));
if (jumpBtn)
  jumpBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "jump"));

/* keyboard */
document.addEventListener("keydown", (e) => {
  tryPlaySound(audio);
  if (!gameRunning) {
    if (e.key === "r" || e.key === "R") startGame();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "w") jump();
  if (e.key === "ArrowLeft" || e.key === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key === "d") moveRight();
});

/* collision detection - safe checks */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // if obstacle hasn't entered visible container yet -> no collision
  if (obsRect.left > containerRect.right - 8) return false;

  // non-overlap quick test
  if (obsRect.right < sheepRect.left || obsRect.left > sheepRect.right)
    return false;

  const dx = Math.abs(
    sheepRect.left + sheepRect.width / 2 - (obsRect.left + obsRect.width / 2)
  );
  const dy = Math.abs(
    sheepRect.top + sheepRect.height / 2 - (obsRect.top + obsRect.height / 2)
  );
  const collisionXThreshold = Math.min(
    (sheepRect.width + obsRect.width) * 0.3,
    100
  );
  const collisionYThreshold = Math.min(
    (sheepRect.height + obsRect.height) * 0.32,
    100
  );

  return dx < collisionXThreshold && dy < collisionYThreshold;
}

/* crossing-based scoring with cooldown */
function checkScoringByCrossing() {
  if (ignoreCollisions) {
    // set prev to current center so we don't detect crossing immediately after enabling
    const obsRect = obstacle.getBoundingClientRect();
    prevObstacleCenter = obsRect.left + obsRect.width / 2;
    return;
  }

  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const obstacleCenter = obsRect.left + obsRect.width / 2;
  const sheepCenter = sheepRect.left + sheepRect.width / 2;

  if (
    !crossCooldown &&
    prevObstacleCenter > sheepCenter &&
    obstacleCenter < sheepCenter
  ) {
    // single valid crossing
    score += 1;
    updateScore(score);
    crossCooldown = true;
    setTimeout(() => (crossCooldown = false), 900);

    // speed up obstacle slightly and clamp
    const computed = window.getComputedStyle(obstacle);
    const cur =
      parseFloat(computed.getPropertyValue("animation-duration")) || 5;
    obstacle.style.animationDuration = Math.max(1.0, cur - 0.12) + "s";
  }

  prevObstacleCenter = obstacleCenter;
}

/* Game Over - remove existing hints defensively and add one */
function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  gameOverEl.textContent = "Game Over!";
  audiogo.play().catch(() => {});
  audio.pause();
  obstacle.classList.remove("obstacleAni");

  // clear previous hints
  const prevHints = gameOverEl.parentElement.querySelectorAll(".restartHint");
  prevHints.forEach((h) => h.remove());
  restartHintAdded = false;

  if (!restartHintAdded) {
    const hint = document.createElement("div");
    hint.className = "restartHint";
    hint.textContent = "Tap anywhere or press R to restart";
    gameOverEl.parentElement.appendChild(hint);
    restartHintAdded = true;
  }

  if (gameLoopId) cancelAnimationFrame(gameLoopId);
}

/* restart */
function restartGame() {
  // remove hints
  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  restartHintAdded = false;

  score = 0;
  updateScore(score);
  gameOverEl.textContent = "Welcome to SheepRush";
  ignoreCollisions = true;
  prevObstacleCenter = Number.POSITIVE_INFINITY;
  crossCooldown = false;

  setTimeout(() => {
    ignoreCollisions = false;
  }, 700);

  // reset obstacle animation cleanly
  obstacle.style.animationDuration = "";
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  // reset sheep inline left to CSS start (let CSS clamp apply)
  sheep.style.left = "";
  ensureSheepHasInlineLeft();

  tryPlaySound(audio);
  gameRunning = true;
  runGameLoop();
}

/* update UI */
function updateScore(s) {
  scoreCont.textContent = "Your Score: " + s;
}

/* main loop */
function gameStep() {
  if (!gameRunning) return;
  if (detectCollision()) {
    onGameOver();
    return;
  }
  checkScoringByCrossing();
  gameLoopId = requestAnimationFrame(gameStep);
}
function runGameLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(gameStep);
}

/* startGame: wait for preloads or timeout, then begin */
function startGame() {
  // set sheep inline left to fix jump jerking behavior
  ensureSheepHasInlineLeft();

  // wait until assets loaded or wait 2s max
  const startDeadline = Date.now() + 2000;
  const waiter = () => {
    if (loadedCount >= totalAssets || Date.now() > startDeadline) {
      beginRun();
    } else {
      setTimeout(waiter, 120);
    }
  };
  waiter();
}

/* begin run after overlay removed */
function beginRun() {
  tryPlaySound(audio);
  if (startOverlay) startOverlay.remove();

  // clear any previous restart hints
  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  restartHintAdded = false;

  // start obstacle animation after small settle delay and enable collisions
  ignoreCollisions = true;
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  setTimeout(() => {
    // set prev center to current center so we don't immediately score
    const r = obstacle.getBoundingClientRect();
    prevObstacleCenter = r.left + r.width / 2;
    obstacle.classList.add("obstacleAni");
    ignoreCollisions = false;
  }, 300);

  score = 0;
  updateScore(score);
  gameRunning = true;
  runGameLoop();
}

/* restart on click (guard against recent pointer events to avoid double triggers) */
document.addEventListener("click", (e) => {
  if (isRecentPointer()) return;
  if (!gameRunning) restartGame();
});

/* wire start button */
if (startBtn)
  startBtn.addEventListener("click", (e) => {
    recordPointer();
    startGame();
  });

/* init state */
obstacle.classList.remove("obstacleAni");
updateScore(score);

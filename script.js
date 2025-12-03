/* script.js - corrected preload + robust movement + mobile-safe controls */

/* audio elements */
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
let restartHintAdded = false;
let prevObstacleCenter = Number.POSITIVE_INFINITY;

/* pointer dedupe */
let lastPointerTime = 0;
function recordPointer() {
  lastPointerTime = Date.now();
}
function isRecentPointer() {
  return Date.now() - lastPointerTime < 600;
}

/* --- Preload assets safely --- */
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
  // optional: console.log("asset loaded:", loadedCount, "/", totalAssets);
}

/* preload images */
imagesToLoad.forEach((src) => {
  const img = new Image();
  img.onload = markLoaded;
  img.onerror = markLoaded; // treat error as loaded to avoid blocking
  img.src = src;
});

/* preload audio (use onloadeddata if possible) */
audiosToLoad.forEach((src) => {
  const a = document.createElement("audio");
  a.onloadeddata = markLoaded;
  a.onerror = markLoaded;
  a.src = src;
});

/* helper to play audio on user gesture */
function tryPlaySound(a) {
  a.play().catch(() => {});
}

/* movement helpers */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}
function jump() {
  if (isJumping()) return;
  sheep.classList.add("animateSheep");
  setTimeout(() => sheep.classList.remove("animateSheep"), 600);
}

/* compute step from container width (container-relative) */
function computeStep() {
  const w = (container && container.clientWidth) || window.innerWidth;
  return Math.max(8, Math.round(w * 0.1)); // 10% step (tune if needed)
}

function moveLeft() {
  const step = computeStep();
  const newLeft = Math.max(0, sheep.offsetLeft - step);
  sheep.style.left = newLeft + "px";
}

function moveRight() {
  const step = computeStep();
  const maxLeft =
    container && container.clientWidth
      ? container.clientWidth - sheep.offsetWidth
      : window.innerWidth - sheep.offsetWidth;
  const newLeft = Math.min(maxLeft, sheep.offsetLeft + step);
  sheep.style.left = newLeft + "px";
}

/* unified pointer handler (prevents duplicate touch+click) */
function onControlPointer(ev, action) {
  ev.preventDefault();
  ev.stopPropagation();
  recordPointer();
  if (action === "left") moveLeft();
  if (action === "right") moveRight();
  if (action === "jump") jump();
}

/* attach pointer handlers */
if (leftBtn)
  leftBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "left"));
if (rightBtn)
  rightBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "right"));
if (jumpBtn)
  jumpBtn.addEventListener("pointerdown", (e) => onControlPointer(e, "jump"));

/* keyboard support */
document.addEventListener("keydown", (e) => {
  // try start audio on any key press
  tryPlaySound(audio);
  if (!gameRunning) {
    if (e.key === "r" || e.key === "R") startGame();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "w") jump();
  if (e.key === "ArrowLeft" || e.key === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key === "d") moveRight();
});

/* collision detection */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();

  // obstacle not on-screen yet -> no collision
  const containerRect =
    (container && container.getBoundingClientRect()) ||
    document.documentElement.getBoundingClientRect();
  if (obsRect.left > containerRect.right - 10) return false;

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

/* scoring */
function checkScoringByCrossing() {
  if (ignoreCollisions) {
    prevObstacleCenter = Number.POSITIVE_INFINITY;
    return;
  }
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const obstacleCenter = obsRect.left + obsRect.width / 2;
  const sheepCenter = sheepRect.left + sheepRect.width / 2;
  if (prevObstacleCenter > sheepCenter && obstacleCenter < sheepCenter) {
    score++;
    updateScore(score);
    const computed = window.getComputedStyle(obstacle);
    const cur =
      parseFloat(computed.getPropertyValue("animation-duration")) || 5;
    obstacle.style.animationDuration = Math.max(1.2, cur - 0.12) + "s";
  }
  prevObstacleCenter = obstacleCenter;
}

/* Game over handling — remove existing hints first, then add only one */
function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;

  // set Game Over text once
  gameOverEl.textContent = "Game Over!";

  // play sounds & stop obstacle
  audiogo.play().catch(()=>{});
  audio.pause();
  obstacle.classList.remove("obstacleAni");

  // remove any previous restart hint elements (defensive)
  const oldHints = gameOverEl.parentElement.querySelectorAll(".restartHint");
  oldHints.forEach(h => h.remove());
  restartHintAdded = false;

  // add a single restart hint
  if (!restartHintAdded) {
    const hint = document.createElement("div");
    hint.className = "restartHint";
    hint.textContent = "Tap anywhere or press R to restart";
    gameOverEl.parentElement.appendChild(hint);
    restartHintAdded = true;
  }

  // stop the game loop
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
}

/* Restart — remove hint(s) and restore initial state */
function restartGame() {
  // remove any existing restart hints before resetting UI
  const ex = document.querySelectorAll(".restartHint");
  ex.forEach(e => e.remove());
  restartHintAdded = false;

  score = 0;
  updateScore(score);
  gameOverEl.textContent = "Welcome to SheepRush";
  ignoreCollisions = true;
  prevObstacleCenter = Number.POSITIVE_INFINITY;

  // short grace period after restart
  setTimeout(() => { ignoreCollisions = false; }, 700);

  // reset obstacle animation: let CSS control start position
  obstacle.style.animationDuration = "";
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  // reset sheep position
  sheep.style.left = "";

  tryPlaySound(audio);
  gameRunning = true;
  runGameLoop();
}

/* update score UI */
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

/* startGame: wait for assets to be loaded (or time out) */
function startGame() {
  // if assets not finished loading, wait briefly (but do not block forever)
  if (loadedCount < totalAssets) {
    // wait up to a short amount and then proceed (prevents infinite block on bad network)
    const startWaitLimit = Date.now() + 3000; // wait up to 3s more
    const wait = () => {
      if (loadedCount >= totalAssets || Date.now() > startWaitLimit) {
        beginRun();
      } else {
        setTimeout(wait, 150);
      }
    };
    wait();
    return;
  }
  beginRun();
}

/* set up and start gameplay */
function beginRun() {
  // user gesture acknowledged
  tryPlaySound(audio);
  if (startOverlay) startOverlay.remove();

  // small delay, then start obstacle animation and enable collisions
  ignoreCollisions = true;
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  setTimeout(() => {
    obstacle.classList.add("obstacleAni");
    ignoreCollisions = false;
    prevObstacleCenter = Number.POSITIVE_INFINITY;
  }, 300);

  score = 0;
  updateScore(score);
  restartHintAdded = false;
  gameRunning = true;
  runGameLoop();
}

/* click to restart (but ignore clicks immediately after pointer events) */
document.addEventListener("click", () => {
  if (isRecentPointer()) return;
  if (!gameRunning) restartGame();
});

/* attach start button */
if (startBtn)
  startBtn.addEventListener("click", (e) => {
    recordPointer();
    startGame();
  });

/* initialization: ensure obstacle doesn't run before start */
obstacle.classList.remove("obstacleAni");
updateScore(score);

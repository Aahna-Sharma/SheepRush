/* script.js — preload assets, robust movement, mobile-safe controls */

const audiogo = new Audio("gameover.mp3");
const audio = new Audio("music.mp3");
audio.loop = true;
audio.preload = "auto";
audio.volume = 0.6;

/* DOM refs (may be null until DOM ready but defer script ensures loaded) */
const sheep = document.querySelector(".sheep");
const obstacle = document.querySelector(".obstacle");
const gameOverEl = document.querySelector(".gameOver");
const scoreCont = document.getElementById("scoreCont");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");

/* game state */
let score = 0;
let gameRunning = false; // start only after assets + user gesture
let gameLoopId = null;
let ignoreCollisions = true;
let restartHintAdded = false;
let prevObstacleCenter = Number.POSITIVE_INFINITY;

/* preload images and audio before starting collisions */
const assets = [
  { type: "img", src: "sheep.png" },
  { type: "img", src: "dragon.png" },
  { type: "img", src: "green-meadow-landscape-game-background-vector.jpg" },
  { type: "audio", src: "music.mp3" },
  { type: "audio", src: "gameover.mp3" },
];
let loaded = 0;
function assetLoaded() {
  loaded++;
}
/* create loaders */
assets.forEach((a) => {
  if (a.type === "img") {
    const im = new Image();
    im.onload = assetLoaded;
    im.src = a.src;
  } else {
    // audio: create an element and try to load metadata
    const au = document.createElement("audio");
    au.src = a.src;
    au.onloadeddata = assetLoaded;
    // don't append to DOM
  }
});

/* helper to start playing audio safely after user gesture */
function tryPlaySound(a) {
  a.play().catch(() => {});
}

/* Start game when user taps Start button */
function startFromOverlay() {
  // ensure assets loaded (if not, wait a little)
  if (loaded < assets.length) {
    // show a short wait and then start once loaded
    setTimeout(startFromOverlay, 300);
    return;
  }
  tryPlaySound(audio);
  if (startOverlay) startOverlay.remove();
  startGame();
}
if (startBtn) startBtn.addEventListener("click", startFromOverlay);

/* Movement helpers using offsetLeft (container-relative) — more reliable on mobile */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}
function jump() {
  if (isJumping()) return;
  sheep.classList.add("animateSheep");
  setTimeout(() => sheep.classList.remove("animateSheep"), 600);
}

function moveLeft() {
  const parent = sheep.offsetParent || document.querySelector(".gameContainer");
  const step = Math.max(8, Math.round(window.innerWidth * 0.06));
  const newLeft = Math.max(0, sheep.offsetLeft - step);
  sheep.style.left = newLeft + "px";
}

function moveRight() {
  const parentEl = document.querySelector(".gameContainer");
  const parentWidth = parentEl.clientWidth;
  const step = Math.max(8, Math.round(window.innerWidth * 0.06));
  const maxLeft = parentWidth - sheep.offsetWidth;
  const newLeft = Math.min(maxLeft, sheep.offsetLeft + step);
  sheep.style.left = newLeft + "px";
}

/* Touch + keyboard hooks */
document.addEventListener("keydown", (e) => {
  // start music on first keydown if not started
  tryPlaySound(audio);
  if (!gameRunning) {
    if (e.key === "r" || e.key === "R") startGame();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "w") jump();
  if (e.key === "ArrowLeft" || e.key === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key === "d") moveRight();
});

if (leftBtn && rightBtn && jumpBtn) {
  leftBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    moveLeft();
  });
  rightBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    moveRight();
  });
  jumpBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    jump();
  });
  leftBtn.addEventListener("click", moveLeft);
  rightBtn.addEventListener("click", moveRight);
  jumpBtn.addEventListener("click", jump);
}

/* detect collision: safe checks + tighter thresholds */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();

  // early exit: if obstacle hasn't entered visible area yet, no collision
  if (obsRect.left > window.innerWidth + 20) return false;

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

/* scoring by center crossing */
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
    obstacle.style.animationDuration = Math.max(1.4, cur - 0.15) + "s";
  }
  prevObstacleCenter = obstacleCenter;
}

/* game over */
function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  gameOverEl.textContent = "Game Over!";
  audiogo.play().catch(() => {});
  audio.pause();
  obstacle.classList.remove("obstacleAni");
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
  score = 0;
  updateScore(score);
  gameOverEl.textContent = "Welcome to SheepRush";
  restartHintAdded = false;
  ignoreCollisions = true;
  prevObstacleCenter = Number.POSITIVE_INFINITY;
  setTimeout(() => {
    ignoreCollisions = false;
  }, 700);

  const ex = document.querySelector(".restartHint");
  if (ex) ex.remove();

  obstacle.style.animationDuration = ""; // let CSS default work
  obstacle.style.left = ""; // let animation start from 100vw
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  sheep.style.left = ""; // reset to CSS start
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
  gameRunning = true;
  gameLoopId = requestAnimationFrame(gameStep);
}

/* startGame: called after overlay removed and assets loaded */
function startGame() {
  // ensure obstacle animation only starts after dragon image is ready
  // (assets preloaded earlier)
  ignoreCollisions = true;
  // small delay so animation starts and layout settles
  setTimeout(() => {
    obstacle.classList.add("obstacleAni");
    ignoreCollisions = false;
    prevObstacleCenter = Number.POSITIVE_INFINITY;
  }, 300);

  // start loop
  score = 0;
  updateScore(score);
  restartHintAdded = false;
  gameRunning = true;
  runGameLoop();
}

/* click to restart if game over */
document.addEventListener("click", (e) => {
  if (!gameRunning) restartGame();
});

/* init UI state: keep animation paused until start */
obstacle.classList.remove("obstacleAni");
updateScore(score);

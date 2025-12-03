/* script.js — robust scoring: score when obstacle.right < sheep.left (one-per-obstacle),
   single-tap jump that also moves forward, preload safe, pointer dedupe, container-relative steps.
*/

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
let restartHintAdded = false;

/* per-obstacle scoring flag */
let scoredForThisObstacle = false;

/* pointer dedupe */
let lastPointerTime = 0;
function recordPointer() {
  lastPointerTime = Date.now();
}
function isRecentPointer() {
  return Date.now() - lastPointerTime < 400;
}

/* preload assets */
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

/* helpers */
function tryPlaySound(a) {
  a.play().catch(() => {});
}
function ensureSheepHasInlineLeft() {
  if (!sheep.style.left || sheep.style.left === "") {
    const leftPx = sheep.offsetLeft || 10;
    sheep.style.left = leftPx + "px";
  }
}

/* movement computations */
function computeStepManual() {
  const w = (container && container.clientWidth) || window.innerWidth;
  return Math.max(8, Math.round(w * 0.08)); // 8% manual
}
function computeJumpForward() {
  const w = (container && container.clientWidth) || window.innerWidth;
  return Math.max(24, Math.round(w * 0.18)); // 18% forward on jump
}

/* move functions */
function moveLeft() {
  ensureSheepHasInlineLeft();
  const step = computeStepManual();
  const newLeft = Math.max(0, sheep.offsetLeft - step);
  sheep.style.left = newLeft + "px";
}
function moveRight() {
  ensureSheepHasInlineLeft();
  const step = computeStepManual();
  const maxLeft = Math.max(
    0,
    (container.clientWidth || window.innerWidth) - sheep.offsetWidth - 6
  );
  const newLeft = Math.min(maxLeft, sheep.offsetLeft + step);
  sheep.style.left = newLeft + "px";
}

/* jump: vertical + forward using CSS transition so it's smooth */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}
function jump() {
  if (isJumping()) return;
  ensureSheepHasInlineLeft();

  const forward = computeJumpForward();
  const maxLeft = Math.max(
    0,
    (container.clientWidth || window.innerWidth) - sheep.offsetWidth - 6
  );
  const targetLeft = Math.min(maxLeft, sheep.offsetLeft + forward);

  sheep.classList.add("animateSheep");

  const oldTransition = sheep.style.transition || "";
  sheep.style.transition = "left 0.6s ease";

  // move forward in next frame
  requestAnimationFrame(() => {
    sheep.style.left = targetLeft + "px";
  });

  setTimeout(() => {
    sheep.classList.remove("animateSheep");
    sheep.style.transition = oldTransition;
  }, 600);
}

/* pointer handlers */
function onControlPointer(ev, action) {
  ev.preventDefault();
  ev.stopPropagation();
  recordPointer();
  if (action === "left") moveLeft();
  else if (action === "right") moveRight();
  else if (action === "jump") jump();
}
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

/* collision detection (keeps previous safe exits) */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (obsRect.left > containerRect.right - 8) return false;
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

/* NEW robust scoring: increment once when obstacle.right < sheep.left */
function checkScoringByObstaclePassing() {
  if (!gameRunning || ignoreCollisions) return;

  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // if obstacle is just restarting (off-screen to right), reset scored flag
  if (obsRect.left > containerRect.right - 20) {
    scoredForThisObstacle = false;
    return;
  }

  // if obstacle's right edge has passed sheep's left edge and we haven't scored for this obstacle
  if (!scoredForThisObstacle && obsRect.right < sheepRect.left) {
    scoredForThisObstacle = true;
    score += 1;
    updateScore(score);

    // speed up obstacle slightly
    const computed = window.getComputedStyle(obstacle);
    const cur =
      parseFloat(computed.getPropertyValue("animation-duration")) || 5;
    obstacle.style.animationDuration = Math.max(0.9, cur - 0.12) + "s";
  }
}

/* game over handling */
function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  gameOverEl.textContent = "Game Over!";
  audiogo.play().catch(() => {});
  audio.pause();
  obstacle.classList.remove("obstacleAni");

  // remove duplicate hints then add one
  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
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
  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  restartHintAdded = false;

  score = 0;
  updateScore(score);
  gameOverEl.textContent = "Welcome to SheepRush";
  ignoreCollisions = true;
  scoredForThisObstacle = false;

  setTimeout(() => {
    ignoreCollisions = false;
  }, 700);

  obstacle.style.animationDuration = "";
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  sheep.style.left = "";
  ensureSheepHasInlineLeft();

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
  checkScoringByObstaclePassing();
  gameLoopId = requestAnimationFrame(gameStep);
}
function runGameLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(gameStep);
}

/* start sequence: wait for preload then start */
function startGame() {
  ensureSheepHasInlineLeft();
  const deadline = Date.now() + 2000;
  const wait = () => {
    if (loadedCount >= totalAssets || Date.now() > deadline) {
      beginRun();
    } else setTimeout(wait, 150);
  };
  wait();
}
function beginRun() {
  tryPlaySound(audio);
  if (startOverlay) startOverlay.remove();

  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  restartHintAdded = false;

  ignoreCollisions = true;
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  setTimeout(() => {
    const r = obstacle.getBoundingClientRect();
    // reset per-obstacle scored flag so first obstacle won't be scored prematurely
    scoredForThisObstacle = false;
    obstacle.classList.add("obstacleAni");
    ignoreCollisions = false;
  }, 300);

  score = 0;
  updateScore(score);
  gameRunning = true;
  runGameLoop();
}

/* restart on click */
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

/* init */
obstacle.classList.remove("obstacleAni");
updateScore(score);

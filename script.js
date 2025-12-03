/* script.js — SheepRush (updated scoring: crossing detection) */

/* Audio setup */
const audiogo = new Audio("gameover.mp3");
const audio = new Audio("music.mp3");
audio.loop = true;
audio.preload = "auto";
audio.volume = 0.6;
function tryPlaySound(a) {
  a.play().catch(() => {});
}
function startAudioOnFirstGesture() {
  tryPlaySound(audio);
  document.removeEventListener("keydown", startAudioOnFirstGesture);
  document.removeEventListener("click", startAudioOnFirstGesture);
  document.removeEventListener("touchstart", startAudioOnFirstGesture);
}
document.addEventListener("keydown", startAudioOnFirstGesture, { once: true });
document.addEventListener("click", startAudioOnFirstGesture, { once: true });
document.addEventListener("touchstart", startAudioOnFirstGesture, {
  once: true,
});

/* DOM refs */
const sheep = document.querySelector(".sheep");
const obstacle = document.querySelector(".obstacle");
const gameOverEl = document.querySelector(".gameOver");
const scoreCont = document.getElementById("scoreCont");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");

/* Game state */
let score = 0;
let gameRunning = true;
let gameLoopId = null;
let ignoreCollisions = true;
let restartHintAdded = false;

/* --- New: track previous obstacle center to detect crossing */
let prevObstacleCenter = Number.POSITIVE_INFINITY; // large positive at start

/* init obstacle */
(function initObstacleStart() {
  obstacle.style.left = "110vw";
  obstacle.classList.remove("obstacleAni");
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");
  ignoreCollisions = true;
  setTimeout(() => {
    ignoreCollisions = false;
  }, 700);
})();

/* Movement helpers */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}
function jump() {
  if (isJumping()) return;
  sheep.classList.add("animateSheep");
  setTimeout(() => sheep.classList.remove("animateSheep"), 600);
}
function moveLeft() {
  const rect = sheep.getBoundingClientRect();
  const container = document
    .querySelector(".gameContainer")
    .getBoundingClientRect();
  const step = Math.max(8, Math.round(window.innerWidth * 0.06));
  const newLeft = Math.max(0, rect.left - step - container.left);
  sheep.style.left = newLeft + "px";
}
function moveRight() {
  const rect = sheep.getBoundingClientRect();
  const container = document
    .querySelector(".gameContainer")
    .getBoundingClientRect();
  const step = Math.max(8, Math.round(window.innerWidth * 0.06));
  const newLeft = Math.min(
    container.width - rect.width,
    rect.left + step - container.left
  );
  sheep.style.left = newLeft + "px";
}

/* Keyboard & touch listeners */
document.addEventListener("keydown", (e) => {
  tryPlaySound(audio);
  if (!gameRunning && (e.key === "r" || e.key === "R")) {
    restartGame();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") jump();
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLeft();
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveRight();
});
if (leftBtn && rightBtn && jumpBtn) {
  leftBtn.addEventListener("touchstart", (ev) => {
    ev.preventDefault();
    moveLeft();
  });
  rightBtn.addEventListener("touchstart", (ev) => {
    ev.preventDefault();
    moveRight();
  });
  jumpBtn.addEventListener("touchstart", (ev) => {
    ev.preventDefault();
    jump();
  });
  leftBtn.addEventListener("click", moveLeft);
  rightBtn.addEventListener("click", moveRight);
  jumpBtn.addEventListener("click", jump);
}

/* Collision detection */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const dx = Math.abs(
    sheepRect.left + sheepRect.width / 2 - (obsRect.left + obsRect.width / 2)
  );
  const dy = Math.abs(
    sheepRect.top + sheepRect.height / 2 - (obsRect.top + obsRect.height / 2)
  );
  const collisionXThreshold = Math.min(
    (sheepRect.width + obsRect.width) * 0.38,
    120
  );
  const collisionYThreshold = Math.min(
    (sheepRect.height + obsRect.height) * 0.38,
    120
  );
  return dx < collisionXThreshold && dy < collisionYThreshold;
}

/* --- New crossing-based scoring */
function checkScoringByCrossing() {
  if (ignoreCollisions) {
    // reset prev center so we don't accidentally detect a crossing during grace
    prevObstacleCenter = Number.POSITIVE_INFINITY;
    return;
  }

  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();

  const obstacleCenter = obsRect.left + obsRect.width / 2;
  const sheepCenter = sheepRect.left + sheepRect.width / 2;

  // prevObstacleCenter > sheepCenter  AND obstacleCenter < sheepCenter => crossed from right -> left
  if (prevObstacleCenter > sheepCenter && obstacleCenter < sheepCenter) {
    // valid single crossing: increment score once
    score += 1;
    updateScore(score);

    // speed up obstacle a bit
    const computed = window.getComputedStyle(obstacle);
    const cur =
      parseFloat(computed.getPropertyValue("animation-duration")) || 5;
    const newDur = Math.max(1.2, cur - 0.2);
    obstacle.style.animationDuration = newDur + "s";
  }

  // update prevObstacleCenter for next frame
  prevObstacleCenter = obstacleCenter;
}

/* Game over handling */
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

/* Restart */
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

  // remove hint if present
  const ex = document.querySelector(".restartHint");
  if (ex) ex.remove();

  // reset obstacle animation cleanly
  obstacle.style.animationDuration = "";
  obstacle.style.left = "110vw";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  // reset sheep
  sheep.style.left = "";

  tryPlaySound(audio);
  gameRunning = true;
  runGameLoop();
}

/* Update score UI */
function updateScore(s) {
  scoreCont.textContent = "Your Score: " + s;
}

/* Main loop */
function gameStep() {
  if (!gameRunning) return;
  if (detectCollision()) {
    onGameOver();
    return;
  }

  // use crossing-based scoring
  checkScoringByCrossing();

  gameLoopId = requestAnimationFrame(gameStep);
}
function runGameLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameRunning = true;
  gameLoopId = requestAnimationFrame(gameStep);
}

/* restart on click/key */
document.addEventListener("click", () => {
  if (!gameRunning) restartGame();
});
document.addEventListener("keydown", (e) => {
  if (!gameRunning && (e.key === "r" || e.key === "R")) restartGame();
});

/* init */
updateScore(score);
runGameLoop();


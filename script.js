/* script.js — SheepRush (tuned collision + mobile-safe controls) */

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

/* Track previous obstacle center to detect crossing */
let prevObstacleCenter = Number.POSITIVE_INFINITY;

/* init obstacle — start farther off-screen and longer grace */
(function initObstacleStart() {
  obstacle.style.left = "140vw"; // start further to the right
  obstacle.classList.remove("obstacleAni");
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");
  ignoreCollisions = true;
  // give the page a longer grace so animations and layout settle
  setTimeout(() => {
    ignoreCollisions = false;
  }, 1200);
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

/* Collision detection — safer and faster checks */
function detectCollision() {
  if (!gameRunning || ignoreCollisions) return false;

  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();

  // quick early exit: if obstacle is fully left or right of sheep, no collision
  if (obsRect.right < sheepRect.left || obsRect.left > sheepRect.right)
    return false;

  // center distance method with tighter thresholds
  const dx = Math.abs(
    sheepRect.left + sheepRect.width / 2 - (obsRect.left + obsRect.width / 2)
  );
  const dy = Math.abs(
    sheepRect.top + sheepRect.height / 2 - (obsRect.top + obsRect.height / 2)
  );
  const collisionXThreshold = Math.min(
    (sheepRect.width + obsRect.width) * 0.32,
    100
  ); // tightened
  const collisionYThreshold = Math.min(
    (sheepRect.height + obsRect.height) * 0.32,
    100
  ); // tightened

  return dx < collisionXThreshold && dy < collisionYThreshold;
}

/* Crossing-based scoring (unchanged logic) */
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
    score += 1;
    updateScore(score);
    const computed = window.getComputedStyle(obstacle);
    const cur =
      parseFloat(computed.getPropertyValue("animation-duration")) || 5;
    const newDur = Math.max(1.4, cur - 0.15);
    obstacle.style.animationDuration = newDur + "s";
  }
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
  }, 900);

  const ex = document.querySelector(".restartHint");
  if (ex) ex.remove();

  obstacle.style.animationDuration = "";
  
  obstacle.style.left = "";
  void obstacle.offsetWidth; // reflow
  obstacle.classList.add("obstacleAni");

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

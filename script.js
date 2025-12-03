/* script.js — aggressive mobile fix:
   - jump = vertical + forward (mobile gets bigger forward)
   - scoring: robust right-edge crossing detection with prevRight check
   - preloads preserved, pointer dedupe preserved
*/

/* audio setup */
const audiogo = new Audio("gameover.mp3");
const audio = new Audio("music.mp3");
audio.loop = true;
audio.preload = "auto";
audio.volume = 0.6;

/* DOM refs */
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

/* scoring flags per obstacle */
let scoredForThisObstacle = false;
/* previous right edge (to detect clear crossing across frames) */
let prevObstacleRight = Number.NEGATIVE_INFINITY;

/* pointer dedupe */
let lastPointerTime = 0;
function recordPointer() {
  lastPointerTime = Date.now();
}
function isRecentPointer() {
  return Date.now() - lastPointerTime < 450;
}

/* preload (non-blocking for errors) */
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

/* small mobile detector */
const isMobile =
  (typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches) ||
  /Mobi|Android|iPhone|iPad|iPod|Phone/i.test(navigator.userAgent || "");

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

/* movement */
function computeStepManual() {
  const w = (container && container.clientWidth) || window.innerWidth;
  return Math.max(8, Math.round(w * 0.08)); // manual left/right: 8%
}
function computeJumpForward() {
  const w = (container && container.clientWidth) || window.innerWidth;
  // Mobile sheep jumps VERY far forward
  const percent = isMobile ? 0.65 : 0.18;

  return Math.max(30, Math.round(w * percent));
}

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

/* robust jump: vertical + forward with double rAF, cleaned transition */
function isJumping() {
  return sheep.classList.contains("animateSheep");
}

// REPLACE your existing jump() with this function

function jump() {
  // don't start another jump while already jumping
  if (isJumping()) return;

  // ensure inline left exists so transitions animate predictably
  ensureSheepHasInlineLeft();

  const containerWidth = (container && container.clientWidth) || window.innerWidth;
  const currLeft = sheep.offsetLeft;
  const maxLeft = Math.max(0, (container.clientWidth || window.innerWidth) - sheep.offsetWidth - 6);

  // base forward amount (container-relative). Keep it moderate.
  const baseForward = Math.max(24, Math.round(containerWidth * (isMobile ? 0.30 : 0.18)));

  // try to read obstacle position; if unavailable, just use baseForward
  let obstacleRight = null;
  try {
    const obsRect = obstacle.getBoundingClientRect();
    obstacleRight = obsRect.right; // page coordinates
  } catch (err) {
    obstacleRight = null;
  }

  // compute targetLeft: at least currLeft + baseForward,
  // but if obstacle is in front, ensure we move to just past obstacle.right (+ buffer)
  // translate obstacleRight (page coord) into container-relative left value
  let desiredLeft = currLeft + baseForward;

  if (obstacleRight !== null) {
    const containerRect = container.getBoundingClientRect();
    const obsRightRelative = obstacleRight - containerRect.left; // relative to container left
    // if the obstacle is ahead of sheep and not already passed, ensure we pass it
    if (obsRightRelative > (currLeft + 6)) {
      // set desiredLeft to slightly past obstacleRightRelative
      desiredLeft = Math.max(desiredLeft, obsRightRelative + 12); // +12px buffer
    }
  }

  // clamp to maxLeft so we don't move off-screen
  const targetLeft = Math.min(maxLeft, desiredLeft);

  // start vertical animation (CSS keyframes)
  sheep.classList.add("animateSheep");

  // animate horizontal move over same duration as the jump (600ms)
  const prevTransition = sheep.style.transition || "";
  const jumpMs = 600;

  // Use double rAF to make transitions reliable on mobile
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sheep.style.transition = `left ${jumpMs}ms ease`;
      sheep.style.left = targetLeft + "px";
    });
  });

  // cleanup after jump
  setTimeout(() => {
    sheep.classList.remove("animateSheep");
    sheep.style.transition = prevTransition;
  }, jumpMs);
}


/* unified pointer handlers */
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

/* collision detection: tightened and early-exit */
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
  // Easier collision on mobile
  const xFactor = isMobile ? 0.22 : 0.3;
  const yFactor = isMobile ? 0.28 : 0.36;

  const collisionXThreshold = (sheepRect.width + obsRect.width) * xFactor;
  const collisionYThreshold = (sheepRect.height + obsRect.height) * yFactor;

  return dx < collisionXThreshold && dy < collisionYThreshold;
}

/* NEW robust scoring: use prevObstacleRight > sheepLeft and current obs.right < sheepLeft */
function checkScoringByPassing() {
  if (!gameRunning || ignoreCollisions) return;
  const sheepRect = sheep.getBoundingClientRect();
  const obsRect = obstacle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // if obstacle is off to the right (new cycle), reset flags
  if (obsRect.left > containerRect.right - 20) {
    scoredForThisObstacle = false;
    prevObstacleRight = obsRect.right;
    return;
  }

  // Detect crossing: previously obstacle was to the right of sheep (prevObstacleRight > sheepLeft)
  // and now obstacle.right is left of sheep.left => fully passed. Buffer a few px for reliability.
  const sheepLeft = sheepRect.left;
  const nowRight = obsRect.right;
  if (
    !scoredForThisObstacle &&
    prevObstacleRight > sheepLeft + 2 &&
    nowRight < sheepLeft - 2
  ) {
    scoredForThisObstacle = true;
    score++;
    updateScore(score);
    // speed up obstacle a bit
    const cur =
      parseFloat(
        window.getComputedStyle(obstacle).getPropertyValue("animation-duration")
      ) || 5;
    obstacle.style.animationDuration = Math.max(0.8, cur - 0.12) + "s";
  }

  // update prevObstacleRight each frame
  prevObstacleRight = obsRect.right;
}

/* game over handling */
function onGameOver() {
  if (!gameRunning) return;
  gameRunning = false;
  gameOverEl.textContent = "Game Over!";
  audiogo.play().catch(() => {});
  audio.pause();
  obstacle.classList.remove("obstacleAni");

  // remove previous hints
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
  prevObstacleRight = Number.NEGATIVE_INFINITY;

  setTimeout(() => {
    ignoreCollisions = false;
  }, 700);

  obstacle.style.animationDuration = "";
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  obstacle.classList.add("obstacleAni");

  sheep.style.left = ""; // reset to CSS default
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
  checkScoringByPassing();
  gameLoopId = requestAnimationFrame(gameStep);
}
function runGameLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(gameStep);
}

/* start sequence */
function startGame() {
  // ensure stable sheep inline left for jump
  ensureSheepHasInlineLeft();

  // wait up to 2s for assets then start
  const deadline = Date.now() + 2000;
  const wait = () => {
    if (loadedCount >= totalAssets || Date.now() > deadline) {
      beginRun();
    } else setTimeout(wait, 120);
  };
  wait();
}
function beginRun() {
  tryPlaySound(audio);
  if (startOverlay) startOverlay.remove();

  document.querySelectorAll(".restartHint").forEach((e) => e.remove());
  restartHintAdded = false;

  // start obstacle after small settle, and set prevObstacleRight so first pass won't score prematurely
  ignoreCollisions = true;
  obstacle.classList.remove("obstacleAni");
  obstacle.style.left = "";
  void obstacle.offsetWidth;
  setTimeout(() => {
    const r = obstacle.getBoundingClientRect();
    prevObstacleRight = r.right;
    scoredForThisObstacle = false;
    obstacle.classList.add("obstacleAni");
    ignoreCollisions = false;
  }, 350);

  score = 0;
  updateScore(score);
  gameRunning = true;
  runGameLoop();
}

/* click to restart but ignore if recent pointer */
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

/* init UI */
obstacle.classList.remove("obstacleAni");
updateScore(score);

score = 0;
cross = true;

audiogo = new Audio("gameover.mp3");
audio = new Audio("music.mp3");

function tryPlaySound(a) {
  a.play()
    .then(() => console.log("audio playing"))
    .catch((err) => console.warn("audio play was blocked or failed:", err));
}

// try to play after 1s (may be blocked by autoplay policy)
setTimeout(() => tryPlaySound(audio), 1000);

// ensure playback on first user interaction (works around autoplay policies)
function startAudioOnUserGesture() {
  tryPlaySound(audio);
  // Also resume WebAudio context here if you used it.
  document.removeEventListener("keydown", startAudioOnUserGesture);
  document.removeEventListener("click", startAudioOnUserGesture);
  document.removeEventListener("touchstart", startAudioOnUserGesture);
}
document.addEventListener("keydown", startAudioOnUserGesture, { once: true });
document.addEventListener("click", startAudioOnUserGesture, { once: true });
document.addEventListener("touchstart", startAudioOnUserGesture, {
  once: true,
});


let musicStarted = false; // Flag to ensure it only plays once

document.onkeydown = function (e) {
  // 1. Play music on the very first key press
  if (!musicStarted) {
    audio.play().catch((error) => {
      console.log("Audio play failed:", error);
    });
    audio.loop = true;
    musicStarted = true;
  }

 
};
document.onkeydown = function (e) {
  console.log("key code is: " + e.keyCode);
  if (e.keyCode == "38") {
    sheep = document.querySelector(".sheep");
    sheep.classList.add("animateSheep");
    setTimeout(() => {
      sheep.classList.remove("animateSheep");
    }, 700);
  }
  if (e.keyCode == "39") {
    sheep = document.querySelector(".sheep");
    sheepX = parseInt(
      window.getComputedStyle(sheep, null).getPropertyValue("left")
    );
    sheep.style.left = sheepX + 112 + "px";
  }
  if (e.keyCode == "37") {
    sheep = document.querySelector(".sheep");
    sheepX = parseInt(
      window.getComputedStyle(sheep, null).getPropertyValue("left")
    );
    sheep.style.left = sheepX - 112 + "px";
  }
};

setInterval(() => {
  sheep = document.querySelector(".sheep");
  gameOver = document.querySelector(".gameOver");
  obstacle = document.querySelector(".obstacle");

  dx = parseInt(window.getComputedStyle(sheep, null).getPropertyValue("left"));
  dy = parseInt(window.getComputedStyle(sheep, null).getPropertyValue("top"));

  ox = parseInt(
    window.getComputedStyle(obstacle, null).getPropertyValue("left")
  );
  oy = parseInt(
    window.getComputedStyle(obstacle, null).getPropertyValue("top")
  );

  offsetX = Math.abs(dx - ox);
  offsetY = Math.abs(dy - oy);
  console.log(offsetX, offsetY);
    if (offsetX < 70 && offsetY < 100) {
        gameOver.innerHTML = "Game Over!";
        obstacle.classList.remove("obstacleAni");
        audiogo.play();
        audio.pause();
    }
    else if(offsetX < 150 && cross){
        score += 1;
        updateScore(score);
        cross = false;
        setTimeout(() => {
            cross = true;
        }, 1000);
        setTimeout(() => {
            aniDur = parseFloat(
              window
                .getComputedStyle(obstacle, null)
                .getPropertyValue("animation-duration")
            );
            newDur = aniDur - 0.2;
            obstacle.style.animationDuration = newDur + "s";
            console.log("New animation duration: ", newDur);
        }, 500);
        
    }
   
}, 100);

function updateScore(score) {
  scoreCont.innerHTML = "Your Score: " + score;
}
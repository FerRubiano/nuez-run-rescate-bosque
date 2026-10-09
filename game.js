
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const mainMenu = document.getElementById("mainMenu");
const instructionsPanel = document.getElementById("instructionsPanel");
const gamePanel = document.getElementById("gamePanel");
const resultPanel = document.getElementById("resultPanel");

const playButton = document.getElementById("playButton");
const instructionsButton = document.getElementById("instructionsButton");
const backButton = document.getElementById("backButton");
const restartButton = document.getElementById("restartButton");
const menuButton = document.getElementById("menuButton");

const scoreElement = document.getElementById("score");
const timeElement = document.getElementById("time");
const livesElement = document.getElementById("lives");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const finalScoreElement = document.getElementById("finalScore");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND = 365;

let player;
let acorns = [];
let obstacles = [];
let particles = [];
let score = 0;
let lives = 3;
let timeLeft = 60;
let gameOver = false;
let gameWon = false;
let gameRunning = false;
let animationId = null;
let timerId = null;
let frame = 0;
let jumpCount = 0;
let spaceHeld = false;
let lastHit = 0;
let holdJumpTimer = null;

function showOnly(panel) {
  mainMenu.hidden = panel !== mainMenu;
  instructionsPanel.hidden = panel !== instructionsPanel;
  gamePanel.hidden = panel !== gamePanel;
  resultPanel.hidden = panel !== resultPanel;
}

function showMenu() {
  stopGame();
  showOnly(mainMenu);
}

function showInstructions() {
  stopGame();
  showOnly(instructionsPanel);
}

function stopGame() {
  gameRunning = false;
  gameOver = true;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  if (holdJumpTimer !== null) {
    clearTimeout(holdJumpTimer);
    holdJumpTimer = null;
  }

  spaceHeld = false;
}

function startGame() {
  stopGame();

  player = {
    x: 95,
    y: GROUND - 38,
    width: 36,
    height: 38,
    velocityY: 0,
    gravity: 0.65,
    jumpPower: -12,
    onGround: true
  };

  acorns = [];
  obstacles = [];
  particles = [];
  score = 0;
  lives = 3;
  timeLeft = 60;
  frame = 0;
  jumpCount = 0;
  lastHit = 0;
  gameWon = false;
  gameOver = false;
  gameRunning = true;

  updateHUD();
  showOnly(gamePanel);

  animationId = requestAnimationFrame(gameLoop);

  timerId = setInterval(() => {
    if (!gameRunning || gameOver) return;

    timeLeft--;
    updateHUD();

    if (timeLeft <= 0) {
      finishGame(true, "¡Se acabó el tiempo!");
    }
  }, 1000);
}

function updateHUD() {
  scoreElement.textContent = score;
  timeElement.textContent = timeLeft;
  livesElement.textContent = lives;
}

function jump() {
  if (!gameRunning || gameOver) return;

  if (player.onGround) {
    player.velocityY = player.jumpPower;
    player.onGround = false;
    jumpCount = 1;
  } else if (jumpCount < 2) {
    player.velocityY = player.jumpPower * 0.9;
    jumpCount = 2;
  }
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && gameRunning && !gameOver) {
    event.preventDefault();

    if (!spaceHeld) {
      spaceHeld = true;
      jump();

      holdJumpTimer = setTimeout(() => {
        if (spaceHeld && gameRunning && !gameOver &&
            !player.onGround && jumpCount < 2) {
          jump();
        }
      }, 220);
    }
  }

  if (event.code === "Enter" && gameOver &&
      !resultPanel.hidden) {
    startGame();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spaceHeld = false;

    if (holdJumpTimer !== null) {
      clearTimeout(holdJumpTimer);
      holdJumpTimer = null;
    }
  }
});

window.addEventListener("blur", () => {
  spaceHeld = false;

  if (holdJumpTimer !== null) {
    clearTimeout(holdJumpTimer);
    holdJumpTimer = null;
  }
});

function spawnItems() {
  if (frame % 85 === 0) {
    acorns.push({
      x: WIDTH + 20,
      y: GROUND - 35 - Math.random() * 95,
      width: 25,
      height: 25,
      collected: false
    });
  }

  if (frame % 125 === 0) {
    obstacles.push({
      x: WIDTH + 20,
      y: GROUND - 29,
      width: 35,
      height: 29,
      hit: false
    });
  }
}

function overlaps(a, b) {
  return (
    a.x + 7 < b.x + b.width &&
    a.x + a.width - 7 > b.x &&
    a.y + 5 < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function updateGame() {
  frame++;

  const speed = 4 + Math.min(score / 100, 3);

  player.velocityY += player.gravity;
  player.y += player.velocityY;

  if (player.y + player.height >= GROUND) {
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.onGround = true;
    jumpCount = 0;
  } else {
    player.onGround = false;
  }

  spawnItems();

  acorns.forEach((acorn) => {
    acorn.x -= speed;

    const box = {
      x: acorn.x,
      y: acorn.y,
      width: acorn.width,
      height: acorn.height
    };

    if (!acorn.collected && overlaps(player, box)) {
      acorn.collected = true;
      score += 10;
      updateHUD();

      particles.push({
        x: acorn.x,
        y: acorn.y,
        life: 30,
        text: "+10"
      });
    }
  });

  acorns = acorns.filter(
    (acorn) => acorn.x > -40 && !acorn.collected
  );

  obstacles.forEach((obstacle) => {
    obstacle.x -= speed;

    if (!obstacle.hit && overlaps(player, obstacle)) {
      obstacle.hit = true;
      lives--;
      updateHUD();
      player.velocityY = -5;

      if (lives <= 0) {
        finishGame(false, "¡Nuez necesita descansar!");
      }
    }
  });

  obstacles = obstacles.filter(
    (obstacle) => obstacle.x > -60
  );

  particles.forEach((particle) => {
    particle.y -= 1;
    particle.life--;
  });

  particles = particles.filter(
    (particle) => particle.life > 0
  );
}

function drawBackground() {
  ctx.fillStyle = "#f8e8c7";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#f6c85f";
  ctx.beginPath();
  ctx.arc(700, 75, 35, 0, Math.PI * 2);
  ctx.fill();

  for (let x = 20; x < WIDTH; x += 125) {
    ctx.fillStyle = "#986b45";
    ctx.fillRect(x + 25, 175, 15, GROUND - 175);

    ctx.fillStyle = "#d58b48";
    ctx.beginPath();
    ctx.arc(x + 32, 165, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#b76b3d";
    ctx.beginPath();
    ctx.arc(x + 10, 180, 25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#b9824d";
  ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);

  ctx.fillStyle = "#6f9c54";
  ctx.fillRect(0, GROUND, WIDTH, 9);

  ctx.font = "17px Arial";

  for (let x = 15; x < WIDTH; x += 75) {
    ctx.fillText("🍂", x, GROUND + 38);
  }
}

function drawPlayer() {
  ctx.font = "36px Arial";
  ctx.fillText("🐿️", player.x, player.y + 34);
}

function drawAcorns() {
  acorns.forEach((acorn) => {
    if (!acorn.collected) {
      ctx.font = "25px Arial";
      ctx.fillText("🌰", acorn.x, acorn.y + 24);
    }
  });
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    ctx.font = "32px Arial";
    ctx.fillText("🪵", obstacle.x, obstacle.y + 28);
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.fillStyle = "#276749";
    ctx.font = "bold 17px Arial";
    ctx.fillText(particle.text, particle.x, particle.y);
  });
}

function drawInstructions() {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(12, 12, 245, 34);

  ctx.fillStyle = "#50391f";
  ctx.font = "14px Arial";
  ctx.fillText("ESPACIO: saltar / doble salto", 22, 34);
}

function draw() {
  drawBackground();
  drawAcorns();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawInstructions();
}

function finishGame(won, message) {
  if (gameOver) return;

  gameOver = true;
  gameWon = won;
  gameRunning = false;

  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  if (holdJumpTimer !== null) {
    clearTimeout(holdJumpTimer);
    holdJumpTimer = null;
  }

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  resultTitle.textContent = won
    ? "¡Bosque rescatado!"
    : "Fin de la aventura";

  resultMessage.textContent = message;
  finalScoreElement.textContent = score;

  showOnly(resultPanel);
}

function gameLoop() {
  if (!gameRunning || gameOver) return;

  updateGame();

  if (!gameOver) {
    draw();
    animationId = requestAnimationFrame(gameLoop);
  }
}

playButton.addEventListener("click", startGame);
instructionsButton.addEventListener("click", showInstructions);
backButton.addEventListener("click", showMenu);
restartButton.addEventListener("click", startGame);
menuButton.addEventListener("click", showMenu);

// Al abrir el proyecto, mostrar el menú sin iniciar el temporizador.
showOnly(mainMenu);

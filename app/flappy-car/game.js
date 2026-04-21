/* ===== Flappy Car Game Logic ===== */

const FLAPPY_CAR_STORAGE_KEY = 'flappy_car_high_score';

// Game constants
const GRAVITY = 0.5;
const JUMP_STRENGTH = -12;
const PIPE_WIDTH = 60;
const PIPE_GAP = 120;
const PIPE_SPEED = 5;
const PIPE_SPAWN_RATE = 80; // frames between pipe spawns

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let gameState = {
  running: false,
  paused: false,
  gameStarted: false,
  score: 0,
  bestScore: 0,
  
  // Car properties
  car: {
    x: 50,
    y: canvas.height / 2,
    width: 30,
    height: 30,
    velocityY: 0
  },

  // Pipes
  pipes: [],
  frameCount: 0,

  // Appearance
  colors: {
    bg: '#1a1a1a',
    car: '#f39c12',
    pipe: '#27ae60',
    text: '#e0e0e0'
  }
};

/**
 * Initialize game
 */
function initGame() {
  gameState.score = 0;
  gameState.car.y = canvas.height / 2;
  gameState.car.velocityY = 0;
  gameState.pipes = [];
  gameState.frameCount = 0;
  gameState.running = true;
  gameState.paused = false;
  gameState.gameStarted = true;

  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('pauseBtn').style.display = 'inline-block';

  // Load best score
  const best = loadData(FLAPPY_CAR_STORAGE_KEY, 0);
  gameState.bestScore = best;
  document.getElementById('bestStat').textContent = best;
  document.getElementById('bestScore').textContent = best;

  gameLoop();
}

/**
 * Start game
 */
function startGame() {
  initGame();
}

/**
 * Toggle pause
 */
function togglePause() {
  gameState.paused = !gameState.paused;
  const pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.textContent = gameState.paused ? 'Продовжити' : 'Пауза';

  if (!gameState.paused) {
    gameLoop();
  }
}

/**
 * End game
 */
function endGame() {
  gameState.running = false;
  gameState.gameStarted = false;

  // Update best score
  if (gameState.score > gameState.bestScore) {
    gameState.bestScore = gameState.score;
    saveData(FLAPPY_CAR_STORAGE_KEY, gameState.bestScore);
    document.getElementById('bestStat').textContent = gameState.bestScore;
    document.getElementById('bestScore').textContent = gameState.bestScore;
  }

  document.getElementById('startBtn').style.display = 'inline-block';
  document.getElementById('pauseBtn').style.display = 'none';
  document.getElementById('gameStat').textContent = gameState.score;

  // Draw game over screen
  drawGameOver();
}

/**
 * Draw game over screen
 */
function drawGameOver() {
  const width = canvas.width;
  const height = canvas.height;

  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, width, height);

  // Game over text
  ctx.fillStyle = '#f39c12';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ГАМА СКІНЧЕНА', width / 2, height / 2 - 40);

  ctx.fillStyle = '#e0e0e0';
  ctx.font = '24px Arial';
  ctx.fillText(`Очки: ${gameState.score}`, width / 2, height / 2 + 20);
  ctx.fillText(`Рекорд: ${gameState.bestScore}`, width / 2, height / 2 + 60);

  ctx.font = '16px Arial';
  ctx.fillStyle = '#a0a0a0';
  ctx.fillText('Натисніть «Почати гру» для нової гри', width / 2, height - 50);
}

/**
 * Update game state
 */
function update() {
  if (gameState.paused || !gameState.running) return;

  // Apply gravity
  gameState.car.velocityY += GRAVITY;
  gameState.car.y += gameState.car.velocityY;

  // Check bounds (ceiling and floor)
  if (gameState.car.y < 0) {
    gameState.car.y = 0;
    gameState.car.velocityY = 0;
  }

  if (gameState.car.y + gameState.car.height > canvas.height) {
    endGame();
    return;
  }

  // Spawn new pipes
  gameState.frameCount++;
  if (gameState.frameCount % PIPE_SPAWN_RATE === 0) {
    spawnPipe();
  }

  // Update pipes
  for (let i = gameState.pipes.length - 1; i >= 0; i--) {
    const pipe = gameState.pipes[i];
    pipe.x -= PIPE_SPEED;

    // Remove off-screen pipes
    if (pipe.x + PIPE_WIDTH < 0) {
      gameState.pipes.splice(i, 1);
      continue;
    }

    // Check collision
    if (checkCollision(gameState.car, pipe.topPipe) || 
        checkCollision(gameState.car, pipe.bottomPipe)) {
      endGame();
      return;
    }

    // Increment score when car passes pipe
    if (pipe.x + PIPE_WIDTH < gameState.car.x && !pipe.scored) {
      pipe.scored = true;
      gameState.score++;
      document.getElementById('currentScore').textContent = gameState.score;
      document.getElementById('gameStat').textContent = gameState.score;
    }
  }
}

/**
 * Spawn pipe
 */
function spawnPipe() {
  const gapStart = Math.random() * (canvas.height - PIPE_GAP - 100) + 50;

  gameState.pipes.push({
    x: canvas.width,
    topPipe: {
      x: canvas.width,
      y: 0,
      width: PIPE_WIDTH,
      height: gapStart
    },
    bottomPipe: {
      x: canvas.width,
      y: gapStart + PIPE_GAP,
      width: PIPE_WIDTH,
      height: canvas.height - (gapStart + PIPE_GAP)
    },
    scored: false
  });
}

/**
 * Check collision between car and pipe
 * @param {Object} car - Car object
 * @param {Object} pipe - Pipe object
 * @returns {boolean} True if collision detected
 */
function checkCollision(car, pipe) {
  return car.x < pipe.x + pipe.width &&
         car.x + car.width > pipe.x &&
         car.y < pipe.y + pipe.height &&
         car.y + car.height > pipe.y;
}

/**
 * Draw everything
 */
function draw() {
  // Clear canvas
  ctx.fillStyle = gameState.colors.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw pipes
  ctx.fillStyle = gameState.colors.pipe;
  gameState.pipes.forEach(pipe => {
    ctx.fillRect(pipe.topPipe.x, pipe.topPipe.y, pipe.topPipe.width, pipe.topPipe.height);
    ctx.fillRect(pipe.bottomPipe.x, pipe.bottomPipe.y, pipe.bottomPipe.width, pipe.bottomPipe.height);
  });

  // Draw car
  ctx.fillStyle = gameState.colors.car;
  ctx.fillRect(gameState.car.x, gameState.car.y, gameState.car.width, gameState.car.height);

  // Draw score
  ctx.fillStyle = gameState.colors.text;
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Очки: ${gameState.score}`, 10, 30);

  // Draw pause indicator
  if (gameState.paused && gameState.gameStarted) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gameState.colors.car;
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ПАУЗА', canvas.width / 2, canvas.height / 2);
  }
}

/**
 * Game loop
 */
function gameLoop() {
  if (!gameState.gameStarted) return;

  update();
  draw();

  if (gameState.running) {
    requestAnimationFrame(gameLoop);
  }
}

/**
 * Handle jump/flap
 */
function jump() {
  if (gameState.running && !gameState.paused) {
    gameState.car.velocityY = JUMP_STRENGTH;
  }
}

// ===== Event Listeners =====

document.addEventListener('DOMContentLoaded', function() {
  // Setup back button
  setupBackButton(goToHome);

  // Load best score on page load
  const best = loadData(FLAPPY_CAR_STORAGE_KEY, 0);
  gameState.bestScore = best;
  document.getElementById('bestScore').textContent = best;
  document.getElementById('bestStat').textContent = best;

  // Click/Tap to jump
  canvas.addEventListener('click', jump);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      jump();
    }
  });

  // Touch support for mobile
  document.addEventListener('touchstart', (e) => {
    if (e.target === canvas) {
      e.preventDefault();
      jump();
    }
  });
});

// Initial draw
draw();

/* ===== Flappy Car Game Logic ===== */

const FLAPPY_CAR_STORAGE_KEY = 'flappy_car_high_score';

// Game constants
const GRAVITY = 0.36;
const JUMP_STRENGTH = -9.8;
const OBSTACLE_WIDTH = 72;
const OBSTACLE_GAP = 225;
const OBSTACLE_SPEED = 3.3;
const OBSTACLE_SPAWN_RATE = 105; // frames between spawns
const SAFE_MARGIN = 95;
const BASE_FRAME_MS = 1000 / 60;
const GAME_KEY = 'flappy_car';
const LEADERBOARD_LIMIT = 5;

const EASY_GAP_SIZE = 252;
const HARD_GAP_SIZE = 208;
const EASY_OBSTACLE_SPEED = 2.62;
const HARD_OBSTACLE_SPEED = 3.72;
const EASY_SPAWN_RATE = 122;
const HARD_SPAWN_RATE = 94;
const MID_SCORE_THRESHOLD = 7;
const RAMP_START_SCORE = 10;
const MID_GAP_SIZE = 238;
const MID_OBSTACLE_SPEED = 2.92;
const MID_SPAWN_RATE = 114;
const DIFFICULTY_RAMP_SPAN = 35;

// Canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/**
 * Toggle gameplay-only layout mode.
 * @param {boolean} enabled - Whether gameplay mode is active
 */
function setGameplayMode(enabled) {
  document.body.classList.toggle('gameplay-mode', enabled);
}

/**
 * Show or hide overlay by id.
 * @param {string} id - Overlay element id
 * @param {boolean} visible - Visibility state
 */
function setOverlayVisibility(id, visible) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.toggle('show', visible);
}

/**
 * Render leaderboard rows into result screen.
 * @param {Array<{username?:string,first_name?:string,score:number}>} scores - Top score rows
 */
function renderLeaderboard(scores) {
  const leaderboardList = document.getElementById('leaderboardList');
  if (!leaderboardList) {
    return;
  }

  leaderboardList.innerHTML = '';

  if (!scores || scores.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'leaderboard-empty';
    emptyRow.textContent = 'Ще немає результатів';
    leaderboardList.appendChild(emptyRow);
    return;
  }

  scores.forEach((entry, index) => {
    const item = document.createElement('li');
    const name = entry.first_name || entry.username || 'Гравець';
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[index] ? `${medals[index]} ` : '';
    item.textContent = `${medal}${name} - ${entry.score}`;
    leaderboardList.appendChild(item);
  });
}

/**
 * Show trophy row for top-3 places.
 * @param {number|null} place - Current user place in leaderboard
 */
function renderResultTrophy(place) {
  const row = document.getElementById('resultTrophyRow');
  const icon = document.getElementById('resultTrophyIcon');
  const text = document.getElementById('resultTrophyText');

  if (!row || !icon || !text) {
    return;
  }

  row.classList.remove('trophy-gold', 'trophy-silver', 'trophy-bronze');

  if (place !== 1 && place !== 2 && place !== 3) {
    row.hidden = true;
    return;
  }

  const trophyByPlace = {
    1: {
      className: 'trophy-gold',
      label: 'Золотий кубок',
      icon: '🏆'
    },
    2: {
      className: 'trophy-silver',
      label: 'Срібний кубок',
      icon: '🏆'
    },
    3: {
      className: 'trophy-bronze',
      label: 'Бронзовий кубок',
      icon: '🏆'
    }
  };

  const trophy = trophyByPlace[place];
  row.classList.add(trophy.className);
  icon.textContent = trophy.icon;
  text.textContent = `${trophy.label} - ${place} місце!`;
  row.hidden = false;
}

/**
 * Resolve current user place by id in top scores list.
 * @param {Array<{user_id?:number|string}>} scores - Leaderboard rows
 * @returns {number|null} 1-based place or null
 */
function getCurrentUserPlace(scores) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId || !Array.isArray(scores)) {
    return null;
  }

  const index = scores.findIndex((entry) => String(entry.user_id) === String(userId));
  return index >= 0 ? index + 1 : null;
}

/**
 * Load score summary from backend and update result screen.
 * Falls back to local best score if backend is unavailable.
 */
async function syncScoreSummary(shouldSubmitScore = false) {
  const resultBest = document.getElementById('resultBest');
  const resultGlobalBest = document.getElementById('resultGlobalBest');

  renderResultTrophy(null);

  if (resultBest) {
    resultBest.textContent = String(gameState.bestScore);
  }
  if (resultGlobalBest) {
    resultGlobalBest.textContent = String(gameState.bestScore);
  }

  try {
    if (typeof submitGameScore !== 'function' || typeof fetchGameScoreSummary !== 'function') {
      renderLeaderboard([]);
      return;
    }

    if (shouldSubmitScore) {
      await submitGameScore(GAME_KEY, gameState.score);
    }
    const summary = await fetchGameScoreSummary(GAME_KEY, LEADERBOARD_LIMIT);

    if (!summary || !summary.ok) {
      return;
    }

    if (resultBest && Number.isFinite(summary.user_best)) {
      resultBest.textContent = String(summary.user_best);
    }

    if (resultGlobalBest && Number.isFinite(summary.global_best)) {
      resultGlobalBest.textContent = String(summary.global_best);
    }

    const topScores = Array.isArray(summary.top_scores) ? summary.top_scores : [];
    renderLeaderboard(topScores);
    renderResultTrophy(getCurrentUserPlace(topScores));
  } catch (error) {
    console.warn('Score sync failed:', error);
  }
}

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
  obstacles: [],
  frameCount: 0,
  spawnTimer: 0,
  lastTimestamp: null,
  animationFrameId: null,

  // Appearance
  colors: {
    skyTop: '#87ceeb',
    skyBottom: '#dff6ff',
    cloud: '#ffffff',
    road: '#4f5861',
    lane: '#f6f6f6',
    coneOrange: '#f57c00',
    coneStripe: '#fff4da',
    coneBase: '#2f3640',
    carBody: '#ff4f4f',
    carWindow: '#bfe8ff',
    wing: '#f8f8f8',
    wheel: '#1b1b1b',
    text: '#1b1b1b'
  }
};

/**
 * Initialize game
 */
function initGame() {
  gameState.score = 0;
  gameState.car.y = canvas.height / 2;
  gameState.car.velocityY = 0;
  gameState.obstacles = [];
  gameState.frameCount = 0;
  gameState.spawnTimer = 0;
  gameState.lastTimestamp = null;
  gameState.running = true;
  gameState.paused = false;
  gameState.gameStarted = true;

  setOverlayVisibility('introScreen', false);
  setOverlayVisibility('resultScreen', false);
  setGameplayMode(true);

  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('pauseBtn').style.display = 'inline-block';
  document.getElementById('pauseBtn').textContent = 'Пауза';
  document.getElementById('currentScore').textContent = '0';
  document.getElementById('gameStat').textContent = '0';

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
  if (gameState.running) {
    return;
  }
  initGame();
}

/**
 * Start a new game from intro/result screen flow.
 */
function beginGameFlow() {
  startGame();
}

/**
 * Toggle pause
 */
function togglePause() {
  if (!gameState.running) {
    return;
  }

  gameState.paused = !gameState.paused;
  const pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.textContent = gameState.paused ? 'Продовжити' : 'Пауза';
}

/**
 * End game
 */
function endGame() {
  gameState.running = false;
  gameState.gameStarted = false;
  if (gameState.animationFrameId) {
    cancelAnimationFrame(gameState.animationFrameId);
    gameState.animationFrameId = null;
  }

  const shouldSubmitScore = gameState.score > gameState.bestScore;

  // Update best score
  if (shouldSubmitScore) {
    gameState.bestScore = gameState.score;
    saveData(FLAPPY_CAR_STORAGE_KEY, gameState.bestScore);
    document.getElementById('bestStat').textContent = gameState.bestScore;
    document.getElementById('bestScore').textContent = gameState.bestScore;
  }

  document.getElementById('startBtn').style.display = 'inline-block';
  document.getElementById('pauseBtn').style.display = 'none';
  document.getElementById('gameStat').textContent = gameState.score;

  const resultScore = document.getElementById('resultScore');
  if (resultScore) {
    resultScore.textContent = String(gameState.score);
  }

  void syncScoreSummary(shouldSubmitScore);

  setGameplayMode(false);
  setOverlayVisibility('resultScreen', true);

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
  ctx.fillStyle = '#ff4f4f';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ГРА СКІНЧЕНА', width / 2, height / 2 - 40);

  ctx.fillStyle = '#e0e0e0';
  ctx.font = '24px Arial';
  ctx.fillText(`Очки: ${gameState.score}`, width / 2, height / 2 + 20);
  ctx.fillText(`Рекорд: ${gameState.bestScore}`, width / 2, height / 2 + 60);

  ctx.font = '16px Arial';
  ctx.fillStyle = '#a0a0a0';
  ctx.fillText('Натисніть «Почати гру» для нової гри', width / 2, height - 50);
}

/**
 * Clamp a number to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation.
 * @param {number} from
 * @param {number} to
 * @param {number} t
 * @returns {number}
 */
function lerp(from, to, t) {
  return from + (to - from) * t;
}

/**
 * Resolve current difficulty from score.
 * First 10 points stay intentionally easy, then difficulty ramps up smoothly.
 * @param {number} score
 * @returns {{gapSize:number, obstacleSpeed:number, spawnRate:number}}
 */
function getDifficulty(score) {
  if (score < MID_SCORE_THRESHOLD) {
    return {
      gapSize: EASY_GAP_SIZE,
      obstacleSpeed: EASY_OBSTACLE_SPEED,
      spawnRate: EASY_SPAWN_RATE
    };
  }

  if (score < RAMP_START_SCORE) {
    return {
      gapSize: MID_GAP_SIZE,
      obstacleSpeed: MID_OBSTACLE_SPEED,
      spawnRate: MID_SPAWN_RATE
    };
  }

  const progress = clamp((score - RAMP_START_SCORE) / DIFFICULTY_RAMP_SPAN, 0, 1);
  return {
    gapSize: Math.round(lerp(MID_GAP_SIZE, HARD_GAP_SIZE, progress)),
    obstacleSpeed: lerp(MID_OBSTACLE_SPEED, HARD_OBSTACLE_SPEED, progress),
    spawnRate: lerp(MID_SPAWN_RATE, HARD_SPAWN_RATE, progress)
  };
}

/**
 * Determine if point is inside rectangle.
 * @param {number} px
 * @param {number} py
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @returns {boolean}
 */
function isPointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * Determine if point lies inside triangle using sign method.
 * @param {number} px
 * @param {number} py
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {{x:number,y:number}} c
 * @returns {boolean}
 */
function isPointInTriangle(px, py, a, b, c) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

/**
 * Get representative points of car hitbox for triangle intersection checks.
 * @param {{x:number,y:number,width:number,height:number}} carHitBox
 * @returns {Array<{x:number,y:number}>}
 */
function getCarHitPoints(carHitBox) {
  const left = carHitBox.x;
  const right = carHitBox.x + carHitBox.width;
  const top = carHitBox.y;
  const bottom = carHitBox.y + carHitBox.height;
  const centerX = left + carHitBox.width / 2;
  const centerY = top + carHitBox.height / 2;

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: centerX, y: top },
    { x: centerX, y: bottom },
    { x: left, y: centerY },
    { x: right, y: centerY },
    { x: centerX, y: centerY }
  ];
}

/**
 * Cone-accurate collision check against one obstacle.
 * @param {{x:number,y:number,width:number,height:number}} carHitBox
 * @param {{x:number,gapStart:number,gapSize?:number}} obstacle
 * @returns {boolean}
 */
function isCollidingWithConeObstacle(carHitBox, obstacle) {
  const gapSize = obstacle.gapSize || OBSTACLE_GAP;
  const topConeHeight = obstacle.gapStart;
  const bottomConeY = obstacle.gapStart + gapSize;

  const broadLeft = obstacle.x - 5;
  const broadRight = obstacle.x + OBSTACLE_WIDTH + 5;
  if (carHitBox.x > broadRight || carHitBox.x + carHitBox.width < broadLeft) {
    return false;
  }

  const topBaseRect = {
    x: obstacle.x - 5,
    y: 0,
    width: OBSTACLE_WIDTH + 10,
    height: 12
  };

  const bottomBaseRect = {
    x: obstacle.x - 5,
    y: canvas.height - 12,
    width: OBSTACLE_WIDTH + 10,
    height: 12
  };

  if (checkCollision(carHitBox, topBaseRect) || checkCollision(carHitBox, bottomBaseRect)) {
    return true;
  }

  const topTriangle = {
    a: { x: obstacle.x + OBSTACLE_WIDTH / 2, y: topConeHeight },
    b: { x: obstacle.x, y: 0 },
    c: { x: obstacle.x + OBSTACLE_WIDTH, y: 0 }
  };

  const bottomTriangle = {
    a: { x: obstacle.x + OBSTACLE_WIDTH / 2, y: bottomConeY },
    b: { x: obstacle.x, y: canvas.height },
    c: { x: obstacle.x + OBSTACLE_WIDTH, y: canvas.height }
  };

  const carPoints = getCarHitPoints(carHitBox);
  for (const point of carPoints) {
    if (isPointInTriangle(point.x, point.y, topTriangle.a, topTriangle.b, topTriangle.c) ||
        isPointInTriangle(point.x, point.y, bottomTriangle.a, bottomTriangle.b, bottomTriangle.c)) {
      return true;
    }
  }

  if (isPointInRect(topTriangle.a.x, topTriangle.a.y, carHitBox) ||
      isPointInRect(bottomTriangle.a.x, bottomTriangle.a.y, carHitBox)) {
    return true;
  }

  return false;
}

/**
 * Update game state
 */
function update(deltaFrames) {
  if (gameState.paused || !gameState.running) return;

  const carHitBox = getCarHitBox(gameState.car);
  const difficulty = getDifficulty(gameState.score);

  // Apply gravity
  gameState.car.velocityY += GRAVITY * deltaFrames;
  gameState.car.y += gameState.car.velocityY * deltaFrames;

  // Check bounds (ceiling and floor)
  if (gameState.car.y < 0) {
    gameState.car.y = 0;
    gameState.car.velocityY = 0;
  }

  if (gameState.car.y + gameState.car.height > canvas.height) {
    endGame();
    return;
  }

  // Spawn new cone obstacles
  gameState.frameCount += deltaFrames;
  gameState.spawnTimer += deltaFrames;
  while (gameState.spawnTimer >= difficulty.spawnRate) {
    spawnObstacle();
    gameState.spawnTimer -= difficulty.spawnRate;
  }

  // Update obstacles
  for (let i = gameState.obstacles.length - 1; i >= 0; i--) {
    const obstacle = gameState.obstacles[i];
    obstacle.x -= difficulty.obstacleSpeed * deltaFrames;

    // Remove off-screen obstacles
    if (obstacle.x + OBSTACLE_WIDTH < 0) {
      gameState.obstacles.splice(i, 1);
      continue;
    }

    if (isCollidingWithConeObstacle(carHitBox, obstacle)) {
      endGame();
      return;
    }

    // Increment score when car passes obstacle
    if (obstacle.x + OBSTACLE_WIDTH < gameState.car.x && !obstacle.scored) {
      obstacle.scored = true;
      gameState.score++;
      document.getElementById('currentScore').textContent = gameState.score;
      document.getElementById('gameStat').textContent = gameState.score;
    }
  }
}

/**
 * Spawn obstacle
 */
function spawnObstacle() {
  const difficulty = getDifficulty(gameState.score);
  const gapSize = difficulty.gapSize;
  const gapStart = Math.random() * (canvas.height - gapSize - SAFE_MARGIN * 2) + SAFE_MARGIN;

  gameState.obstacles.push({
    x: canvas.width,
    gapStart,
    gapSize,
    scored: false
  });
}

/**
 * Build collision rectangles from one obstacle.
 * @param {{x:number,gapStart:number}} obstacle - Obstacle descriptor
 * @returns {{top: {x:number,y:number,width:number,height:number}, bottom: {x:number,y:number,width:number,height:number}}}
 */
function getObstacleHitBoxes(obstacle) {
  const gapSize = obstacle.gapSize || OBSTACLE_GAP;

  return {
    top: {
      x: obstacle.x,
      y: 0,
      width: OBSTACLE_WIDTH,
      height: obstacle.gapStart
    },
    bottom: {
      x: obstacle.x,
      y: obstacle.gapStart + gapSize,
      width: OBSTACLE_WIDTH,
      height: canvas.height - (obstacle.gapStart + gapSize)
    }
  };
}

/**
 * Build a slightly smaller car hitbox to make collisions less punishing.
 * @param {{x:number,y:number,width:number,height:number}} car - Car descriptor
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function getCarHitBox(car) {
  const paddingX = 7;
  const paddingTop = 8;
  const paddingBottom = 6;

  return {
    x: car.x + paddingX,
    y: car.y + paddingTop,
    width: car.width - paddingX * 2,
    height: car.height - paddingTop - paddingBottom
  };
}

/**
 * Draw a stripe band that follows triangle cone geometry.
 * @param {number} x - Cone left X
 * @param {number} y1 - Stripe start Y
 * @param {number} y2 - Stripe end Y
 * @param {(y:number)=>number} getHalfWidthAtY - Returns half-width for a Y point
 */
function drawConeStripeBand(x, y1, y2, getHalfWidthAtY) {
  const centerX = x + OBSTACLE_WIDTH / 2;
  const hw1 = Math.max(0, getHalfWidthAtY(y1));
  const hw2 = Math.max(0, getHalfWidthAtY(y2));

  if (hw1 < 2 || hw2 < 2) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(centerX - hw1, y1);
  ctx.lineTo(centerX + hw1, y1);
  ctx.lineTo(centerX + hw2, y2);
  ctx.lineTo(centerX - hw2, y2);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a cone that points down from top.
 * @param {number} x - X position
 * @param {number} height - Cone height
 */
function drawTopCone(x, height) {
  if (height <= 0) return;

  ctx.fillStyle = gameState.colors.coneOrange;
  ctx.beginPath();
  ctx.moveTo(x + OBSTACLE_WIDTH / 2, height);
  ctx.lineTo(x, 0);
  ctx.lineTo(x + OBSTACLE_WIDTH, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = gameState.colors.coneStripe;
  const topHalfWidth = (y) => {
    const t = Math.min(Math.max(y / height, 0), 1);
    return (OBSTACLE_WIDTH / 2) * (1 - t);
  };
  drawConeStripeBand(x, height * 0.24, height * 0.32, topHalfWidth);
  drawConeStripeBand(x, height * 0.44, height * 0.53, topHalfWidth);

  ctx.fillStyle = gameState.colors.coneBase;
  ctx.fillRect(x - 5, 0, OBSTACLE_WIDTH + 10, 12);
}

/**
 * Draw a cone that points up from bottom.
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} height - Cone height
 */
function drawBottomCone(x, y, height) {
  if (height <= 0) return;

  ctx.fillStyle = gameState.colors.coneOrange;
  ctx.beginPath();
  ctx.moveTo(x + OBSTACLE_WIDTH / 2, y);
  ctx.lineTo(x, canvas.height);
  ctx.lineTo(x + OBSTACLE_WIDTH, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = gameState.colors.coneStripe;
  const bottomHalfWidth = (yy) => {
    const t = Math.min(Math.max((yy - y) / height, 0), 1);
    return (OBSTACLE_WIDTH / 2) * t;
  };
  drawConeStripeBand(x, y + height * 0.46, y + height * 0.55, bottomHalfWidth);
  drawConeStripeBand(x, y + height * 0.66, y + height * 0.75, bottomHalfWidth);

  ctx.fillStyle = gameState.colors.coneBase;
  ctx.fillRect(x - 5, canvas.height - 12, OBSTACLE_WIDTH + 10, 12);
}

/**
 * Draw cartoon winged car.
 */
function drawWingedCar() {
  const { x, y, width, height, velocityY } = gameState.car;
  const flapPhase = Math.sin(gameState.frameCount * 0.35);
  const wingLift = flapPhase * 7;

  // Wings
  ctx.fillStyle = gameState.colors.wing;
  ctx.beginPath();
  ctx.moveTo(x + 7, y + height * 0.45);
  ctx.quadraticCurveTo(x - 20, y + height * 0.1 + wingLift, x + 4, y + height * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + width - 7, y + height * 0.45);
  ctx.quadraticCurveTo(x + width + 20, y + height * 0.1 - wingLift, x + width - 4, y + height * 0.8);
  ctx.closePath();
  ctx.fill();

  // Car body
  ctx.fillStyle = gameState.colors.carBody;
  const bodyRadius = 9;
  ctx.beginPath();
  ctx.moveTo(x + bodyRadius, y + 7);
  ctx.lineTo(x + width - bodyRadius, y + 7);
  ctx.quadraticCurveTo(x + width, y + 7, x + width, y + 7 + bodyRadius);
  ctx.lineTo(x + width, y + height - 5);
  ctx.lineTo(x, y + height - 5);
  ctx.lineTo(x, y + 7 + bodyRadius);
  ctx.quadraticCurveTo(x, y + 7, x + bodyRadius, y + 7);
  ctx.closePath();
  ctx.fill();

  // Window
  ctx.fillStyle = gameState.colors.carWindow;
  ctx.fillRect(x + 8, y + 11, width - 16, 9);

  // Spoiler
  ctx.fillStyle = '#d63838';
  ctx.fillRect(x + width - 6, y + 6, 10, 4);

  // Wheels
  ctx.fillStyle = gameState.colors.wheel;
  ctx.beginPath();
  ctx.arc(x + 8, y + height - 1, 4, 0, Math.PI * 2);
  ctx.arc(x + width - 8, y + height - 1, 4, 0, Math.PI * 2);
  ctx.fill();

  // Small eye for cartoon feel
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + width - 12, y + 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x + width - 12, y + 16, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Tilt hint based on vertical speed
  if (Math.abs(velocityY) > 0.7) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y + height + 6);
    ctx.lineTo(x + width / 2 - velocityY * 0.7, y + height + 11);
    ctx.stroke();
  }
}

/**
 * Draw stylized road background.
 */
function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, gameState.colors.skyTop);
  gradient.addColorStop(1, gameState.colors.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(85, 90, 35, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(115, 90, 27, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(260, 135, 40, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(295, 135, 25, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = gameState.colors.road;
  ctx.fillRect(0, canvas.height - 28, canvas.width, 28);

  ctx.fillStyle = gameState.colors.lane;
  const laneOffset = (gameState.frameCount * OBSTACLE_SPEED) % 34;
  for (let x = -34 + laneOffset; x < canvas.width; x += 34) {
    ctx.fillRect(x, canvas.height - 16, 18, 4);
  }
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
  drawBackground();

  // Draw cone obstacles
  gameState.obstacles.forEach(obstacle => {
    const topHeight = obstacle.gapStart;
    const gapSize = obstacle.gapSize || OBSTACLE_GAP;
    const bottomY = obstacle.gapStart + gapSize;
    const bottomHeight = canvas.height - bottomY;

    drawTopCone(obstacle.x, topHeight);
    drawBottomCone(obstacle.x, bottomY, bottomHeight);
  });

  drawWingedCar();

  // Draw score
  ctx.fillStyle = gameState.colors.text;
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Очки: ${gameState.score}`, 10, 30);

  // Draw pause indicator
  if (gameState.paused && gameState.gameStarted) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ПАУЗА', canvas.width / 2, canvas.height / 2);
  }
}

/**
 * Game loop
 */
function gameLoop(timestamp = performance.now()) {
  if (!gameState.gameStarted) return;

  if (gameState.lastTimestamp === null) {
    gameState.lastTimestamp = timestamp;
  }

  const deltaMs = timestamp - gameState.lastTimestamp;
  gameState.lastTimestamp = timestamp;
  const deltaFrames = Math.min(Math.max(deltaMs / BASE_FRAME_MS, 0.5), 2.5);

  update(deltaFrames);
  draw();

  if (gameState.running) {
    gameState.animationFrameId = requestAnimationFrame(gameLoop);
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

  const resultBest = document.getElementById('resultBest');
  if (resultBest) {
    resultBest.textContent = String(best);
  }

  // Expose starter function for inline buttons.
  window.beginGameFlow = beginGameFlow;

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

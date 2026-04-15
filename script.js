const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Responsive canvas ---
const BASE_W = 900, BASE_H = 300;
canvas.width = BASE_W;
canvas.height = BASE_H;

// --- Game state ---
let state = 'menu';
let score = 0;
let highScore = 0;
let lives = 3;
let level = 1;
let frame = 0;
let speed = 5;
let animId;
let bgTransitionProgress = 0;
let bgTransitioning = false;
let levelUpTimer = 0;

// --- Level config ---
const levelColors = [
  { sky: ['#1a1a2e','#16213e'], ground: '#0f3460', accent: '#00ffcc', player: '#00ffcc', star: '#ffffff' },
  { sky: ['#2d1b69','#11998e'], ground: '#1a0533', accent: '#ff6b6b', player: '#ff6b6b', star: '#ffd700' },
  { sky: ['#000428','#004e92'], ground: '#001f3f', accent: '#00b4d8', player: '#90e0ef', star: '#caf0f8' },
  { sky: ['#360033','#0b8793'], ground: '#1a0010', accent: '#ff00aa', player: '#ff77cc', star: '#ffccee' },
  { sky: ['#0f0c29','#302b63'], ground: '#0a0a1a', accent: '#ffd700', player: '#ffd700', star: '#fff5cc' },
  { sky: ['#1f4037','#99f2c8'], ground: '#0d2b1f', accent: '#39ff14', player: '#39ff14', star: '#ccffcc' },
  { sky: ['#8e0e00','#1f1c18'], ground: '#3d0000', accent: '#ff4500', player: '#ff6622', star: '#ffaa88' },
  { sky: ['#005c97','#363795'], ground: '#002244', accent: '#7b2ff7', player: '#bb77ff', star: '#ddccff' },
];

function getLevelConfig(lvl) {
  return levelColors[(lvl - 1) % levelColors.length];
}

let currentColors = getLevelConfig(1);
let nextColors = null;

// --- Player ---
const GROUND_Y = BASE_H - 50;
const PLAYER_SIZE = 32;

let player = {
  x: 120,
  y: GROUND_Y - PLAYER_SIZE,
  vy: 0,
  onGround: false,
  jumpsLeft: 2,
  rotation: 0,
  trail: [],
  invincible: 0,
  squish: 1,
};

const GRAVITY = 0.55;
const JUMP_FORCE = -13;

// --- Obstacles ---
let obstacles = [];
let obstacleCooldown = 0;

// --- Particles ---
let particles = [];

// --- Stars / BG elements ---
let stars = [];
for (let i = 0; i < 60; i++) {
  stars.push({
    x: Math.random() * BASE_W,
    y: Math.random() * (BASE_H - 60),
    r: Math.random() * 2 + 0.5,
    speed: Math.random() * 0.5 + 0.2
  });
}

// --- Coins ---
let coins = [];
let coinCooldown = 0;

// --- Score threshold per level ---
function scoreForLevel(lvl) {
  return lvl * 800;
}

// --- Obstacle spawner ---
function spawnObstacle() {
  const available = ['spike', 'block'];
  if (level >= 2) available.push('tall');
  if (level >= 3) available.push('double');
  if (level >= 4) available.push('moving');

  const type = available[Math.floor(Math.random() * available.length)];
  const cfg = getLevelConfig(level);

  if (type === 'spike') {
    obstacles.push({
      x: BASE_W + 20,
      y: GROUND_Y - 30,
      w: 30,
      h: 30,
      type: 'spike',
      color: cfg.accent
    });
  } else if (type === 'block') {
    const h = 35 + Math.random() * 20;
    obstacles.push({
      x: BASE_W + 20,
      y: GROUND_Y - h,
      w: 35,
      h,
      type: 'block',
      color: cfg.accent
    });
  } else if (type === 'tall') {
    const h = 55 + Math.random() * 20;
    obstacles.push({
      x: BASE_W + 20,
      y: GROUND_Y - h,
      w: 28,
      h,
      type: 'tall',
      color: cfg.accent
    });
  } else if (type === 'double') {
    const h1 = 30 + Math.random() * 15;
    const gap = 55 + Math.random() * 30;
    obstacles.push({
      x: BASE_W + 20,
      y: GROUND_Y - h1,
      w: 28,
      h: h1,
      type: 'spike',
      color: cfg.accent
    });
    obstacles.push({
      x: BASE_W + 20 + gap,
      y: GROUND_Y - h1 - 5,
      w: 28,
      h: h1 + 5,
      type: 'spike',
      color: '#ff6b6b'
    });
  } else if (type === 'moving') {
    const h = 30 + Math.random() * 15;
    obstacles.push({
      x: BASE_W + 20,
      y: GROUND_Y - h - 30,
      w: 28,
      h,
      type: 'moving',
      color: cfg.accent,
      vy: 1.5 + Math.random(),
      baseY: GROUND_Y - h - 30,
      amp: 40 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2
    });
  }
}

// --- Coin spawner ---
function spawnCoin() {
  const y = GROUND_Y - 50 - Math.random() * 80;
  coins.push({
    x: BASE_W + 10,
    y,
    r: 10,
    collected: false,
    anim: 0
  });
}

// --- Particle spawner ---
function spawnParticle(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const spd = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 2,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      r: 3 + Math.random() * 4,
      color
    });
  }
}

// --- Jump ---
function jump() {
  if (state !== 'playing') return;
  if (player.jumpsLeft > 0) {
    player.vy = JUMP_FORCE - (player.jumpsLeft === 1 ? 1.5 : 0);
    player.jumpsLeft--;
    player.squish = 1.3;
    spawnParticle(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE, currentColors.accent, 5);
  }
}

// --- Reset player ---
function resetPlayer() {
  player.x = 120;
  player.y = GROUND_Y - PLAYER_SIZE;
  player.vy = 0;
  player.onGround = false;
  player.jumpsLeft = 2;
  player.rotation = 0;
  player.trail = [];
  player.invincible = 120;
  player.squish = 1;
}

// --- Start game ---
function startGame() {
  state = 'playing';
  score = 0;
  lives = 3;
  level = 1;
  speed = 5;
  frame = 0;
  obstacles = [];
  coins = [];
  particles = [];
  obstacleCooldown = 0;
  coinCooldown = 0;
  bgTransitioning = false;
  bgTransitionProgress = 0;
  currentColors = getLevelConfig(1);
  nextColors = null;
  resetPlayer();
  updateHUD();
  document.getElementById('overlay').classList.add('hidden');
}

// --- HUD ---
function updateHUD() {
  document.getElementById('levelDisplay').textContent = `LEVEL ${level}`;
  document.getElementById('scoreDisplay').textContent = `SCORE: ${score}`;
  document.getElementById('livesDisplay').textContent = `❤️ ${lives}`;
  const needed = scoreForLevel(level);
  const prev = scoreForLevel(level - 1);
  const pct = Math.min(100, ((score - prev) / (needed - prev)) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
}

// --- Color helpers ---
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1,3), 16);
  const g1 = parseInt(c1.slice(3,5), 16);
  const b1 = parseInt(c1.slice(5,7), 16);
  const r2 = parseInt(c2.slice(1,3), 16);
  const g2 = parseInt(c2.slice(3,5), 16);
  const b2 = parseInt(c2.slice(5,7), 16);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `rgb(${r},${g},${b})`;
}

// =====================
// --- DRAW FUNCTIONS ---
// =====================

function drawBackground() {
  let sky1, sky2;
  if (bgTransitioning && nextColors) {
    sky1 = lerpColor(currentColors.sky[0], nextColors.sky[0], bgTransitionProgress);
    sky2 = lerpColor(currentColors.sky[1], nextColors.sky[1], bgTransitionProgress);
  } else {
    sky1 = currentColors.sky[0];
    sky2 = currentColors.sky[1];
  }

  const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
  grad.addColorStop(0, sky1);
  grad.addColorStop(1, sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Stars
  let starColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.star, nextColors.star, bgTransitionProgress)
    : currentColors.star;

  ctx.fillStyle = starColor;
  for (const s of stars) {
    ctx.globalAlpha = 0.6 + Math.sin(frame * 0.05 + s.x) * 0.4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ground color
  let groundColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.ground, nextColors.ground, bgTransitionProgress)
    : currentColors.ground;

  let accentColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.accent, nextColors.accent, bgTransitionProgress)
    : currentColors.accent;

  ctx.fillStyle = groundColor;
  ctx.fillRect(0, GROUND_Y, BASE_W, BASE_H - GROUND_Y);

  // Ground line glow
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(BASE_W, GROUND_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Ground grid lines
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1;
  const gridOffset = (frame * speed * 0.5) % 40;
  for (let x = -gridOffset; x < BASE_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, BASE_H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPlayer() {
  const px = player.x;
  const py = player.y;
  const sz = PLAYER_SIZE;
  const cx = px + sz / 2;
  const cy = py + sz / 2;

  let pColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.player, nextColors.player, bgTransitionProgress)
    : currentColors.player;

  let aColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.accent, nextColors.accent, bgTransitionProgress)
    : currentColors.accent;

  // Trail
  for (let i = 0; i < player.trail.length; i++) {
    const t = player.trail[i];
    ctx.globalAlpha = t.alpha * 0.5;
    ctx.fillStyle = pColor;
    ctx.fillRect(t.x, t.y, sz * t.scale, sz * t.scale);
  }
  ctx.globalAlpha = 1;

  // Invincible flash
  if (player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.rotation);
  ctx.scale(
    player.squish > 1 ? 1 / player.squish : 1,
    player.squish > 1 ? player.squish : 1
  );

  // Glow
  ctx.shadowColor = pColor;
  ctx.shadowBlur = 15;

  // Body gradient
  const grad = ctx.createLinearGradient(-sz/2, -sz/2, sz/2, sz/2);
  grad.addColorStop(0, pColor);
  grad.addColorStop(1, aColor);
  ctx.fillStyle = grad;
  roundRect(ctx, -sz/2, -sz/2, sz, sz, 6);
  ctx.fill();

  // Inner design
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, -sz/2+5, -sz/2+5, sz-10, sz-10, 3);
  ctx.stroke();

  // Eye white
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sz/4, -sz/4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Eye pupil
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(sz/4 + 1, -sz/4 + 1, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawObstacles() {
  let aColor = bgTransitioning && nextColors
    ? lerpColor(currentColors.accent, nextColors.accent, bgTransitionProgress)
    : currentColors.accent;

  for (const obs of obstacles) {
    ctx.shadowColor = obs.color;
    ctx.shadowBlur = 12;

    if (obs.type === 'spike') {
      ctx.fillStyle = obs.color;
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y + obs.h);
      ctx.lineTo(obs.x + obs.w / 2, obs.y);
      ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
      ctx.closePath();
      ctx.fill();

      // Shine
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.w * 0.3, obs.y + obs.h * 0.8);
      ctx.lineTo(obs.x + obs.w * 0.5, obs.y + obs.h * 0.2);
      ctx.lineTo(obs.x + obs.w * 0.55, obs.y + obs.h * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

    } else {
      const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
      grad.addColorStop(0, obs.color);
      grad.addColorStop(1, aColor);
      ctx.fillStyle = grad;
      roundRect(ctx, obs.x, obs.y, obs.w, obs.h, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6, 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }
}

function drawCoins() {
  for (const coin of coins) {
    if (coin.collected) continue;
    coin.anim += 0.05;

    ctx.save();
    ctx.translate(coin.x, coin.y + Math.sin(coin.anim) * 5);
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;

    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, coin.r);
    grad.addColorStop(0, '#fff8aa');
    grad.addColorStop(1, '#ffd700');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, coin.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ========================
// --- COLLISION DETECTION ---
// ========================

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  const margin = 6;
  return (
    ax + margin < bx + bw - margin &&
    ax + aw - margin > bx + margin &&
    ay + margin < by + bh - margin &&
    ay + ah - margin > by + margin
  );
}

function checkCollisions() {
  if (player.invincible > 0) return;

  for (const obs of obstacles) {
    let hit = false;
    if (obs.type === 'spike') {
      const px = player.x + 6, py = player.y + 6;
      const pw = PLAYER_SIZE - 12, ph = PLAYER_SIZE - 12;
      const ox = obs.x + 4, oy = obs.y + 8;
      const ow = obs.w - 8, oh = obs.h - 8;
      hit = rectsOverlap(px, py, pw, ph, ox, oy, ow, oh);
    } else {
      hit = rectsOverlap(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, obs.x, obs.y, obs.w, obs.h);
    }
    if (hit) {
      playerHit();
      return;
    }
  }

  for (const coin of coins) {
    if (coin.collected) continue;
    const dx = (player.x + PLAYER_SIZE / 2) - coin.x;
    const dy = (player.y + PLAYER_SIZE / 2) - coin.y;
    if (Math.sqrt(dx * dx + dy * dy) < PLAYER_SIZE / 2 + coin.r) {
      coin.collected = true;
      score += 50;
      spawnParticle(coin.x, coin.y, '#ffd700', 10);
      updateHUD();
    }
  }
}

function playerHit() {
  lives--;
  spawnParticle(
    player.x + PLAYER_SIZE / 2,
    player.y + PLAYER_SIZE / 2,
    currentColors.player,
    20
  );
  updateHUD();
  if (lives <= 0) {
    gameOver();
  } else {
    player.invincible = 120;
    player.vy = JUMP_FORCE;
  }
}

function gameOver() {
  state = 'dead';
  if (score > highScore) highScore = score;
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  document.getElementById('overlayTitle').innerHTML =
    `<span style="background:linear-gradient(135deg,#ff6b6b,#ff00aa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">GAME OVER</span>`;
  document.getElementById('overlaySub').innerHTML =
    `Score: <b style="color:#ffd700">${score}</b> &nbsp;|&nbsp; Best: <b style="color:#00ffcc">${highScore}</b><br>Level Reached: <b style="color:#ff6b6b">${level}</b>`;
  document.getElementById('startBtn').textContent = '▶ PLAY AGAIN';
}

// ====================
// --- LEVEL UP ---
// ====================

function triggerLevelUp() {
  level++;
  speed = 5 + (level - 1) * 0.8;
  nextColors = getLevelConfig(level);
  bgTransitioning = true;
  bgTransitionProgress = 0;

  const lu = document.getElementById('levelUpOverlay');
  const lt = document.getElementById('levelUpText');
  lt.textContent = `LEVEL ${level}!`;
  lt.style.color = nextColors.accent;
  lu.classList.add('show');
  levelUpTimer = 120;

  spawnParticle(BASE_W / 2, BASE_H / 2, nextColors.accent, 30);
  updateHUD();
}

// ====================
// --- MAIN UPDATE ---
// ====================

function update() {
  if (state !== 'playing') return;

  frame++;

  // Score increment
  score += 1;
  if (score % 10 === 0) updateHUD();

  // Level up check
  if (score >= scoreForLevel(level)) {
    triggerLevelUp();
  }

  // Background color transition
  if (bgTransitioning) {
    bgTransitionProgress += 0.008;
    if (bgTransitionProgress >= 1) {
      bgTransitionProgress = 1;
      currentColors = nextColors;
      nextColors = null;
      bgTransitioning = false;
    }
  }

  // Level up overlay timer
  if (levelUpTimer > 0) {
    levelUpTimer--;
    if (levelUpTimer === 0) {
      document.getElementById('levelUpOverlay').classList.remove('show');
    }
  }

  // Stars parallax
  for (const s of stars) {
    s.x -= s.speed;
    if (s.x < -5) s.x = BASE_W + 5;
  }

  // Player physics
  player.vy += GRAVITY;
  player.y += player.vy;

  if (player.y >= GROUND_Y - PLAYER_SIZE) {
    player.y = GROUND_Y - PLAYER_SIZE;
    player.vy = 0;
    player.onGround = true;
    player.jumpsLeft = 2;
  } else {
    player.onGround = false;
  }

  // Player rotation
  if (!player.onGround) {
    player.rotation += 0.08 * (speed / 5);
  } else {
    player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
  }

  // Squish recovery
  if (player.squish > 1) {
    player.squish = Math.max(1, player.squish - 0.05);
  }

  // Trail update
  player.trail.push({
    x: player.x - 4,
    y: player.y,
    alpha: 0.5,
    scale: 1
  });
  if (player.trail.length > 8) player.trail.shift();
  for (const t of player.trail) {
    t.alpha -= 0.06;
    t.scale *= 0.92;
  }

  // Invincible countdown
  if (player.invincible > 0) player.invincible--;

  // Obstacle spawn
  obstacleCooldown--;
  const minCool = Math.max(40, 90 - level * 5);
  const maxCool = Math.max(70, 140 - level * 8);
  if (obstacleCooldown <= 0) {
    spawnObstacle();
    obstacleCooldown = minCool + Math.random() * (maxCool - minCool);
  }

  // Obstacle movement
  for (const obs of obstacles) {
    obs.x -= speed;
    if (obs.type === 'moving') {
      obs.phase = (obs.phase || 0) + 0.04;
      obs.y = obs.baseY + Math.sin(obs.phase) * obs.amp;
    }
  }
  obstacles = obstacles.filter(o => o.x + (o.w || 40) > -10);

  // Coin spawn
  coinCooldown--;
  if (coinCooldown <= 0) {
    spawnCoin();
    coinCooldown = 120 + Math.random() * 100;
  }
  for (const c of coins) c.x -= speed;
  coins = coins.filter(c => c.x > -20);

  // Particle update
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    p.r *= 0.97;
  }
  particles = particles.filter(p => p.life > 0);

  // Collision check
  checkCollisions();
}

// ====================
// --- MAIN DRAW ---
// ====================

function draw() {
  ctx.clearRect(0, 0, BASE_W, BASE_H);
  drawBackground();
  drawCoins();
  drawObstacles();
  drawPlayer();
  drawParticles();

  // Speed lines (level 3+)
  if (level >= 3) {
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = currentColors.accent;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = 20 + i * 40;
      const len = 30 + Math.random() * 60;
      const x = (BASE_W - (frame * speed * 2 + i * 200) % BASE_W);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ====================
// --- GAME LOOP ---
// ====================

function loop() {
  update();
  draw();
  animId = requestAnimationFrame(loop);
}

// ====================
// --- INPUT EVENTS ---
// ====================

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'menu' || state === 'dead') return;
    jump();
  }
});

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (state === 'playing') jump();
});

document.getElementById('jumpBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  document.getElementById('jumpBtn').classList.add('pressed');
  if (state === 'playing') jump();
});

document.getElementById('jumpBtn').addEventListener('pointerup', () => {
  document.getElementById('jumpBtn').classList.remove('pressed');
});

document.getElementById('startBtn').addEventListener('click', () => {
  startGame();
  if (!animId) {
    loop();
  } else {
    cancelAnimationFrame(animId);
    loop();
  }
});

// ====================
// --- INIT RENDER ---
// ====================

(function initRender() {
  drawBackground();
  player.y = GROUND_Y - PLAYER_SIZE;
  drawPlayer();
})();

loop();
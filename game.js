/* ==========================================================================
   こどぷろゲームクリエイター - ゲームプログラム (game.js)
   ========================================================================== */

// --- ゲーム設定と状態管理 ---
const config = {
  width: 480,
  height: 360,
  gravity: 0.6
};

// ゲームの変数（ブロックから読み込まれるパラメータ）
let gameParams = {
  playerSpeed: 3,
  playerJump: 0,
  playerMaxLife: 1,
  tntSpeed: 6,
  tntFrequency: 'high', // 'high', 'normal', 'low'
  diamondScore: 5,
  specialEffect: 'none' // 'none', 'shield', 'speedup'
};

// 実行中のゲーム内状態
let gameState = {
  score: 0,
  life: 1,
  highscore: localStorage.getItem('kodopro_highscore') || 0,
  isGameOver: false,
  isPlaying: false,
  shieldTimer: 0,       // 無敵タイマー（フレーム数）
  speedupTimer: 0,      // スピードアップタイマー（フレーム数）
  particles: []         // パーティクル配列
};

// Canvas とコンテキストの取得
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// UI要素の取得
const scoreVal = document.getElementById('score-val');
const lifeContainer = document.getElementById('life-container');
const highscoreVal = document.getElementById('highscore-val');
const gameOverlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const startBtn = document.getElementById('start-btn');

// --- キャラクター・オブジェクトの定義 ---

// 1. プレイヤー (エージェント)
class Agent {
  constructor() {
    // ライフの初期設定値に基づいてサイズを動的に変更
    this.width = 20 + gameParams.playerMaxLife * 12; // ライフ1: 32px, ライフ3: 56px, ライフ5: 80px
    this.height = 24 + gameParams.playerMaxLife * 12; // ライフ1: 36px, ライフ3: 60px, ライフ5: 84px
    this.x = config.width / 2 - this.width / 2;
    this.y = config.height - this.height - 10;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = true;
    this.dir = 1; // 1: 右, -1: 左
    this.animFrame = 0;
  }

  update(keys, touchDir) {
    // 状態タイマーの更新
    if (gameState.shieldTimer > 0) gameState.shieldTimer--;
    if (gameState.speedupTimer > 0) gameState.speedupTimer--;

    // 速度の設定 (スピードアップ効果があれば2倍)
    let targetSpeed = gameParams.playerSpeed;
    if (gameState.speedupTimer > 0) {
      targetSpeed *= 2;
      // スピードアップ時のエフェクト煙パーティクル
      if (Math.random() < 0.3) {
        createParticle(this.x + this.width / 2, this.y + this.height, '#00f0ff', -this.vx * 0.2, -Math.random() * 2);
      }
    }

    // 慣性（滑りやすさ）の設計
    // スピード設定が高いほど、ブレーキが効きにくくズルズル滑る（摩擦係数を1に近づける）
    let friction = 0.65; // スピードが低い時はピタッと止まれる
    if (gameParams.playerSpeed > 5) {
      friction = 0.70 + (gameParams.playerSpeed - 5) * 0.05; // スピード10のときに friction = 0.95 (超ツルツル滑る)
    }

    // 空中では制御能力（左右移動の加速度）が大幅に低下する (地上の約1/4)
    let accel = this.isGrounded ? 1.2 : 0.3;

    // 移動入力処理 (キーボード ＆ タッチ)
    if (keys['ArrowLeft'] || touchDir === 'left') {
      this.vx -= accel;
      this.dir = -1;
      this.animFrame += 0.2;
    } else if (keys['ArrowRight'] || touchDir === 'right') {
      this.vx += accel;
      this.dir = 1;
      this.animFrame += 0.2;
    } else {
      this.vx *= friction;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
    }

    // 最大速度の制限
    if (this.vx > targetSpeed) this.vx = targetSpeed;
    if (this.vx < -targetSpeed) this.vx = -targetSpeed;

    // ジャンプ処理 (ジャンプ力が0より大きい場合のみ有効)
    if (gameParams.playerJump > 0) {
      if ((keys['Space'] || keys[' '] || touchDir === 'jump') && this.isGrounded) {
        this.vy = -gameParams.playerJump;
        this.isGrounded = false;
        // ジャンプ時の土煙
        for (let i = 0; i < 5; i++) {
          createParticle(this.x + this.width / 2, this.y + this.height, '#8d6e63', (Math.random() - 0.5) * 3, -Math.random() * 2);
        }
      }
    }

    // 物理演算 (重力と床の判定)
    this.x += this.vx;
    this.y += this.vy;
    this.vy += config.gravity;

    // 画面外にいかないように制限
    if (this.x < 0) {
      this.x = 0;
      this.vx = 0;
    }
    if (this.x > config.width - this.width) {
      this.x = config.width - this.width;
      this.vx = 0;
    }

    const floorY = config.height - this.height - 10;
    if (this.y >= floorY) {
      this.y = floorY;
      this.vy = 0;
      this.isGrounded = true;
    }
  }

  draw() {
    ctx.save();
    // 向きに応じて反転
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    if (this.dir === -1) {
      ctx.scale(-1, 1);
    }

    // 無敵状態 (ピカピカ光る)
    if (gameState.shieldTimer > 0) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsl(${(Date.now() / 5) % 360}, 100%, 50%)`;
      if (Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.globalAlpha = 0.5;
      }
    }

    // ドット絵風エージェントの描画
    const w = this.width;
    const h = this.height;
    const offset = Math.sin(this.animFrame) * 2; // 歩くアニメーション

    // 1. キャタピラ (足元)
    ctx.fillStyle = '#455a64';
    ctx.fillRect(-w/2 + 2, h/2 - 6, w - 4, 6);
    ctx.fillStyle = '#263238';
    ctx.fillRect(-w/2 + 4 + (offset > 0 ? 2 : 0), h/2 - 5, w - 8, 4);

    // 2. ボディ
    ctx.fillStyle = '#0288d1'; // こどプロカラー（ブルー）
    ctx.fillRect(-w/2 + 4, -h/2 + 10, w - 8, h - 16);
    
    // ボディの飾りライン
    ctx.fillStyle = '#29b6f6';
    ctx.fillRect(-w/2 + 4, -h/2 + 14, w - 8, 4);

    // 3. アンテナ
    ctx.fillStyle = '#78909c';
    ctx.fillRect(-2, -h/2, 4, 10);
    // アンテナの先端
    ctx.fillStyle = gameState.shieldTimer > 0 ? `hsl(${(Date.now() / 5) % 360}, 100%, 50%)` : '#ff1744';
    ctx.beginPath();
    ctx.arc(0, -h/2, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4. 顔 (バイザー)
    ctx.fillStyle = '#212121';
    ctx.fillRect(-w/2 + 6, -h/2 + 12, w - 12, 10);
    
    // 目 (光るLED風)
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(-w/2 + 10, -h/2 + 15, 6, 4);
    ctx.fillRect(w/2 - 16, -h/2 + 15, 6, 4);

    ctx.restore();
  }
}

// 2. 落ちてくるもの (TNT、ダイヤ、金鉱石)
class FallingObject {
  constructor(type) {
    this.type = type; // 'tnt' または 'diamond' または 'gold'
    this.width = 24;
    this.height = 24;
    this.x = Math.random() * (config.width - this.width);
    this.y = -Math.random() * 200 - this.height;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.05;
    this.resetSpeed();
  }

  update() {
    this.y += this.speed;
    this.rotation += this.rotSpeed;
    
    // 画面下に到達したか
    if (this.y > config.height) {
      this.reset();
    }
  }

  resetSpeed() {
    if (this.type === 'tnt') {
      this.speed = gameParams.tntSpeed + (Math.random() - 0.5) * 2;
    } else if (this.type === 'diamond') {
      // 得点が高くなるほど、ダイヤが重くなり落下が加速する
      this.speed = 3 + (gameParams.diamondScore * 0.09); // 得点100のとき秒速12ピクセル（超高速）
    } else {
      this.speed = 3 + Math.random() * 2;
    }
  }

  reset() {
    this.x = Math.random() * (config.width - this.width);
    this.y = -Math.random() * 100 - this.height;
    this.resetSpeed();
  }

  draw() {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate(this.rotation);

    if (this.type === 'tnt') {
      // TNT (マインクラフト風ドット絵)
      ctx.fillStyle = '#d32f2f'; // 赤
      ctx.fillRect(-12, -12, 24, 24);
      
      // 白い帯
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, -4, 24, 8);
      
      // TNT文字
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 0);

      // 上部の導火線
      ctx.fillStyle = '#7d5225';
      ctx.fillRect(-2, -15, 4, 3);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(-1, -17, 2, 2);

    } else if (this.type === 'diamond') {
      // ダイヤモンド (光るひし形)
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00e5ff';
      ctx.fillStyle = '#00e5ff';
      
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();

      // 内側の白いハイライト
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();

    } else if (this.type === 'gold') {
      // 金鉱石 (黄色のドットが入ったグレーのブロック)
      ctx.fillStyle = '#757575';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(-6, -6, 4, 4);
      ctx.fillRect(2, -2, 4, 4);
      ctx.fillRect(-4, 4, 4, 4);
    }

    ctx.restore();
  }
}

// 3. 煙や光などのパーティクル
function createParticle(x, y, color, vx, vy) {
  gameState.particles.push({
    x: x,
    y: y,
    vx: vx || (Math.random() - 0.5) * 4,
    vy: vy || (Math.random() - 0.5) * 4,
    color: color || '#fff',
    size: Math.random() * 4 + 2,
    alpha: 1,
    life: Math.random() * 20 + 20
  });
}

function updateParticles() {
  for (let i = gameState.particles.length - 1; i >= 0; i--) {
    let p = gameState.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha = p.life / 40;
    p.life--;
    if (p.life <= 0) {
      gameState.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  ctx.save();
  for (let p of gameState.particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- ゲーム内の実体管理 ---
let player = new Agent();
let fallingObjects = [];

// 落ちてくるオブジェクトの再構成（難易度変更時に呼び出す）
function setupFallingObjects() {
  fallingObjects = [];
  
  // TNTの個数（頻度）設定
  let tntCount = 3;
  if (gameParams.tntFrequency === 'high') tntCount = 5;
  if (gameParams.tntFrequency === 'normal') tntCount = 3;
  if (gameParams.tntFrequency === 'low') tntCount = 1;

  // TNTを追加
  for (let i = 0; i < tntCount; i++) {
    fallingObjects.push(new FallingObject('tnt'));
  }

  // ダイヤモンドと金鉱石を追加（固定数）
  fallingObjects.push(new FallingObject('diamond'));
  fallingObjects.push(new FallingObject('gold'));
  fallingObjects.push(new FallingObject('gold'));
}

// --- 操作入力ハンドリング ---
const keys = {};
let touchDir = null; // タッチ操作方向

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // スペースキーでブラウザのスクロールを防ぐ
  if (e.code === 'Space') {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// モバイルタッチボタンイベント
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');

function setupTouchEvents() {
  btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); touchDir = 'left'; });
  btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); if (touchDir === 'left') touchDir = null; });
  btnLeft.addEventListener('mousedown', () => { touchDir = 'left'; });
  btnLeft.addEventListener('mouseup', () => { if (touchDir === 'left') touchDir = null; });

  btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); touchDir = 'right'; });
  btnRight.addEventListener('touchend', (e) => { e.preventDefault(); if (touchDir === 'right') touchDir = null; });
  btnRight.addEventListener('mousedown', () => { touchDir = 'right'; });
  btnRight.addEventListener('mouseup', () => { if (touchDir === 'right') touchDir = null; });

  btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); touchDir = 'jump'; });
  btnJump.addEventListener('touchend', (e) => { e.preventDefault(); if (touchDir === 'jump') touchDir = null; });
  btnJump.addEventListener('mousedown', () => { touchDir = 'jump'; });
  btnJump.addEventListener('mouseup', () => { if (touchDir === 'jump') touchDir = null; });
}

// --- 当たり判定（衝突判定） ---
function checkCollision(rect1, rect2) {
  return rect1.x < rect2.x + rect2.width &&
         rect1.x + rect1.width > rect2.x &&
         rect1.y < rect2.y + rect2.height &&
         rect1.y + rect1.height > rect2.y;
}

// --- ゲームループ ---
function gameLoop() {
  if (!gameState.isPlaying || gameState.isGameOver) return;

  // 画面クリア
  ctx.fillStyle = '#1e1e24';
  ctx.fillRect(0, 0, config.width, config.height);

  // 背景に簡単なグリッドを描画（マイクラっぽさの演出）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < config.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, config.height);
    ctx.stroke();
  }
  for (let y = 0; y < config.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(config.width, y);
    ctx.stroke();
  }

  // 床の描画
  ctx.fillStyle = '#37474f';
  ctx.fillRect(0, config.height - 10, config.width, 10);
  ctx.fillStyle = '#263238';
  ctx.fillRect(0, config.height - 4, config.width, 4);

  // プレイヤーの更新と描画
  player.update(keys, touchDir);
  player.draw();

  // 落ちてくるオブジェクトの更新と描画、衝突判定
  for (let obj of fallingObjects) {
    obj.update();
    obj.draw();

    // 当たり判定
    if (checkCollision(player, obj)) {
      if (obj.type === 'tnt') {
        // TNTに当たった
        if (gameState.shieldTimer > 0) {
          // 無敵状態ならTNTを弾き飛ばす
          for (let i = 0; i < 15; i++) {
            createParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#f44336', (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
          }
          obj.reset();
        } else {
          // ダメージ
          gameState.life--;
          updateLifeUI();
          
          // 爆発エフェクト
          for (let i = 0; i < 20; i++) {
            createParticle(player.x + player.width/2, player.y + player.height/2, '#ff9800', (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
            createParticle(player.x + player.width/2, player.y + player.height/2, '#f44336', (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
          }

          if (gameState.life <= 0) {
            triggerGameOver();
          } else {
            // 一時的に無敵
            gameState.shieldTimer = 60; // 1秒間
            obj.reset();
          }
        }
      } else if (obj.type === 'diamond') {
        // ダイヤ獲得
        gameState.score += Number(gameParams.diamondScore);
        scoreVal.textContent = gameState.score;

        // 特殊効果の適用
        applySpecialEffect();

        // 獲得エフェクト
        for (let i = 0; i < 10; i++) {
          createParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#00e5ff', (Math.random() - 0.5) * 4, -Math.random() * 5);
        }
        obj.reset();
      } else if (obj.type === 'gold') {
        // 金鉱石獲得 (1点固定)
        gameState.score += 1;
        scoreVal.textContent = gameState.score;

        // 獲得エフェクト
        for (let i = 0; i < 5; i++) {
          createParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#ffd54f', (Math.random() - 0.5) * 3, -Math.random() * 4);
        }
        obj.reset();
      }
    }
  }

  // パーティクルの更新と描画
  updateParticles();
  drawParticles();

  requestAnimationFrame(gameLoop);
}

// ダイヤ獲得時の特殊効果
function applySpecialEffect() {
  const effect = gameParams.specialEffect;
  if (effect === 'shield') {
    gameState.shieldTimer = 180; // 3秒間 (60fps * 3)
    // エフェクトパーティクル
    for (let i = 0; i < 15; i++) {
      createParticle(player.x + player.width/2, player.y + player.height/2, '#ff4081', (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
    }
  } else if (effect === 'speedup') {
    gameState.speedupTimer = 180; // 3秒間
    for (let i = 0; i < 15; i++) {
      createParticle(player.x + player.width/2, player.y + player.height/2, '#00e5ff', (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
  }
}

// ライフUIの更新
function updateLifeUI() {
  let hearts = '';
  for (let i = 0; i < gameState.life; i++) {
    hearts += '❤';
  }
  // ライフが空なら
  if (hearts === '') hearts = '☠';
  lifeContainer.textContent = hearts;
}

// ゲームオーバー処理
function triggerGameOver() {
  gameState.isGameOver = true;
  gameState.isPlaying = false;

  // ハイスコアの保存
  if (gameState.score > gameState.highscore) {
    gameState.highscore = gameState.score;
    localStorage.setItem('kodopro_highscore', gameState.highscore);
    highscoreVal.textContent = gameState.highscore;
  }

  // オーバーレイ表示
  overlayTitle.textContent = 'ゲームオーバー';
  overlayDesc.innerHTML = `あなたのスコア: <span style="font-size:1.8rem; color:#fff; font-weight:800">${gameState.score}</span> 点<br>もっとハイスコアをだすために、<br>プログラムを「改造（かいぞう）」してみよう！`;
  startBtn.textContent = 'もういちど遊ぶ';
  gameOverlay.classList.add('show');
}

// ゲーム開始処理
function initGame() {
  gameState.score = 0;
  // ブロックからライフの値を初期設定として代入
  gameState.life = Number(gameParams.playerMaxLife);
  gameState.isGameOver = false;
  gameState.isPlaying = true;
  gameState.shieldTimer = 0;
  gameState.speedupTimer = 0;
  gameState.particles = [];

  scoreVal.textContent = '0';
  updateLifeUI();
  
  // プレイヤー位置初期化
  player = new Agent();
  setupFallingObjects();

  // オーバーレイ非表示
  gameOverlay.classList.remove('show');

  // ループ開始
  gameLoop();
}

startBtn.addEventListener('click', initGame);

// --- Scratchブロックプログラム実行（コンパイル演出） ---
const runCodeBtn = document.getElementById('run-code-btn');
const compilerOverlay = document.getElementById('compiler-overlay');
const compilerConsole = document.getElementById('compiler-console');

// コンソールログ風表示ユーティリティ
function addLogLine(text, delay) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const p = document.createElement('p');
      p.textContent = text;
      compilerConsole.appendChild(p);
      compilerConsole.scrollTop = compilerConsole.scrollHeight; // スクロール最下部へ
      resolve();
    }, delay);
  });
}

async function runProgramCompileAnimation() {
  // コンソール初期化
  compilerConsole.innerHTML = '';
  compilerOverlay.classList.remove('success');
  compilerOverlay.classList.add('show');

  await addLogLine('> モジュールを読みこみ中...', 100);
  await addLogLine('> ブロックから パラメータを取得中...', 200);
  
  // ブロックからの数値取得
  const pSpeed = document.getElementById('param-player-speed').value;
  const pJump = document.getElementById('param-player-jump').value;
  const pLife = document.getElementById('param-player-life').value;
  const tSpeed = document.getElementById('param-tnt-speed').value;
  const tFreq = document.getElementById('param-tnt-frequency').value;
  const dScore = document.getElementById('param-diamond-score').value;
  const spEffect = document.getElementById('param-special-effect').value;

  await addLogLine(`  - プレイヤーのスピード = ${pSpeed}`, 100);
  await addLogLine(`  - プレイヤーのジャンプ力 = ${pJump}`, 100);
  await addLogLine(`  - プレイヤーのライフ = ${pLife}`, 100);
  await addLogLine(`  - TNTの落ちるスピード = ${tSpeed}`, 100);
  await addLogLine(`  - TNTの量 = "${tFreq}"`, 100);
  await addLogLine(`  - ダイヤの得点 = ${dScore}`, 100);
  await addLogLine(`  - 特別な効果 = "${spEffect}"`, 100);

  await addLogLine('> ソースコードを生成中...', 200);
  await addLogLine('> ゲームエンジンへ コードを適用中...', 300);
  await addLogLine('> コンパイル 成功！', 200);

  // パラメータのゲーム反映
  gameParams.playerSpeed = Number(pSpeed);
  gameParams.playerJump = Number(pJump);
  gameParams.playerMaxLife = Number(pLife);
  gameParams.tntSpeed = Number(tSpeed);
  gameParams.tntFrequency = tFreq;
  gameParams.diamondScore = Number(dScore);
  gameParams.specialEffect = spEffect;

  // 実行中なら、リアルタイムで反映するパラメータもある
  if (gameState.isPlaying && !gameState.isGameOver) {
    // ライフは現在ライフより最大ライフが増えた場合、増やす
    if (gameState.life < gameParams.playerMaxLife) {
      gameState.life = gameParams.playerMaxLife;
      updateLifeUI();
    }
    // 落下物を再設定
    setupFallingObjects();
  }

  compilerOverlay.classList.add('success');

  // 1秒後にオーバーレイを隠す
  setTimeout(() => {
    compilerOverlay.classList.remove('show');
  }, 1000);
}

runCodeBtn.addEventListener('click', runProgramCompileAnimation);

// --- 初期化 ---
highscoreVal.textContent = gameState.highscore;
setupTouchEvents();

// 初回に仮で描画しておく（ゲーム画面が黒くならないように）
ctx.fillStyle = '#1e1e24';
ctx.fillRect(0, 0, config.width, config.height);
ctx.fillStyle = '#37474f';
ctx.fillRect(0, config.height - 10, config.width, 10);
player.draw();

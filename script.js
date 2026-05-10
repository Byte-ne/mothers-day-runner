// --- Web Audio API Wrapper ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.gain.value = 0.3; // moderate volume

const playTone = (freq, type, duration, vol=1) => {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
};

const playSound = {
    pop: () => {
        playTone(600, 'sine', 0.1, 0.5);
        setTimeout(() => playTone(800, 'sine', 0.15, 0.5), 50);
    },
    damage: () => {
        playTone(150, 'sawtooth', 0.3, 0.8);
        playTone(100, 'square', 0.4, 0.8);
    },
    powerup: () => {
        playTone(400, 'sine', 0.1, 0.6);
        setTimeout(() => playTone(600, 'sine', 0.1, 0.6), 100);
        setTimeout(() => playTone(800, 'sine', 0.3, 0.6), 200);
    },
    win: () => {
        [440, 554, 659, 880].forEach((freq, i) => {
            setTimeout(() => playTone(freq, 'sine', 0.8, 0.5), i * 150);
        });
    }
};

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const screens = {
    intro: document.getElementById('screen-intro'),
    name: document.getElementById('screen-name'),
    hud: document.getElementById('screen-hud'),
    pause: document.getElementById('screen-pause'),
    gameover: document.getElementById('screen-gameover')
};

const typingText = document.getElementById('typing-text');
const btnStartIntro = document.getElementById('btn-start-intro');
const momNameInput = document.getElementById('mom-name-input');
const btnStartGame = document.getElementById('btn-start-game');
const healthBarFill = document.getElementById('health-bar-fill');
const scoreText = document.getElementById('score-text');
const comboText = document.getElementById('combo-text');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnRestartPause = document.getElementById('btn-restart-pause');
const btnRestart = document.getElementById('btn-restart');
const finalScore = document.getElementById('final-score');
const gameoverMessage = document.getElementById('gameover-message');

// --- Game State ---
let STATE = 'INTRO'; // INTRO, NAME, PLAYING, PAUSED, GAMEOVER
let momName = "Mom";
let animFrameId;

let width, height;
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// --- Input Handling ---
const mouse = { x: width / 2, y: height / 2 };
const updateMouse = (e) => {
    if(e.touches) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
    } else {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    }
};
window.addEventListener('mousemove', updateMouse);
window.addEventListener('touchmove', updateMouse, {passive: false});

// --- Entities ---
class Player {
    constructor() {
        this.x = width / 2;
        this.y = height / 2;
        this.radius = 30;
        this.health = 100;
        this.maxHealth = 100;
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
    }
    update() {
        // Lerp towards mouse
        this.x += (mouse.x - this.x) * 0.15;
        this.y += (mouse.y - this.y) * 0.15;
        
        // Boundaries
        this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));

        if(this.comboTimer > 0) {
            this.comboTimer--;
            if(this.comboTimer === 0) {
                this.combo = 0;
                updateComboUI();
            }
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👩‍👧", 0, 0); // Mom & child emoji
        ctx.restore();
    }
}

class Item {
    constructor(type) {
        this.type = type; // 'heart', 'stress', 'powerup'
        this.radius = type === 'stress' ? 25 : 20;
        this.x = Math.random() < 0.5 ? -this.radius : width + this.radius;
        this.y = Math.random() * height;
        this.vx = (Math.random() * 2 + 1) * (this.x < 0 ? 1 : -1);
        this.vy = (Math.random() - 0.5) * 2;
        this.active = true;
        
        this.emoji = type === 'heart' ? '❤️' : (type === 'stress' ? '😤' : '✨');
    }
    update(speedMult) {
        this.x += this.vx * speedMult;
        this.y += this.vy * speedMult;
        
        // Bounce off top/bottom
        if(this.y < this.radius || this.y > height - this.radius) this.vy *= -1;
        
        // Kill if completely off screen horizontally
        if((this.vx < 0 && this.x < -this.radius * 2) || (this.vx > 0 && this.x > width + this.radius * 2)) {
            this.active = false;
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.font = `${this.radius * 1.5}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.02;
        this.color = color;
        this.size = Math.random() * 5 + 2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1;
        this.vy = -2;
    }
    update() {
        this.y += this.vy;
        this.life -= 0.02;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = "bold 24px Outfit";
        ctx.textAlign = "center";
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// --- Game Logic ---
let player;
let items = [];
let particles = [];
let floatingTexts = [];
let frameCount = 0;
let difficultyMult = 1;

function initGame() {
    player = new Player();
    items = [];
    particles = [];
    floatingTexts = [];
    frameCount = 0;
    difficultyMult = 1;
    updateHUD();
    mouse.x = width / 2;
    mouse.y = height / 2;
}

function spawnParticles(x, y, color, count) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, color));
}

function updateHUD() {
    scoreText.innerText = player.score;
    const healthPercent = Math.max(0, (player.health / player.maxHealth) * 100);
    healthBarFill.style.width = `${healthPercent}%`;
    
    // Change color based on health
    if(healthPercent > 50) healthBarFill.style.background = 'linear-gradient(90deg, #ff4757, #ff6b81)';
    else if(healthPercent > 25) healthBarFill.style.background = 'linear-gradient(90deg, #ffa502, #ff7f50)';
    else healthBarFill.style.background = 'linear-gradient(90deg, #ff4757, #8c7ae6)';
}

function updateComboUI() {
    if(player.combo > 1) {
        comboText.innerText = `x${player.combo}`;
        comboText.classList.add('active');
        // Bump animation
        comboText.style.transform = 'scale(1.2)';
        setTimeout(() => comboText.style.transform = 'scale(1)', 100);
    } else {
        comboText.classList.remove('active');
    }
}

function damageScreenShake() {
    document.body.classList.add('shaking');
    setTimeout(() => document.body.classList.remove('shaking'), 400);
}

function gameOver() {
    STATE = 'GAMEOVER';
    playSound.win();
    showScreen('gameover');
    finalScore.innerText = player.score;
    gameoverMessage.innerText = `No matter the score, ${momName} is the World's Best Mom! ❤️`;
}

function update() {
    if(STATE !== 'PLAYING') return;
    
    frameCount++;
    if(frameCount % 600 === 0) difficultyMult += 0.2; // Increase difficulty every 10s

    player.update();

    // Spawning logic
    if(Math.random() < 0.02 * difficultyMult) items.push(new Item('stress'));
    if(Math.random() < 0.03) items.push(new Item('heart'));
    if(Math.random() < 0.005) items.push(new Item('powerup'));

    // Update items & collision
    for (let i = items.length - 1; i >= 0; i--) {
        let item = items[i];
        item.update(difficultyMult);
        
        // Collision
        let dx = player.x - item.x;
        let dy = player.y - item.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < player.radius + item.radius) {
            item.active = false;
            
            if(item.type === 'heart') {
                player.combo++;
                player.comboTimer = 120; // 2 seconds
                let pts = 10 * player.combo;
                player.score += pts;
                playSound.pop();
                spawnParticles(item.x, item.y, '#ff4757', 10);
                floatingTexts.push(new FloatingText(item.x, item.y, `+${pts}`, '#ff7eb3'));
                updateComboUI();
            } else if(item.type === 'stress') {
                player.health -= 20;
                player.combo = 0;
                playSound.damage();
                damageScreenShake();
                spawnParticles(item.x, item.y, '#2f3542', 15);
                floatingTexts.push(new FloatingText(item.x, item.y, `-20`, '#ff4757'));
                updateComboUI();
                
                if(player.health <= 0) {
                    gameOver();
                }
            } else if(item.type === 'powerup') {
                player.health = Math.min(player.maxHealth, player.health + 30);
                playSound.powerup();
                spawnParticles(item.x, item.y, '#eccc68', 20);
                floatingTexts.push(new FloatingText(item.x, item.y, `+30 HP`, '#2ed573'));
            }
            updateHUD();
        }
    }
    
    items = items.filter(i => i.active);

    // Update particles
    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0);
    
    // Update texts
    floatingTexts.forEach(t => t.update());
    floatingTexts = floatingTexts.filter(t => t.life > 0);
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    
    if(STATE !== 'INTRO' && STATE !== 'NAME') {
        items.forEach(i => i.draw(ctx));
        particles.forEach(p => p.draw(ctx));
        if(STATE === 'PLAYING' || STATE === 'PAUSED' || STATE === 'GAMEOVER') {
            player.draw(ctx);
        }
        floatingTexts.forEach(t => t.draw(ctx));
    }
}

function gameLoop() {
    update();
    draw();
    animFrameId = requestAnimationFrame(gameLoop);
}

// --- UI Logic ---
function showScreen(screenId) {
    const activeScreens = Object.values(screens).filter(s => s.classList.contains('active'));
    activeScreens.forEach(s => s.classList.remove('active'));
    
    if (activeScreens.length > 0) {
        setTimeout(() => screens[screenId].classList.add('active'), 300);
    } else {
        screens[screenId].classList.add('active');
    }
}

// Intro typing animation
const introMessage = "A journey of love, stress, and endless hugs...";
let typeIdx = 0;
function typeIntro() {
    if(typeIdx < introMessage.length) {
        typingText.innerHTML += introMessage.charAt(typeIdx);
        typeIdx++;
        setTimeout(typeIntro, 50);
    } else {
        setTimeout(() => {
            btnStartIntro.classList.remove('hidden');
        }, 500);
    }
}

// Events
btnStartIntro.addEventListener('click', () => {
    // Resume audio context on first user interaction
    if(audioCtx.state === 'suspended') audioCtx.resume();
    showScreen('name');
    STATE = 'NAME';
    setTimeout(() => momNameInput.focus(), 500);
});

btnStartGame.addEventListener('click', () => {
    const val = momNameInput.value.trim();
    if(val) momName = val;
    showScreen('hud');
    STATE = 'PLAYING';
    initGame();
});

momNameInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') btnStartGame.click();
});

btnPause.addEventListener('click', () => {
    if(STATE === 'PLAYING') {
        STATE = 'PAUSED';
        showScreen('pause');
    }
});

btnResume.addEventListener('click', () => {
    STATE = 'PLAYING';
    showScreen('hud');
});

const doRestart = () => {
    showScreen('hud');
    STATE = 'PLAYING';
    initGame();
};
btnRestartPause.addEventListener('click', doRestart);
btnRestart.addEventListener('click', doRestart);

// --- Initialization ---
window.onload = () => {
    showScreen('intro');
    setTimeout(typeIntro, 500);
    gameLoop();
};

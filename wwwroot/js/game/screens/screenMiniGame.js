/**
 * screenMiniGame.js — Мини-игра «Пробная посадка на планету»
 *
 * Геймплей: игрок управляет модулем посадки (WASD / стрелки / мышь),
 * уклоняясь от помех и собирая бонусные маркеры.
 * Canvas 2D overlaid поверх Three.js.
 *
 * Состояния: READY → PLAYING → ENDED
 */

import { getStore, dispatch, transition, Screen } from '../stateManager.js';

// ── Конфигурация ────────────────────────────────────────────────────────────

const DURATION_S      = 30;     // длительность раунда
const LANDER_SIZE     = 28;     // размер модуля посадки
const OBSTACLE_MIN_R  = 8;     // мин. радиус помехи
const OBSTACLE_MAX_R  = 22;    // макс. радиус помехи
const BONUS_SIZE      = 14;    // размер бонусного маркера
const SPAWN_INTERVAL  = 0.6;   // сек между спавнами
const OBJ_SPEED_BASE  = 120;   // базовая скорость объектов px/s
const SCORE_PER_BONUS = 50;
const SCORE_TIME_MULT = 10;    // очки за каждую оставшуюся секунду

const COLORS = {
    bg:        '#020710',
    lander:    '#4fc3f7',
    landerGlow:'rgba(79,195,247,0.15)',
    obstacle:  '#f87171',
    bonus:     '#4ade80',
    bonusGlow: 'rgba(74,222,128,0.2)',
    text:      '#e2e8f0',
    muted:     '#64748b',
    primary:   '#4fc3f7',
    grid:      'rgba(79,195,247,0.04)',
};

// ── Состояние ───────────────────────────────────────────────────────────────

let _state    = 'idle'; // idle | playing | ended
let _canvas   = null;
let _ctx      = null;
let _animId   = null;
let _lastTime = 0;
let _elapsed  = 0;
let _score    = 0;
let _spawnAcc = 0;
let _planetId = null;

// Объекты
let _lander    = { x: 0, y: 0 };
let _obstacles = [];
let _bonuses   = [];

// Ввод
let _keys      = {};
let _mousePos  = null; // { x, y } или null
let _isPaused  = false;

// ── Глобальный API ──────────────────────────────────────────────────────────

window._miniGame = {
    pause() {
        _isPaused = !_isPaused;
    },
    returnToPlanet() {
        window._spa?.goBack();
    },
    retry() {
        _reset();
        _startGame();
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store) {
    _planetId = store.sessionData?.planetId ?? null;

    _canvas = document.getElementById('minigame-canvas');
    if (!_canvas) return;

    // Размер canvas под контейнер
    const parent = _canvas.parentElement;
    _canvas.width  = parent.clientWidth;
    _canvas.height = parent.clientHeight;
    _ctx = _canvas.getContext('2d');

    // Слушатели
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
    _canvas.addEventListener('mousemove', _onMouseMove);
    _canvas.addEventListener('touchmove', _onTouchMove, { passive: false });

    // ResizeObserver
    _resizeObs = new ResizeObserver(() => {
        if (!_canvas) return;
        const p = _canvas.parentElement;
        _canvas.width  = p.clientWidth;
        _canvas.height = p.clientHeight;
    });
    _resizeObs.observe(parent);

    _startGame();
}

export function destroy() {
    _cleanup();
    delete window._miniGame;
}

let _resizeObs = null;

// ── Game Flow ───────────────────────────────────────────────────────────────

function _reset() {
    _elapsed   = 0;
    _score     = 0;
    _spawnAcc  = 0;
    _obstacles = [];
    _bonuses   = [];
    _keys      = {};
    _mousePos  = null;
    _isPaused  = false;
    _state     = 'idle';

    const overlay = document.getElementById('mg-result-overlay');
    if (overlay) overlay.classList.add('hidden');

    _setText('mg-score', '0');
    _setText('mg-timer', String(DURATION_S));
}

function _startGame() {
    _reset();
    _state = 'playing';

    // Центрируем lander
    _lander.x = _canvas.width / 2;
    _lander.y = _canvas.height * 0.75;

    _lastTime = performance.now();
    _animId = requestAnimationFrame(_gameLoop);
}

function _gameLoop(now) {
    if (_state !== 'playing') return;
    if (_isPaused) {
        _animId = requestAnimationFrame(_gameLoop);
        return;
    }

    const dt = Math.min((now - _lastTime) / 1000, 0.1);
    _lastTime = now;
    _elapsed += dt;

    const remaining = Math.max(0, DURATION_S - _elapsed);
    _setText('mg-timer', String(Math.ceil(remaining)));

    if (remaining <= 0) {
        _endGame(true);
        return;
    }

    // Спавн
    _spawnAcc += dt;
    if (_spawnAcc >= SPAWN_INTERVAL) {
        _spawnAcc -= SPAWN_INTERVAL;
        _spawnObjects();
    }

    // Движение игрока
    _moveLander(dt);

    // Движение объектов
    _moveObjects(dt);

    // Столкновения
    _checkCollisions();

    // Рендер
    _render();

    // HUD
    _setText('mg-score', String(_score));

    _animId = requestAnimationFrame(_gameLoop);
}

// ── Lander Movement ─────────────────────────────────────────────────────────

function _moveLander(dt) {
    const speed = 280 * dt;

    if (_mousePos) {
        // Плавное следование за мышью
        const dx = _mousePos.x - _lander.x;
        const dy = _mousePos.y - _lander.y;
        _lander.x += dx * 0.12;
        _lander.y += dy * 0.12;
    } else {
        if (_keys['KeyA'] || _keys['ArrowLeft'])  _lander.x -= speed;
        if (_keys['KeyD'] || _keys['ArrowRight']) _lander.x += speed;
        if (_keys['KeyW'] || _keys['ArrowUp'])    _lander.y -= speed;
        if (_keys['KeyS'] || _keys['ArrowDown'])  _lander.y += speed;
    }

    // Границы
    _lander.x = Math.max(LANDER_SIZE, Math.min(_canvas.width  - LANDER_SIZE, _lander.x));
    _lander.y = Math.max(LANDER_SIZE, Math.min(_canvas.height - LANDER_SIZE, _lander.y));
}

// ── Objects ─────────────────────────────────────────────────────────────────

function _spawnObjects() {
    const w = _canvas.width;

    // Помеха (всегда)
    const r = OBSTACLE_MIN_R + Math.random() * (OBSTACLE_MAX_R - OBSTACLE_MIN_R);
    _obstacles.push({
        x: Math.random() * w,
        y: -r * 2,
        r,
        speed: OBJ_SPEED_BASE + Math.random() * 80 + _elapsed * 2, // ускорение со временем
        angle: 0,
    });

    // Бонус (50% шанс)
    if (Math.random() < 0.5) {
        _bonuses.push({
            x: Math.random() * w,
            y: -BONUS_SIZE * 2,
            speed: OBJ_SPEED_BASE * 0.8 + Math.random() * 40,
            pulse: 0,
        });
    }
}

function _moveObjects(dt) {
    const h = _canvas.height;

    _obstacles.forEach(o => {
        o.y += o.speed * dt;
        o.angle += dt * 2;
    });
    _obstacles = _obstacles.filter(o => o.y < h + 50);

    _bonuses.forEach(b => {
        b.y += b.speed * dt;
        b.pulse += dt * 4;
    });
    _bonuses = _bonuses.filter(b => b.y < h + 50);
}

function _checkCollisions() {
    const lx = _lander.x, ly = _lander.y;
    const lr = LANDER_SIZE * 0.6;

    // Помехи → проигрыш
    for (const o of _obstacles) {
        const dist = Math.hypot(o.x - lx, o.y - ly);
        if (dist < lr + o.r) {
            _endGame(false);
            return;
        }
    }

    // Бонусы → очки
    _bonuses = _bonuses.filter(b => {
        const dist = Math.hypot(b.x - lx, b.y - ly);
        if (dist < lr + BONUS_SIZE) {
            _score += SCORE_PER_BONUS;
            return false;
        }
        return true;
    });
}

// ── Рендеринг (Canvas 2D) ──────────────────────────────────────────────────

function _render() {
    const w = _canvas.width, h = _canvas.height;

    // Фон
    _ctx.fillStyle = COLORS.bg;
    _ctx.fillRect(0, 0, w, h);

    // Сетка
    _ctx.strokeStyle = COLORS.grid;
    _ctx.lineWidth = 1;
    const gridSize = 40;
    const offset = (_elapsed * 30) % gridSize;
    for (let y = offset; y < h; y += gridSize) {
        _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(w, y); _ctx.stroke();
    }
    for (let x = 0; x < w; x += gridSize) {
        _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, h); _ctx.stroke();
    }

    // Помехи
    _obstacles.forEach(o => {
        _ctx.save();
        _ctx.translate(o.x, o.y);
        _ctx.rotate(o.angle);
        _ctx.fillStyle = COLORS.obstacle;
        _ctx.beginPath();
        // Неправильный многоугольник (астероид)
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r2 = o.r * (0.7 + Math.random() * 0.3);
            const px = Math.cos(a) * r2;
            const py = Math.sin(a) * r2;
            i === 0 ? _ctx.moveTo(px, py) : _ctx.lineTo(px, py);
        }
        _ctx.closePath();
        _ctx.fill();
        _ctx.restore();
    });

    // Бонусы
    _bonuses.forEach(b => {
        const pulseFactor = 1 + Math.sin(b.pulse) * 0.15;
        const r = BONUS_SIZE * pulseFactor;

        // Свечение
        _ctx.beginPath();
        _ctx.arc(b.x, b.y, r * 1.8, 0, Math.PI * 2);
        _ctx.fillStyle = COLORS.bonusGlow;
        _ctx.fill();

        // Ромбик
        _ctx.beginPath();
        _ctx.moveTo(b.x, b.y - r);
        _ctx.lineTo(b.x + r * 0.6, b.y);
        _ctx.lineTo(b.x, b.y + r);
        _ctx.lineTo(b.x - r * 0.6, b.y);
        _ctx.closePath();
        _ctx.fillStyle = COLORS.bonus;
        _ctx.fill();
    });

    // Lander
    // Свечение
    _ctx.beginPath();
    _ctx.arc(_lander.x, _lander.y, LANDER_SIZE * 1.5, 0, Math.PI * 2);
    _ctx.fillStyle = COLORS.landerGlow;
    _ctx.fill();

    // Треугольник (модуль посадки)
    _ctx.beginPath();
    _ctx.moveTo(_lander.x, _lander.y - LANDER_SIZE);
    _ctx.lineTo(_lander.x + LANDER_SIZE * 0.7, _lander.y + LANDER_SIZE * 0.5);
    _ctx.lineTo(_lander.x - LANDER_SIZE * 0.7, _lander.y + LANDER_SIZE * 0.5);
    _ctx.closePath();
    _ctx.fillStyle = COLORS.lander;
    _ctx.fill();

    // «Пламя» двигателя
    const flameH = 8 + Math.random() * 6;
    _ctx.beginPath();
    _ctx.moveTo(_lander.x - 6, _lander.y + LANDER_SIZE * 0.5);
    _ctx.lineTo(_lander.x + 6, _lander.y + LANDER_SIZE * 0.5);
    _ctx.lineTo(_lander.x, _lander.y + LANDER_SIZE * 0.5 + flameH);
    _ctx.closePath();
    _ctx.fillStyle = '#fbbf24';
    _ctx.fill();
}

// ── End Game ────────────────────────────────────────────────────────────────

async function _endGame(survived) {
    _state = 'ended';
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;

    // Бонус за выживание
    if (survived) {
        const timeBonus = Math.ceil(DURATION_S - _elapsed) * SCORE_TIME_MULT;
        _score += timeBonus;
    }

    const passed = survived && _score >= 100;

    // Отправляем результат на сервер
    let reward = null;
    try {
        const resp = await fetch('/game?handler=MiniGameResult', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'RequestVerificationToken': document.querySelector('input[name="__RequestVerificationToken"]')?.value ?? ''
            },
            body: JSON.stringify({
                planetId: _planetId,
                score: _score,
                timeMs: Math.round(_elapsed * 1000),
                passed
            })
        });
        if (resp.ok) reward = await resp.json();
    } catch (e) {
        console.warn('[MiniGame] server submit failed:', e);
    }

    // Зачисляем награды в store
    if (reward?.valid && reward.crystals) {
        dispatch('EARN_CRYSTALS', { earned: reward.crystals });
    }
    if (reward?.badges?.length) {
        reward.badges.forEach(b => dispatch('ADD_BADGE', { badge: b }));
    }

    // Обновляем статистику
    dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });

    // Показываем оверлей результатов
    _showResults(passed, reward);
}

function _showResults(passed, reward) {
    const overlay = document.getElementById('mg-result-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    _setText('mg-result-icon',  passed ? '🎉' : '💥');
    _setText('mg-result-title', passed ? 'Посадка выполнена!' : 'Посадка провалена!');

    const textParts = [`Счёт: ${_score}`];
    if (passed) textParts.push(`⏱ Время: ${(_elapsed).toFixed(1)}с`);
    _setText('mg-result-text', textParts.join('  •  '));

    // Бейджи наград
    const badgesEl = document.getElementById('mg-reward-badges');
    if (badgesEl && reward?.valid) {
        const crystalBadges = Object.entries(reward.crystals ?? {})
            .map(([dir, n]) => `<span class="crystal-badge">💎 ${dir} ×${n}</span>`)
            .join('');
        const achBadges = (reward.badges ?? [])
            .map(b => `<span class="crystal-badge">⭐ ${b}</span>`)
            .join('');
        badgesEl.innerHTML = crystalBadges + achBadges;
    } else if (badgesEl) {
        badgesEl.innerHTML = passed
            ? '<span class="crystal-badge" style="opacity:0.5;">Нет дополнительных наград</span>'
            : '';
    }
}

// ── Ввод ────────────────────────────────────────────────────────────────────

function _onKeyDown(e) { _keys[e.code] = true; _mousePos = null; }
function _onKeyUp(e)   { _keys[e.code] = false; }

function _onMouseMove(e) {
    const rect = _canvas.getBoundingClientRect();
    _mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function _onTouchMove(e) {
    e.preventDefault();
    if (!e.touches.length) return;
    const rect = _canvas.getBoundingClientRect();
    const t = e.touches[0];
    _mousePos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function _cleanup() {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';

    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }

    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
    if (_canvas) {
        _canvas.removeEventListener('mousemove', _onMouseMove);
        _canvas.removeEventListener('touchmove', _onTouchMove);
    }
}

/**
 * screenFlight.js — Экран полёта: сбор кристаллов в астероидном поясе
 *
 * Стейты:
 *   1. COUNTDOWN  — обратный отсчёт 3..2..1
 *   2. PLAYING    — активный геймплей (60 сек)
 *   3. RESULTS    — итоги полёта
 */

import { dispatch, getStore, transition, Screen } from '../stateManager.js';
import { switchScene } from '../threeScene.js';
import { loadModel } from '../gltfLoader.js';

const FLIGHT_DURATION_S = 60;

const CRYSTAL_TYPES = [
    { id: 'it',      color: 0x4fc3f7, emoji: '💎' },
    { id: 'bio',     color: 0x4ade80, emoji: '🧬' },
    { id: 'math',    color: 0xfbbf24, emoji: '🔢' },
    { id: 'design',  color: 0xf472b6, emoji: '🎨' },
    { id: 'eco',     color: 0x34d399, emoji: '🌿' },
    { id: 'med',     color: 0xf87171, emoji: '❤️' },
    { id: 'physics', color: 0xa78bfa, emoji: '⚛️' },
    { id: 'neuro',   color: 0xc084fc, emoji: '🧠' },
];

// ── внутреннее состояние ────────────────────────
let _state     = 'idle'; // idle | countdown | playing | results
let _animId    = null;
let _elapsed   = 0;
let _shield    = 100;
let _collected = {};
let _shipModel = null;
let _asteroids = [];
let _crystals  = [];
let _keys      = {};
let _lastTime  = 0;

// Размеры игрового поля
const FIELD_W = 16;
const FIELD_H = 10;
const FIELD_D = 300; // глубина тоннеля
const SHIP_SPEED = 12;
const BOOST_MULT = 2.2;

// ── Публичный API (onclick из CSHTML) ───────────
window._flightScreen = {
    restart() {
        _cleanup();
        _startCountdown();
    }
};

// ── Lifecycle ───────────────────────────────────

export async function init(store) {
    _state = 'idle';
    _collected = {};
    _shield = 100;
    _elapsed = 0;
    _keys = {};

    // Переключаем Three.js на сцену полёта
    await switchScene('flight');

    // Загружаем модель корабля
    try {
        _shipModel = await loadModel('/models/ship.glb');
        _shipModel.scale.set(0.5, 0.5, 0.5);
        _shipModel.position.set(0, 0, 0);
        if (window.__threeScene) {
            window.__threeScene.add(_shipModel);
        }
    } catch (e) {
        console.warn('[Flight] ship.glb not loaded, using fallback');
        _shipModel = _createFallbackShip();
        if (window.__threeScene) {
            window.__threeScene.add(_shipModel);
        }
    }

    // Слушаем клавиатуру
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup', _onKeyUp);

    _startCountdown();
}

export function destroy() {
    _cleanup();
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup', _onKeyUp);
}

// ── Countdown ───────────────────────────────────

function _startCountdown() {
    _state = 'countdown';
    const overlay = document.getElementById('flight-countdown');
    const numberEl = document.getElementById('countdown-number');
    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');

    if (overlay)  overlay.classList.remove('hidden');
    if (hudEl)    hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');

    let count = 3;
    if (numberEl) numberEl.textContent = String(count);

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            if (numberEl) numberEl.textContent = String(count);
        } else {
            clearInterval(interval);
            if (numberEl) numberEl.textContent = 'СТАРТ!';
            setTimeout(() => {
                if (overlay) overlay.classList.add('hidden');
                _startPlaying();
            }, 500);
        }
    }, 1000);
}

// ── Playing ─────────────────────────────────────

function _startPlaying() {
    _state = 'playing';
    _elapsed = 0;
    _shield = 100;
    _collected = {};
    _lastTime = performance.now();

    const hudEl = document.getElementById('flight-hud');
    if (hudEl) hudEl.classList.remove('hidden');

    _updateHud();
    _spawnWave();
    _animId = requestAnimationFrame(_gameLoop);
}

function _gameLoop(now) {
    if (_state !== 'playing') return;

    const dt = Math.min((now - _lastTime) / 1000, 0.1); // cap delta
    _lastTime = now;
    _elapsed += dt;

    // Таймер
    const remaining = Math.max(0, FLIGHT_DURATION_S - _elapsed);
    _setText('flight-timer', String(Math.ceil(remaining)));

    if (remaining <= 0) {
        _endFlight();
        return;
    }

    // Движение корабля
    _moveShip(dt);

    // Движение объектов
    _moveObjects(dt);

    // Проверка столкновений
    _checkCollisions();

    // Щиты
    if (_shield <= 0) {
        _endFlight();
        return;
    }

    // Спавн новой волны
    if (Math.random() < 0.04) _spawnWave();

    _animId = requestAnimationFrame(_gameLoop);
}

function _moveShip(dt) {
    if (!_shipModel) return;
    const boost = _keys['Space'] ? BOOST_MULT : 1;
    const speed = SHIP_SPEED * boost * dt;

    if (_keys['KeyA'] || _keys['ArrowLeft'])  _shipModel.position.x -= speed;
    if (_keys['KeyD'] || _keys['ArrowRight']) _shipModel.position.x += speed;
    if (_keys['KeyW'] || _keys['ArrowUp'])    _shipModel.position.y += speed;
    if (_keys['KeyS'] || _keys['ArrowDown'])  _shipModel.position.y -= speed;

    // Ограничения поля
    _shipModel.position.x = Math.max(-FIELD_W / 2, Math.min(FIELD_W / 2, _shipModel.position.x));
    _shipModel.position.y = Math.max(-FIELD_H / 2, Math.min(FIELD_H / 2, _shipModel.position.y));

    // Небольшой крен при повороте
    const targetRoll = (_keys['KeyA'] || _keys['ArrowLeft']) ? 0.3
        : (_keys['KeyD'] || _keys['ArrowRight']) ? -0.3 : 0;
    _shipModel.rotation.z += (targetRoll - _shipModel.rotation.z) * 0.1;
}

function _moveObjects(dt) {
    const speed = 25 * dt;
    const scene = window.__threeScene;
    if (!scene) return;

    // Двигаем астероиды и кристаллы к камере (отриц. z)
    [..._asteroids, ..._crystals].forEach(obj => {
        obj.position.z += speed;
        // Вращение
        obj.rotation.x += dt * 0.5;
        obj.rotation.y += dt * 0.3;
    });

    // Убираем объекты, пролетевшие мимо
    _asteroids = _asteroids.filter(a => {
        if (a.position.z > 10) { scene.remove(a); return false; }
        return true;
    });
    _crystals = _crystals.filter(c => {
        if (c.position.z > 10) { scene.remove(c); return false; }
        return true;
    });
}

function _checkCollisions() {
    if (!_shipModel) return;
    const sp = _shipModel.position;
    const hitR = 1.2;

    // Кристаллы
    _crystals = _crystals.filter(c => {
        const dist = sp.distanceTo(c.position);
        if (dist < hitR + 0.6) {
            const type = c.userData.crystalType || 'any';
            _collected[type] = (_collected[type] || 0) + 1;
            _updateHud();
            const scene = window.__threeScene;
            if (scene) scene.remove(c);
            return false;
        }
        return true;
    });

    // Астероиды
    _asteroids.forEach(a => {
        const dist = sp.distanceTo(a.position);
        if (dist < hitR + 0.8 && !a.userData._hit) {
            a.userData._hit = true;
            _shield = Math.max(0, _shield - 20);
            _updateShieldBar();
        }
    });
}

function _spawnWave() {
    const THREE = window.THREE;
    const scene = window.__threeScene;
    if (!THREE || !scene) return;

    // 2–4 астероида
    const aCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < aCount; i++) {
        const geo = new THREE.IcosahedronGeometry(0.4 + Math.random() * 0.6, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x555566,
            roughness: 0.9,
            metalness: 0.2,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        _asteroids.push(mesh);
    }

    // 1–3 кристалла
    const cCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < cCount; i++) {
        const ct = CRYSTAL_TYPES[Math.floor(Math.random() * CRYSTAL_TYPES.length)];
        const geo = new THREE.OctahedronGeometry(0.3, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: ct.color,
            emissive: ct.color,
            emissiveIntensity: 0.6,
            roughness: 0.2,
            metalness: 0.8,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        mesh.userData.crystalType = ct.id;
        scene.add(mesh);
        _crystals.push(mesh);
    }
}

// ── End Flight ──────────────────────────────────

function _endFlight() {
    _state = 'results';
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;

    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    // Записываем собранные кристаллы в стор
    const totalCollected = Object.values(_collected).reduce((a, b) => a + b, 0);
    if (totalCollected > 0) {
        dispatch('EARN_CRYSTALS', { earned: { ..._collected } });
    }

    // Рендерим результаты
    const statsEl = document.getElementById('flight-results-stats');
    if (statsEl) {
        const lines = Object.entries(_collected).map(([type, n]) => {
            const ct = CRYSTAL_TYPES.find(c => c.id === type);
            return `<div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${ct?.emoji ?? '💎'} ${type.toUpperCase()}</span>
                <span style="font-family:var(--font-display);color:var(--color-primary);">+${n}</span>
            </div>`;
        });

        if (lines.length === 0) {
            lines.push('<p style="color:var(--color-text-muted);">Кристаллы не собраны. Попробуй ещё!</p>');
        }

        lines.push(`<div style="border-top:1px solid var(--color-border);padding-top:0.5rem;display:flex;justify-content:space-between;">
            <span>🛡 Щиты</span>
            <span style="color:${_shield > 50 ? '#4ade80' : '#f87171'};">${_shield}%</span>
        </div>`);

        statsEl.innerHTML = lines.join('');
    }
}

// ── Helpers ─────────────────────────────────────

function _updateHud() {
    const total = Object.values(_collected).reduce((a, b) => a + b, 0);
    _setText('flight-crystals-count', String(total));
    _updateShieldBar();
}

function _updateShieldBar() {
    const bar = document.getElementById('flight-shield-bar');
    if (bar) bar.style.width = `${_shield}%`;
}

function _setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function _createFallbackShip() {
    const THREE = window.THREE;
    if (!THREE) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4fc3f7, metalness: 0.7, roughness: 0.3 })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const wing = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.05, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x818cf8, metalness: 0.5, roughness: 0.4 })
    );
    wing.position.z = 0.3;
    group.add(wing);
    return group;
}

function _onKeyDown(e) { _keys[e.code] = true; }
function _onKeyUp(e)   { _keys[e.code] = false; }

function _cleanup() {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';
    _keys = {};

    const scene = window.__threeScene;
    if (scene) {
        [..._asteroids, ..._crystals].forEach(obj => scene.remove(obj));
        if (_shipModel) scene.remove(_shipModel);
    }
    _asteroids = [];
    _crystals = [];
    _shipModel = null;
}

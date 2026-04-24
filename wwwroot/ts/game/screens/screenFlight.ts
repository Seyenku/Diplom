/**
 * screenFlight.ts — Экран полёта: сбор кристаллов в астероидном поясе
 *
 * Стейты:
 *   1. COUNTDOWN  — обратный отсчёт 3..2..1
 *   2. PLAYING    — активный геймплей (60 сек)
 *   3. RESULTS    — итоги полёта
 *
 * Кристаллы одного типа — определяется из sessionData.crystalType (regionId).
 */

import * as THREE from 'three';
import { dispatch, getStore, transition, Screen } from '../stateManager.js';
import { switchScene, renderer as globalRenderer } from '../threeScene.js';
import { loadModel } from '../gltfLoader.js';
import { GameStore, CrystalType, ClusterType } from '../types.js';
import { getProfile, onQualityChange, offQualityChange } from '../qualityPresets.js';
import { applyShipColor, createFallbackShip } from '../shipUtils.js';
import { CRYSTAL_COLORS } from '../clusterConfig.js';
import { playSfx, playMusic } from '../audioManager.js';
import { getMovementVector, isBoostPressed, getPointerPosition } from '../inputManager.js';

const FLIGHT_DURATION_S = 60;

// ── внутреннее состояние ────────────────────────
type FlightState = 'idle' | 'countdown' | 'playing' | 'results';

let _state: FlightState = 'idle';
let _animId: number | null = null;
let _elapsed = 0;
let _shield = 100;
let _collected = 0;      // количество собранных кристаллов
let _crystalType: CrystalType = 'programming';
let _shipModel: THREE.Group | null = null;
let _asteroids: THREE.Object3D[] = [];
let _crystals: THREE.Object3D[] = [];
let _lastTime = 0;
let _velocity = new THREE.Vector2(0, 0);

// Shared GPU resources (created once per init)
let _asteroidGeo: THREE.IcosahedronGeometry | null = null;
let _asteroidMat: THREE.MeshStandardMaterial | null = null;
let _crystalGeo: THREE.OctahedronGeometry | null = null;
let _crystalMat: THREE.MeshStandardMaterial | null = null;

// Размеры игрового поля
const FIELD_W = 16;
const FIELD_H = 10;
const FIELD_D = 300; // глубина тоннеля
const SHIP_SPEED = 12;
const BOOST_MULT = 2.2;

// ── Публичный API (onclick из CSHTML) ───────────
window._flightScreen = {
    restart() {
        if (_animId) cancelAnimationFrame(_animId);
        _animId = null;
        
        const scene = window.__threeScene;
        if (scene) {
            [..._asteroids, ..._crystals].forEach(obj => scene.remove(obj));
        }
        _asteroids = [];
        _crystals = [];
        _velocity.set(0, 0);
        
        if (_shipModel) {
            _shipModel.position.set(0, 0, 0);
            _shipModel.rotation.set(0, 0, 0);
        }
        
        _startCountdown();
    }
};

// ── Lifecycle ───────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    _state = 'idle';
    _collected = 0;
    _shield = 100;
    _elapsed = 0;
    _velocity.set(0, 0);

    // Тип кристаллов из sessionData (установлен Galaxy Map)
    _crystalType = (store.sessionData?.crystalType ?? 'programming') as CrystalType;
    const selectedShipColor = store.player?.shipColor ?? '#4fc3f7';

    // Обновляем UI-индикатор типа кристаллов
    const ct = CRYSTAL_COLORS[_crystalType] ?? CRYSTAL_COLORS.programming;
    const typeEl = document.getElementById('flight-crystal-type');
    if (typeEl) typeEl.textContent = `${ct.emoji} ${ct.label}`;

    // Переключаем Three.js на сцену полёта
    await switchScene('flight');

    // Загружаем модель корабля, оборачиваем в Group
    _shipModel = new THREE.Group();
    _shipModel.position.set(0, 0, 0);

    try {
        const mesh = await loadModel('/models/ship.glb');
        mesh.scale.set(0.5, 0.5, 0.5);
        mesh.rotation.y = -Math.PI / 2; // модель экспортирована носом по X → корректируем на -Z
        _shipModel.add(mesh);
    } catch (e) {
        console.warn('[Flight] ship.glb not loaded, using fallback');
        const fallback = createFallbackShip();
        if (fallback) _shipModel.add(fallback);
    }
    applyShipColor(_shipModel, selectedShipColor);

    if (window.__threeScene) {
        window.__threeScene.add(_shipModel);
    }

    // Создаём общие GPU-ресурсы (переиспользуются при каждом спавне)
    _asteroidGeo = new THREE.IcosahedronGeometry(0.5, 1);
    _asteroidMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9, metalness: 0.2 });
    _crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
    _crystalMat = new THREE.MeshStandardMaterial({
        color: ct.color, emissive: ct.color, emissiveIntensity: 0.6,
        roughness: 0.2, metalness: 0.8,
    });

    _startCountdown();

    // Подписка на смену качества (только pixelRatio, чтобы не сбрасывать прогресс)
    onQualityChange(_onFlightQualityChanged);

    playMusic('ambient_flight');
}

export function destroy(): void {
    offQualityChange(_onFlightQualityChanged);
    _cleanup();
}

/** Применяем только pixelRatio — переинициализация сцены в середине раунда сбросит прогресс */
function _onFlightQualityChanged(): void {
    if (_state !== 'playing' && _state !== 'countdown') return;
    const profile = getProfile();
    if (globalRenderer) globalRenderer.setPixelRatio(profile.pixelRatio);
}

// ── Countdown ───────────────────────────────────

function _startCountdown(): void {
    _state = 'countdown';
    const overlay = document.getElementById('flight-countdown');
    const numberEl = document.getElementById('countdown-number');
    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');

    if (overlay) overlay.classList.remove('hidden');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');

    let count = 3;
    if (numberEl) numberEl.textContent = String(count);
    playSfx('countdown_tick');

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            if (numberEl) numberEl.textContent = String(count);
            playSfx('countdown_tick');
        } else {
            clearInterval(interval);
            if (numberEl) numberEl.textContent = 'СТАРТ!';
            playSfx('countdown_go');
            setTimeout(() => {
                if (overlay) overlay.classList.add('hidden');
                _startPlaying();
            }, 500);
        }
    }, 1000);
}

// ── Playing ─────────────────────────────────────

function _startPlaying(): void {
    _state = 'playing';
    _elapsed = 0;
    _shield = 100;
    _collected = 0;
    _lastTime = performance.now();

    const hudEl = document.getElementById('flight-hud');
    if (hudEl) hudEl.classList.remove('hidden');

    _updateHud();
    _spawnWave();
    _animId = requestAnimationFrame(_gameLoop);
}

function _gameLoop(now: number): void {
    if (_state !== 'playing') return;

    const dt = Math.min((now - _lastTime) / 1000, 0.1);
    _lastTime = now;
    _elapsed += dt;

    const remaining = Math.max(0, FLIGHT_DURATION_S - _elapsed);
    _setText('flight-timer', String(Math.ceil(remaining)));

    if (remaining <= 0) {
        _endFlight();
        return;
    }

    _moveShip(dt);
    _moveObjects(dt);
    _checkCollisions();

    if (_shield <= 0) {
        _endFlight();
        return;
    }

    if (Math.random() < getProfile().spawnChancePerFrame) _spawnWave();

    _animId = requestAnimationFrame(_gameLoop);
}

function _moveShip(dt: number): void {
    if (!_shipModel) return;
    const boost = isBoostPressed() ? BOOST_MULT : 1;
    const maxSpeed = SHIP_SPEED * boost;
    const accel = 40 * boost;
    const drag = 0.92;

    const move = getMovementVector();
    const pointer = getPointerPosition();

    if (pointer) {
        // Ограничиваем курсор размерами поля
        const targetX = pointer.x * (FIELD_W / 2);
        const targetY = pointer.y * (FIELD_H / 2);
        
        const dx = targetX - _shipModel.position.x;
        const dy = targetY - _shipModel.position.y;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.1) {
            const dirX = dx / dist;
            const dirY = dy / dist;
            // Ускоряемся к курсору, чем дальше — тем сильнее тяга, но не выше accel
            const thrust = Math.min(dist * 8, accel);
            _velocity.x += dirX * thrust * dt;
            _velocity.y += dirY * thrust * dt;
        }
    } else if (move.lengthSq() > 0) {
        _velocity.x += move.x * accel * dt;
        _velocity.y += move.y * accel * dt;
    }

    // Искусственное трение (затухание)
    const dragFactor = Math.pow(drag, dt * 60);
    _velocity.x *= dragFactor;
    _velocity.y *= dragFactor;

    // Ограничение скорости
    if (_velocity.lengthSq() > maxSpeed * maxSpeed) {
        _velocity.normalize().multiplyScalar(maxSpeed);
    }

    // Применение скорости к позиции
    _shipModel.position.x += _velocity.x * dt;
    _shipModel.position.y += _velocity.y * dt;

    _shipModel.position.x = Math.max(-FIELD_W / 2, Math.min(FIELD_W / 2, _shipModel.position.x));
    _shipModel.position.y = Math.max(-FIELD_H / 2, Math.min(FIELD_H / 2, _shipModel.position.y));

    // Крен (roll) и тангаж (pitch) от скорости (от -1 до 1)
    const rollIntensity = _velocity.x / maxSpeed;
    const pitchIntensity = _velocity.y / maxSpeed;

    const targetRoll = -rollIntensity * 0.4;
    const targetPitch = pitchIntensity * 0.2;

    // Плавная интерполяция
    _shipModel.rotation.z += (targetRoll - _shipModel.rotation.z) * (dt * 6);
    _shipModel.rotation.x += (targetPitch - _shipModel.rotation.x) * (dt * 6);
}

function _moveObjects(dt: number): void {
    const speed = 25 * dt;
    const scene = window.__threeScene;
    if (!scene) return;

    [..._asteroids, ..._crystals].forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 0.5;
        obj.rotation.y += dt * 0.3;
    });

    _asteroids = _asteroids.filter(a => {
        if (a.position.z > 10) { scene.remove(a); return false; }
        return true;
    });
    _crystals = _crystals.filter(c => {
        if (c.position.z > 10) { scene.remove(c); return false; }
        return true;
    });
}

function _checkCollisions(): void {
    if (!_shipModel) return;
    const sp = _shipModel.position;
    const crystalThresholdSq = (1.2 + 0.6) ** 2;
    const asteroidThresholdSq = (1.2 + 0.8) ** 2;

    _crystals = _crystals.filter(c => {
        const dist2 = sp.distanceToSquared(c.position);
        if (dist2 < crystalThresholdSq) {
            _collected++;
            _updateHud();
            playSfx('crystal_collect');
            const scene = window.__threeScene;
            if (scene) scene.remove(c);
            return false;
        }
        return true;
    });

    _asteroids.forEach(a => {
        const dist2 = sp.distanceToSquared(a.position);
        if (dist2 < asteroidThresholdSq && !(a as THREE.Object3D & { userData: { _hit?: boolean } }).userData._hit) {
            (a as THREE.Object3D & { userData: { _hit?: boolean } }).userData._hit = true;
            _shield = Math.max(0, _shield - 20);
            _updateShieldBar();
            playSfx('asteroid_hit');
            if (_shield <= 30 && _shield > 0) {
                playSfx('shield_warning');
            }
        }
    });
}

function _spawnWave(): void {
    const scene = window.__threeScene;
    if (!THREE || !scene || !_asteroidGeo || !_asteroidMat || !_crystalGeo || !_crystalMat) return;

    // 2–4 астероида (переиспользуем общие Geo/Mat)
    const aCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < aCount; i++) {
        const mesh = new THREE.Mesh(_asteroidGeo, _asteroidMat);
        mesh.scale.setScalar(0.8 + Math.random() * 1.2);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        _asteroids.push(mesh);
    }

    // 1–3 кристалла (все одного типа, общие Geo/Mat)
    const cCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < cCount; i++) {
        const mesh = new THREE.Mesh(_crystalGeo, _crystalMat);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        _crystals.push(mesh);
    }
}

// ── End Flight ──────────────────────────────────

function _endFlight(): void {
    _state = 'results';
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;

    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    // Записываем собранные кристаллы (одного типа)
    if (_collected > 0) {
        dispatch('EARN_CRYSTALS', { earned: { [_crystalType]: _collected } as Record<CrystalType, number> });
        playSfx('flight_end_success');
    } else {
        playSfx('flight_end_fail');
    }

    // Рендерим результаты
    const ct = CRYSTAL_COLORS[_crystalType] ?? CRYSTAL_COLORS.programming;
    const statsEl = document.getElementById('flight-results-stats');
    if (statsEl) {
        const lines: string[] = [];

        if (_collected > 0) {
            lines.push(`<div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${ct.emoji} ${ct.label}</span>
                <span style="font-family:var(--font-display);color:var(--color-primary);">+${_collected}</span>
            </div>`);
        } else {
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

function _updateHud(): void {
    _setText('flight-crystals-count', String(_collected));
    _updateShieldBar();
}

function _updateShieldBar(): void {
    const bar = document.getElementById('flight-shield-bar');
    if (bar) (bar as HTMLElement).style.width = `${_shield}%`;
}

function _setText(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

// _applyShipColor и _createFallbackShip вынесены в shipUtils.ts

function _cleanup(): void {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';

    const scene = window.__threeScene;
    if (scene) {
        [..._asteroids, ..._crystals].forEach(obj => scene.remove(obj));
        if (_shipModel) scene.remove(_shipModel);
    }
    _asteroids = [];
    _crystals = [];
    _shipModel = null;
    _velocity.set(0, 0);

    // Dispose shared GPU resources
    _asteroidGeo?.dispose(); _asteroidGeo = null;
    _asteroidMat?.dispose(); _asteroidMat = null;
    _crystalGeo?.dispose();  _crystalGeo = null;
    _crystalMat?.dispose();  _crystalMat = null;
}

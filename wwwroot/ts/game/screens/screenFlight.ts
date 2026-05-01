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

// ── Константы ────────────────────────────────────
const WAVE_DURATION_S = 20;
const WAVE_COUNT = 3;
const FLIGHT_DURATION_S = WAVE_DURATION_S * WAVE_COUNT; // 60s total

const FIELD_W = 16;
const FIELD_H = 10;
const FIELD_D = 300;
const BASE_SHIP_SPEED = 12;
const BOOST_MULT = 2.2;
const BASE_SHIELD = 100;
const BASE_OBJ_SPEED = 25;

// Волновые множители [wave0, wave1, wave2]
const WAVE_SPEED_MULT  = [1.0, 1.35, 1.8];
const WAVE_SPAWN_MULT  = [1.0, 1.4, 2.0];
const WAVE_ASTEROID_COUNT = [2, 3, 4]; // мин. астероидов
const WAVE_ASTEROID_EXTRA = [2, 3, 3]; // доп. случайных
const WAVE_CRYSTAL_COUNT  = [1, 2, 2];
const WAVE_CRYSTAL_EXTRA  = [2, 2, 3];

// ── Внутреннее состояние ────────────────────────
type FlightState = 'idle' | 'countdown' | 'playing' | 'results';

let _state: FlightState = 'idle';
let _animId: number | null = null;
let _elapsed = 0;
let _shield = 100;
let _maxShield = 100;
let _collected = 0;
let _crystalType: CrystalType = 'programming';
let _shipModel: THREE.Group | null = null;
let _asteroids: THREE.Object3D[] = [];
let _crystals: THREE.Object3D[] = [];
let _lastTime = 0;
let _velocity = new THREE.Vector2(0, 0);
let _currentWave = 0;

// Характеристики корабля (из store)
let _speedBonus = 0;
let _shieldBonus = 0;
let _scanRange = 1;
let _capacity = 1;

// Phase 2: Visual feedback state
let _iFramesRemaining = 0;   // секунды неуязвимости
let _hitStunRemaining = 0;   // секунды замедления
let _cameraShakeIntensity = 0;
const IFRAMES_DURATION = 1.5;
const HIT_STUN_DURATION = 0.4;
const HIT_STUN_TIMESCALE = 0.2;
const CAMERA_SHAKE_DECAY = 6;

// Shared GPU resources
let _asteroidGeo: THREE.IcosahedronGeometry | null = null;
let _asteroidMat: THREE.MeshStandardMaterial | null = null;
let _asteroidIceMat: THREE.MeshStandardMaterial | null = null;
let _crystalGeo: THREE.OctahedronGeometry | null = null;
let _crystalMat: THREE.MeshStandardMaterial | null = null;
let _megaCrystalMat: THREE.MeshStandardMaterial | null = null;
let _repairMat: THREE.MeshStandardMaterial | null = null;

// Phase 3: Bonus objects
let _bonuses: THREE.Object3D[] = [];

// Phase 4: Combo system
let _combo = 1;
let _maxCombo = 1;
let _comboTimer = 0;   // time since last crystal collect
const COMBO_TIMEOUT = 2.5; // seconds without pickup before combo resets
const MAX_COMBO = 5;
let _dodged = 0; // asteroids that passed the ship

// ── Публичный API (onclick из CSHTML) ───────────
window._flightScreen = {
    restart() {
        if (_animId) cancelAnimationFrame(_animId);
        _animId = null;
        
        const scene = window.__threeScene;
        if (scene) {
            [..._asteroids, ..._crystals, ..._bonuses].forEach(obj => scene.remove(obj));
        }
        _asteroids = [];
        _crystals = [];
        _bonuses = [];
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
    _elapsed = 0;
    _currentWave = 0;
    _velocity.set(0, 0);

    // ── Читаем характеристики корабля из store ──
    const stats = store.player?.shipStats;
    _speedBonus  = stats?.speedBonus  ?? 0; // 0–1+ (бонус к скорости)
    _shieldBonus = stats?.shieldBonus ?? 0; // 0–1+ (бонус к щиту)
    _scanRange   = stats?.scanRange   ?? 1; // 1+ (радиус магнита кристаллов)
    _capacity    = stats?.capacity    ?? 1; // 1+ (множитель добычи)

    _maxShield = BASE_SHIELD * (1 + _shieldBonus * 0.5); // +50% за каждый уровень
    _shield = _maxShield;

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
    _asteroidIceMat = new THREE.MeshStandardMaterial({ color: 0x88ccee, roughness: 0.3, metalness: 0.6, emissive: 0x224466, emissiveIntensity: 0.2 });
    _crystalGeo = new THREE.OctahedronGeometry(0.3, 0);
    _crystalMat = new THREE.MeshStandardMaterial({
        color: ct.color, emissive: ct.color, emissiveIntensity: 0.6,
        roughness: 0.2, metalness: 0.8,
    });
    _megaCrystalMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.9,
        roughness: 0.1, metalness: 0.9,
    });
    _repairMat = new THREE.MeshStandardMaterial({
        color: 0x4ade80, emissive: 0x4ade80, emissiveIntensity: 0.7,
        roughness: 0.15, metalness: 0.8,
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
    _shield = _maxShield;
    _collected = 0;
    _lastTime = performance.now();
    _iFramesRemaining = 0;
    _hitStunRemaining = 0;
    _cameraShakeIntensity = 0;
    _combo = 1;
    _maxCombo = 1;
    _comboTimer = 0;
    _dodged = 0;

    const hudEl = document.getElementById('flight-hud');
    if (hudEl) hudEl.classList.remove('hidden');

    _updateHud();
    _spawnWave();
    _animId = requestAnimationFrame(_gameLoop);
}

function _gameLoop(now: number): void {
    if (_state !== 'playing') return;

    const rawDt = Math.min((now - _lastTime) / 1000, 0.1);
    _lastTime = now;

    // Hit stun: замедление времени
    let timeScale = 1;
    if (_hitStunRemaining > 0) {
        timeScale = HIT_STUN_TIMESCALE;
        _hitStunRemaining -= rawDt;
    }
    const dt = rawDt * timeScale;
    _elapsed += dt;

    // i-frames countdown
    if (_iFramesRemaining > 0) {
        _iFramesRemaining -= rawDt; // real-time, not game-time
        // мигание корабля
        if (_shipModel) {
            _shipModel.visible = Math.floor(_iFramesRemaining * 10) % 2 === 0;
        }
    } else if (_shipModel && !_shipModel.visible) {
        _shipModel.visible = true;
    }

    // Camera shake decay
    if (_cameraShakeIntensity > 0) {
        _cameraShakeIntensity *= Math.max(0, 1 - CAMERA_SHAKE_DECAY * rawDt);
        if (_cameraShakeIntensity < 0.01) _cameraShakeIntensity = 0;
        _applyCameraShake();
    }

    // ── Определяем текущую волну ──
    const newWave = Math.min(Math.floor(_elapsed / WAVE_DURATION_S), WAVE_COUNT - 1);
    if (newWave !== _currentWave) {
        _currentWave = newWave;
    }

    const remaining = Math.max(0, FLIGHT_DURATION_S - _elapsed);
    _setText('flight-timer', String(Math.ceil(remaining)));

    // Обновляем прогресс-бар волны
    _updateWaveProgress();

    if (remaining <= 0) {
        _endFlight();
        return;
    }

    // Combo timeout
    _comboTimer += dt;
    if (_comboTimer > COMBO_TIMEOUT && _combo > 1) {
        _combo = 1;
        _updateComboDisplay();
    }

    _moveShip(dt);
    _moveObjects(dt);
    _checkCollisions();

    if (_shield <= 0) {
        _endFlight();
        return;
    }

    // Спавн зависит от волны
    const baseChance = getProfile().spawnChancePerFrame;
    const waveChance = baseChance * WAVE_SPAWN_MULT[_currentWave];
    if (Math.random() < waveChance) _spawnWave();

    _animId = requestAnimationFrame(_gameLoop);
}

function _moveShip(dt: number): void {
    if (!_shipModel) return;
    const boost = isBoostPressed() ? BOOST_MULT : 1;
    const shipSpeed = BASE_SHIP_SPEED * (1 + _speedBonus * 0.3); // +30% за уровень
    const maxSpeed = shipSpeed * boost;
    const accel = 40 * boost * (1 + _speedBonus * 0.15);
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
    const waveMult = WAVE_SPEED_MULT[_currentWave];
    const speed = BASE_OBJ_SPEED * waveMult * dt;
    const scene = window.__threeScene;
    if (!scene) return;

    // Двигаем астероиды
    _asteroids.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 0.5 * waveMult;
        obj.rotation.y += dt * 0.3 * waveMult;
    });

    // Двигаем кристаллы + магнит (scanRange)
    const sp = _shipModel?.position;
    _crystals.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 1.2;
        obj.rotation.y += dt * 0.8;

        // Магнит: если кристалл ближе scanRange*3 единиц — притягиваем
        if (sp) {
            const magnetRadius = _scanRange * 3;
            const dx = sp.x - obj.position.x;
            const dy = sp.y - obj.position.y;
            const dz = sp.z - obj.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < magnetRadius && dist > 0.1) {
                const pull = (1 - dist / magnetRadius) * 8 * dt;
                obj.position.x += dx / dist * pull;
                obj.position.y += dy / dist * pull;
                obj.position.z += dz / dist * pull;
            }
        }
    });

    _asteroids = _asteroids.filter(a => {
        if (a.position.z > 10) {
            scene.remove(a);
            // Count as dodged if it passed through without hitting
            if (!(a as any).userData._hit) _dodged++;
            return false;
        }
        return true;
    });
    _crystals = _crystals.filter(c => {
        if (c.position.z > 10) { scene.remove(c); return false; }
        return true;
    });
    // Move bonuses
    _bonuses.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.y += dt * 2;
        // Bonuses also magnetize toward ship
        if (sp) {
            const magnetRadius = _scanRange * 2.5;
            const dx = sp.x - obj.position.x;
            const dy = sp.y - obj.position.y;
            const dz = sp.z - obj.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < magnetRadius && dist > 0.1) {
                const pull = (1 - dist / magnetRadius) * 6 * dt;
                obj.position.x += dx / dist * pull;
                obj.position.y += dy / dist * pull;
                obj.position.z += dz / dist * pull;
            }
        }
    });
    _bonuses = _bonuses.filter(b => {
        if (b.position.z > 10) { scene.remove(b); return false; }
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
            const earned = Math.max(1, Math.floor(_capacity)) * _combo;
            _collected += earned;
            _comboTimer = 0;
            _combo = Math.min(MAX_COMBO, _combo + 1);
            if (_combo > _maxCombo) _maxCombo = _combo;
            _updateHud();
            _updateComboDisplay();
            _spawnFloatingText(c.position, `+${earned}`, _crystalMat?.color?.getHex() ?? 0x4fc3f7);
            playSfx('crystal_collect');
            _spawnCollectParticles(c.position, _crystalMat?.color?.getHex() ?? 0x4fc3f7);
            const scene = window.__threeScene;
            if (scene) scene.remove(c);
            return false;
        }
        return true;
    });

    // Bonus object collisions
    const bonusThresholdSq = (1.2 + 0.8) ** 2;
    _bonuses = _bonuses.filter(b => {
        const dist2 = sp.distanceToSquared(b.position);
        if (dist2 < bonusThresholdSq) {
            const bType = (b as any).userData._bonusType as string;
            if (bType === 'mega') {
                const earned = 5 * _combo;
                _collected += earned;
                _spawnFloatingText(b.position, `+${earned} ★`, 0xfbbf24);
                _spawnCollectParticles(b.position, 0xfbbf24);
                playSfx('crystal_collect');
            } else if (bType === 'repair') {
                const heal = _maxShield * 0.25;
                _shield = Math.min(_maxShield, _shield + heal);
                _updateShieldBar();
                _spawnFloatingText(b.position, '+25% 🛡', 0x4ade80);
                _spawnCollectParticles(b.position, 0x4ade80);
                playSfx('crystal_collect');
            }
            _updateHud();
            const scene = window.__threeScene;
            if (scene) scene.remove(b);
            return false;
        }
        return true;
    });

    _asteroids.forEach(a => {
        const dist2 = sp.distanceToSquared(a.position);
        if (dist2 < asteroidThresholdSq && !(a as THREE.Object3D & { userData: { _hit?: boolean } }).userData._hit) {
            // Skip if invulnerable
            if (_iFramesRemaining > 0) return;

            (a as THREE.Object3D & { userData: { _hit?: boolean } }).userData._hit = true;
            _shield = Math.max(0, _shield - 20);
            _updateShieldBar();
            playSfx('asteroid_hit');
            if (_shield <= _maxShield * 0.3 && _shield > 0) {
                playSfx('shield_warning');
            }

            // Phase 2: Visual feedback
            _iFramesRemaining = IFRAMES_DURATION;
            _hitStunRemaining = HIT_STUN_DURATION;
            _cameraShakeIntensity = 0.6;
            _triggerHitFlash();
            _spawnHitParticles(a.position);

            // Phase 4: Combo reset on hit
            _combo = 1;
            _comboTimer = 0;
            _updateComboDisplay();
        }
    });
}

// ── Phase 2: Visual effects ────────────────────

function _triggerHitFlash(): void {
    const el = document.getElementById('flight-hit-flash');
    if (!el) return;
    el.classList.remove('active');
    void el.offsetWidth; // force reflow
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 400);
}

function _applyCameraShake(): void {
    if (!globalRenderer) return;
    const canvas = globalRenderer.domElement;
    const i = _cameraShakeIntensity;
    canvas.style.transform = i > 0.01
        ? `translate(${(Math.random() - 0.5) * i * 12}px, ${(Math.random() - 0.5) * i * 12}px)`
        : '';
}

function _spawnHitParticles(pos: THREE.Vector3): void {
    const scene = window.__threeScene;
    if (!scene) return;
    const count = 8;
    const geo = new THREE.SphereGeometry(0.06, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf87171 });
    for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 4
        );
        scene.add(p);
        _animateParticle(p, vel, 0.6);
    }
    // Dispose shared geo/mat after last particle finishes
    setTimeout(() => { geo.dispose(); mat.dispose(); }, 700);
}

function _spawnCollectParticles(pos: THREE.Vector3, color: number): void {
    const scene = window.__threeScene;
    if (!scene) return;
    const count = 6;
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 3
        );
        scene.add(p);
        _animateParticle(p, vel, 0.5);
    }
    setTimeout(() => { geo.dispose(); mat.dispose(); }, 600);
}

function _animateParticle(mesh: THREE.Mesh, vel: THREE.Vector3, life: number): void {
    const scene = window.__threeScene;
    const start = performance.now();
    function tick() {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= life || !scene) {
            scene?.remove(mesh);
            return;
        }
        const dt = 0.016; // ~60fps step
        mesh.position.add(vel.clone().multiplyScalar(dt));
        vel.multiplyScalar(0.96);
        const scale = 1 - elapsed / life;
        mesh.scale.setScalar(scale);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function _spawnWave(): void {
    const scene = window.__threeScene;
    if (!THREE || !scene || !_asteroidGeo || !_asteroidMat || !_crystalGeo || !_crystalMat) return;

    const w = _currentWave;

    // Астероиды: кол-во зависит от волны
    const aCount = WAVE_ASTEROID_COUNT[w] + Math.floor(Math.random() * WAVE_ASTEROID_EXTRA[w]);
    for (let i = 0; i < aCount; i++) {
        // 20% шанс ледяного астероида на волне 2+
        const isIce = w >= 1 && Math.random() < 0.2 && _asteroidIceMat;
        const mesh = new THREE.Mesh(_asteroidGeo, isIce ? _asteroidIceMat! : _asteroidMat!);
        const sizeMin = 0.6 + w * 0.15;
        const sizeMax = 1.2 + w * 0.4;
        mesh.scale.setScalar(sizeMin + Math.random() * (sizeMax - sizeMin));
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        _asteroids.push(mesh);
    }

    // Кристаллы
    const cCount = WAVE_CRYSTAL_COUNT[w] + Math.floor(Math.random() * WAVE_CRYSTAL_EXTRA[w]);
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

    // Бонусные объекты (5% шанс мега-кристалла, 4% ремкомплект)
    if (Math.random() < 0.05 && _megaCrystalMat && _crystalGeo) {
        const mesh = new THREE.Mesh(_crystalGeo, _megaCrystalMat);
        mesh.scale.setScalar(0.6); // больше обычного
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.4 + Math.random() * FIELD_D * 0.5)
        );
        (mesh as any).userData._bonusType = 'mega';
        scene.add(mesh);
        _bonuses.push(mesh);
    }
    if (Math.random() < 0.04 && _repairMat && _crystalGeo) {
        const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.35, 0),
            _repairMat
        );
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.4 + Math.random() * FIELD_D * 0.5)
        );
        (mesh as any).userData._bonusType = 'repair';
        scene.add(mesh);
        _bonuses.push(mesh);
    }
}

// ── End Flight ──────────────────────────────────

function _endFlight(): void {
    _state = 'results';
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;

    // Reset canvas transform from camera shake
    if (globalRenderer) globalRenderer.domElement.style.transform = '';
    if (_shipModel) _shipModel.visible = true;

    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    // Записываем собранные кристаллы
    if (_collected > 0) {
        dispatch('EARN_CRYSTALS', { earned: { [_crystalType]: _collected } as Record<CrystalType, number> });
        playSfx('flight_end_success');
    } else {
        playSfx('flight_end_fail');
    }
    dispatch('INCREMENT_STAT', { key: 'flights' });

    // Рейтинг
    const shieldPct = Math.round((_shield / _maxShield) * 100);
    const rating = _collected >= 30 && shieldPct > 60 ? 'S'
        : _collected >= 20 && shieldPct > 40 ? 'A'
        : _collected >= 10 ? 'B' : 'C';
    const ratingColor = rating === 'S' ? '#fbbf24' : rating === 'A' ? '#4ade80' : rating === 'B' ? '#4fc3f7' : '#94a3b8';

    // Рендерим результаты
    const ct = CRYSTAL_COLORS[_crystalType] ?? CRYSTAL_COLORS.programming;
    const statsEl = document.getElementById('flight-results-stats');
    if (statsEl) {
        const row = (label: string, value: string, color = 'var(--color-primary)') => `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span>
                <span style="font-family:var(--font-display);color:${color};">${value}</span>
            </div>`;

        const lines: string[] = [];
        lines.push(`<div style="font-size:2.5rem;font-family:var(--font-display);color:${ratingColor};text-align:center;margin-bottom:0.5rem;text-shadow:0 0 20px ${ratingColor}60;">${rating}</div>`);

        if (_collected > 0) {
            lines.push(row(`${ct.emoji} ${ct.label}`, `+${_collected}`));
        } else {
            lines.push('<p style="color:var(--color-text-muted);">Кристаллы не собраны. Попробуй ещё!</p>');
        }
        lines.push(row('🛡 Щиты', `${shieldPct}%`, shieldPct > 50 ? '#4ade80' : '#f87171'));
        lines.push(row('⚡ Макс. комбо', `×${_maxCombo}`, _maxCombo >= 4 ? '#fbbf24' : 'var(--color-text-muted)'));
        lines.push(row('💨 Уклонений', String(_dodged), 'var(--color-text-muted)'));

        statsEl.innerHTML = lines.join('');
    }
}

// ── Helpers ─────────────────────────────────────

function _updateHud(): void {
    _setText('flight-crystals-count', String(_collected));
    _updateShieldBar();
    _updateWaveProgress();
}

function _updateShieldBar(): void {
    const bar = document.getElementById('flight-shield-bar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (_shield / _maxShield) * 100));
    (bar as HTMLElement).style.width = `${pct}%`;
    // Цвет: зелёный → жёлтый → красный
    if (pct > 60) {
        bar.style.background = 'linear-gradient(90deg, #4fc3f7, #818cf8)';
    } else if (pct > 30) {
        bar.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #f87171, #ef4444)';
    }
}

function _updateWaveProgress(): void {
    const bar = document.getElementById('flight-wave-bar');
    const label = document.getElementById('flight-wave-label');
    if (!bar) return;
    // Прогресс внутри текущей волны (0–100%)
    const waveElapsed = _elapsed - _currentWave * WAVE_DURATION_S;
    const pct = Math.min(100, (waveElapsed / WAVE_DURATION_S) * 100);
    bar.style.width = `${pct}%`;
    // Цвет волны: зелёный → жёлтый → красный
    const colors = ['#4ade80', '#fbbf24', '#f87171'];
    bar.style.background = colors[_currentWave] ?? colors[2];
    if (label) label.textContent = `Волна ${_currentWave + 1}/${WAVE_COUNT}`;
}

function _setText(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

// _applyShipColor и _createFallbackShip вынесены в shipUtils.ts

function _updateComboDisplay(): void {
    const el = document.getElementById('flight-combo');
    if (!el) return;
    if (_combo > 1) {
        el.textContent = `×${_combo}`;
        el.classList.remove('hidden');
        el.style.transform = 'scale(1.3)';
        setTimeout(() => el.style.transform = 'scale(1)', 150);
    } else {
        el.classList.add('hidden');
    }
}

function _spawnFloatingText(worldPos: THREE.Vector3, text: string, color: number): void {
    // Create a CSS overlay element for the floating text
    const container = document.getElementById('screen-flight');
    if (!container || !globalRenderer) return;

    const el = document.createElement('div');
    el.className = 'flight-floating-text';
    el.textContent = text;
    el.style.color = `#${color.toString(16).padStart(6, '0')}`;

    // Project 3D position to 2D screen coordinates
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    if (cam) {
        const projected = worldPos.clone().project(cam);
        const x = (projected.x * 0.5 + 0.5) * container.clientWidth;
        const y = (-projected.y * 0.5 + 0.5) * container.clientHeight;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    } else {
        // Fallback: center of screen
        el.style.left = '50%';
        el.style.top = '40%';
    }

    container.appendChild(el);
    // Animate up and fade out
    requestAnimationFrame(() => {
        el.style.transform = 'translate(-50%, -80px)';
        el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 800);
}

function _cleanup(): void {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';

    // Reset canvas transform from camera shake
    if (globalRenderer) globalRenderer.domElement.style.transform = '';

    const scene = window.__threeScene;
    if (scene) {
        [..._asteroids, ..._crystals, ..._bonuses].forEach(obj => scene.remove(obj));
        if (_shipModel) scene.remove(_shipModel);
    }
    _asteroids = [];
    _crystals = [];
    _bonuses = [];
    _shipModel = null;
    _velocity.set(0, 0);

    // Dispose shared GPU resources
    _asteroidGeo?.dispose(); _asteroidGeo = null;
    _asteroidMat?.dispose(); _asteroidMat = null;
    _asteroidIceMat?.dispose(); _asteroidIceMat = null;
    _crystalGeo?.dispose();  _crystalGeo = null;
    _crystalMat?.dispose();  _crystalMat = null;
    _megaCrystalMat?.dispose(); _megaCrystalMat = null;
    _repairMat?.dispose(); _repairMat = null;
}

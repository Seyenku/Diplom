/**
 * flightScreen.ts — Главный контроллер экрана полёта
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { dispatch, getStore, transition, Screen } from '../stateManager.js';
import { switchScene, registerSceneBuilder, getBaseCamera, addStarfield, renderer as globalRenderer } from '../threeScene.js';
import { GameStore, CrystalType, ClusterType } from '../types.js';
import { getProfile, onQualityChange, offQualityChange, QualityProfile } from '../qualityPresets.js';
import { CRYSTAL_COLORS } from '../clusterConfig.js';
import { playSfx, playMusic } from '../audioManager.js';
import { isBoostPressed, attachTouchControls, detachTouchControls } from '../inputManager.js';
import { getDevice } from '../deviceProfile.js';

import { FLIGHT_SHIP_CONFIG, updateShipPhysics } from '../systems/shipController.js';
import { loadShipGroup } from '../systems/shipLoader.js';
import { createComposer, disposeComposer } from '../systems/postProcessing.js';
import { disposeParticlePool, spawnFloatingText } from '../systems/particleEffects.js';

import { FlightVfxState, initVfx, updateVfx, disposeVfx } from './flightVfx.js';
import { SpawnerState, initSpawner, spawnWave, recycleObject, disposeSpawner, FIELD_W, FIELD_H } from './flightSpawner.js';
import { checkCollisions, IFRAMES_DURATION, HIT_STUN_DURATION } from './flightCollisions.js';
import * as Ui from './flightUi.js';

// ── Scene Builder ───────────────────────────────────────────────────────────

registerSceneBuilder('flight', () => {
    const scene = new THREE.Scene();
    const camera = getBaseCamera();
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, -50);
    
    const profile = getProfile();
    addStarfield(scene, profile.flightStarfieldCount, 0.6);
    if (profile.flightParallaxLayers >= 2) _addFlightDustLayer(scene, 'mid', ...profile.flightDustMid);
    if (profile.flightParallaxLayers >= 3) _addFlightDustLayer(scene, 'near', ...profile.flightDustNear);
    
    scene.add(new THREE.AmbientLight(0x334155, 0.6));
    const dirLight = new THREE.DirectionalLight(0x4fc3f7, 1.2);
    dirLight.position.set(5, 10, 10);
    scene.add(dirLight);
    
    const backLight = new THREE.PointLight(0x818cf8, 0.8, 100);
    backLight.position.set(0, -5, -20);
    scene.add(backLight);
    
    if (profile.flightPostProcessing && globalRenderer) {
        globalRenderer.toneMapping = THREE.NoToneMapping;
        globalRenderer.toneMappingExposure = 1.0;
    }
    
    window.__threeScene = scene;
    (window as any).__threeCamera = camera;
    return { scene, camera };
});

function _addFlightDustLayer(scene: THREE.Scene, tag: string, count: number, size: number, opacity: number): void {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = tag === 'near' ? 0x8888cc : 0x6677aa;
    const mat = new THREE.PointsMaterial({
        color, size, sizeAttenuation: true,
        transparent: true, opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.userData = { flightDust: tag };
    scene.add(points);
}

// ── Константы ────────────────────────────────────
const WAVE_COUNT = 3;
const BASE_SHIELD = 100;
const BASE_OBJ_SPEED = 25;
const COMBO_TIMEOUT = 2.5;

// Камера мягко привязана к кораблю: оффсет относительно его позиции и
// скорость интерполяции в 1/сек. Меньше lerp → сильнее лаг → ярче дрейф.
const CAMERA_OFFSET = new THREE.Vector3(0, 2, 8);
const CAMERA_LERP_SPEED = 3.5;

// Длительность задаётся LiveOps-настройкой flight_duration_s.
// Подставляется в init(); fallback 60 сек.
let WAVE_DURATION_S = 20;
let FLIGHT_DURATION_S = WAVE_DURATION_S * WAVE_COUNT;

// Волновые множители
const WAVE_SPEED_MULT  = [1.0, 1.35, 1.8];
const WAVE_SPAWN_MULT  = [1.0, 1.4, 2.0];

// Разгон: базовая длительность и бонус от апгрейда.
// speedBonus — это проценты (20/40/70 для Engine I/II/III).
// При speedBonus=100% разгон сократится в 4 раза (с 3 с до минимума 1.5 с).
const BASE_ACCEL_DURATION_S = 3.0;
const SPEED_BONUS_ACCEL_REDUCTION = 1 / 400; // на каждый % speedBonus разгон сокращается на 0.25%

type FlightState = 'idle' | 'accelerating' | 'playing' | 'results';

// ── Локальное состояние ──────────────────────────
let _state: FlightState = 'idle';
let _animId: number | null = null;
let _elapsed = 0;
let _lastTime = 0;
let _throttle = 0;           // 0.0 → 1.0 during acceleration
let _accelDuration = BASE_ACCEL_DURATION_S;
let _currentWave = 0;

let _shield = BASE_SHIELD;
let _maxShield = BASE_SHIELD;
let _collected = 0;
let _crystalType: CrystalType = 'programming';
let _crystalCssColor = '#4fc3f7';
let _overflowNotified = false;
let _lostOverflow = 0;     // потеряно кристаллов из-за полного трюма (за полёт)
let _overflowFxCd = 0;     // кулдаун floating-text «Трюм полон!»
let _paused = false;
let _radarCd = 0;          // троттлинг отрисовки радара
let _speedCd = 0;          // троттлинг индикатора скорости

let _combo = 1;
let _maxCombo = 1;
let _comboTimer = 0;
let _dodged = 0;

let _iFramesRemaining = 0;
let _hitStunRemaining = 0;

// Энергия буста: 0–100, восстанавливается в простое.
const BOOST_MAX_ENERGY = 100;
const BOOST_DRAIN_PER_S = 25;       // ≈ 4 сек непрерывного буста
const BOOST_REGEN_PER_S = 15;       // ≈ 6.7 сек полная регенерация
const BOOST_MIN_TO_ACTIVATE = 10;   // нельзя жать буст ниже этого порога
let _energy = BOOST_MAX_ENERGY;
let _boostActive = false;

// Объекты сцены
let _shipModel: THREE.Group | null = null;
let _asteroids: THREE.Object3D[] = [];
let _crystals: THREE.Object3D[] = [];
let _bonuses: THREE.Object3D[] = [];
let _velocity = new THREE.Vector2(0, 0);

// Подсистемы
let _vfxState: FlightVfxState | null = null;
let _spawnerState: SpawnerState | null = null;
let _composer: EffectComposer | null = null;

// Статы игрока
let _speedBonus = 0;
let _shieldBonus = 0;
let _scanRange = 1;
let _capacity = 1;

window._flightScreen = {
    restart() {
        const hud = document.getElementById('flight-hud');
        const res = document.getElementById('flight-results');
        if (hud) hud.classList.remove('hidden');
        if (res) res.classList.add('hidden');
        _setPaused(false);
        _startAccelerating();
    },
    togglePause() {
        if (_state !== 'playing' && _state !== 'accelerating') return;
        _setPaused(!_paused);
    }
};

/** Пауза: останавливаем RAF-цикл целиком (логика, таймеры и рендер замирают).
 *  При резюме сбрасываем _lastTime, иначе dt-скачок прокрутит таймер полёта. */
function _setPaused(paused: boolean): void {
    if (_paused === paused) return;
    _paused = paused;

    const overlay = document.getElementById('flight-pause-overlay');
    if (overlay) overlay.classList.toggle('hidden', !paused);

    if (paused) {
        if (_animId) cancelAnimationFrame(_animId);
        _animId = null;
    } else if (_state === 'playing' || _state === 'accelerating') {
        _lastTime = performance.now();
        _lastFrameRenderMs = 0;
        _animId = requestAnimationFrame(_gameLoop);
    }
    playSfx('ui_click');
}

function _onKeyDown(e: KeyboardEvent): void {
    if (e.code !== 'Escape') return;
    if (_state !== 'playing' && _state !== 'accelerating') return;
    e.preventDefault();
    _setPaused(!_paused);
}

export async function init(store: Readonly<GameStore>): Promise<void> {
    const sd = store.sessionData;
    if (!sd || !sd.crystalType) {
        transition(Screen.GALAXY_MAP);
        return;
    }

    // Длительность полёта берём из LiveOps; делим на WAVE_COUNT для длины волны.
    const totalDuration = Math.max(15, sd.liveOps?.flightDurationS ?? 60);
    FLIGHT_DURATION_S = totalDuration;
    WAVE_DURATION_S = totalDuration / WAVE_COUNT;

    _crystalType = sd.crystalType || 'programming';
    const ctHex = CRYSTAL_COLORS[_crystalType]?.color ?? 0x4fc3f7;
    _crystalCssColor = '#' + ctHex.toString(16).padStart(6, '0');

    // Статы апгрейдов
    const st = store.player?.shipStats;
    _speedBonus = st?.speedBonus ?? 0;
    _shieldBonus = st?.shieldBonus ?? 0;
    _scanRange = st?.scanRange ?? 1;
    _capacity = st?.capacity ?? 1;

    _maxShield = BASE_SHIELD * (1 + _shieldBonus / 100);
    _shield = _maxShield;

    // Длительность разгона зависит от speedBonus (каждый уровень -25%, мин 1.5с)
    _accelDuration = Math.max(1.5, BASE_ACCEL_DURATION_S * (1 - _speedBonus * SPEED_BONUS_ACCEL_REDUCTION));

    const shipColor = store.player?.shipColor ?? '#4fc3f7';
    _shipModel = await loadShipGroup(shipColor);
    
    await switchScene('flight');
    const scene = window.__threeScene;
    if (scene && _shipModel) scene.add(_shipModel);

    _initSubsystems();
    onQualityChange(_onQualityChanged);

    // Подсказки управления — рендерим под актуальную схему и горячие клавиши
    Ui.renderControlHints(store.settings ?? null);

    // Тач-контролы подключаем только при схеме «Клавиатура / джойстик».
    // При «Мышь / тач» активируется point-to-fly через касания canvas — иначе
    // джойстик и тач-курсор будут конкурировать. CSS-media также скрывает
    // элементы на десктопе. Атрибут data-scheme на HUD позволяет CSS показать
    // или скрыть джойстик соответственно.
    const scheme = store.settings?.controlScheme ?? 'keyboard';
    const hudEl = document.getElementById('flight-hud');
    if (hudEl) hudEl.dataset.scheme = scheme;
    if (scheme === 'keyboard') {
        // Floating joystick + boost-zone (без отдельной кнопки буста).
        attachTouchControls(
            'flight-joystick-zone',
            'flight-joystick-base',
            'flight-joystick-stick',
            'flight-boost-zone',
            'flight-boost-hint'
        );
    }

    document.addEventListener('keydown', _onKeyDown);

    playMusic('ambient_flight');
    _startAccelerating();
}

export function destroy(): void {
    document.removeEventListener('keydown', _onKeyDown);
    offQualityChange(_onQualityChanged);
    _cleanup();
}

function _initSubsystems(): void {
    const scene = window.__threeScene;
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    const profile = getProfile();
    const ctColor = CRYSTAL_COLORS[_crystalType]?.color ?? 0x4fc3f7;

    _spawnerState = initSpawner(ctColor);
    if (scene) {
        _vfxState = initVfx(scene, _shipModel, profile);
    }

    if (profile.flightPostProcessing && globalRenderer && scene && cam) {
        _composer = createComposer(globalRenderer, scene, cam, {
            bloom: { strength: 0.35, radius: 0.2, threshold: 0.92 },
            vignette: true
        });
    }
}

function _onQualityChanged(): void {
    if (_state === 'idle') return;
    
    const scene = window.__threeScene;
    if (_vfxState && scene) disposeVfx(_vfxState, scene);
    if (_composer) disposeComposer(_composer);
    _composer = null;

    _initSubsystems();
}

function _startAccelerating(): void {
    _cleanupState();
    _state = 'accelerating';
    _throttle = 0;
    _paused = false;
    document.getElementById('flight-pause-overlay')?.classList.add('hidden');

    // Показываем HUD сразу
    const hudEl = document.getElementById('flight-hud');
    if (hudEl) hudEl.classList.remove('hidden');

    // Подсказки управления видны только в фазе разгона
    Ui.setControlHintsVisible(true);

    // Показываем оверлей разгона
    const accelEl = document.getElementById('flight-accel-overlay');
    if (accelEl) {
        accelEl.classList.remove('hidden');
        accelEl.classList.remove('fade-out');
    }

    playSfx('ui_click');
    _lastTime = performance.now();
    if (_animId) cancelAnimationFrame(_animId);
    _animId = requestAnimationFrame(_gameLoop);
    _updateUi();
}

function _finishAcceleration(): void {
    _state = 'playing';
    _throttle = 1;

    // Подсказки управления больше не нужны — фаза разгона закончилась
    Ui.setControlHintsVisible(false);

    // Плавный fade-out оверлея разгона
    const accelEl = document.getElementById('flight-accel-overlay');
    if (accelEl) {
        accelEl.classList.add('fade-out');
        setTimeout(() => accelEl.classList.add('hidden'), 600);
    }

    playSfx('ui_click');
}

/** easeInQuad: плавный старт, ускоряющийся к концу */
function _easeInQuad(t: number): number {
    return t * t;
}

/** Мягко тянет камеру к позиции корабля + CAMERA_OFFSET по X/Y.
 *  Z и направление взгляда не трогаем — это «спина-камера». */
function _updateCameraFollow(cam: THREE.PerspectiveCamera, ship: THREE.Group, rawDt: number): void {
    const k = Math.min(1, rawDt * CAMERA_LERP_SPEED);
    const targetX = ship.position.x + CAMERA_OFFSET.x;
    const targetY = ship.position.y + CAMERA_OFFSET.y;
    cam.position.x += (targetX - cam.position.x) * k;
    cam.position.y += (targetY - cam.position.y) * k;
}

// Frame-rate cap для слабых устройств — 30 FPS вместо 60 (двое-кратная
// экономия CPU/GPU). На обычных и десктопе работает на нативной частоте.
const FRAME_TARGET_MS_LOW = 33;
let _lastFrameRenderMs = 0;

function _gameLoop(now: number): void {
    if (_paused) return;
    if (_state !== 'accelerating' && _state !== 'playing' && _state !== 'results') return;

    // На слабых устройствах пропускаем «лишние» кадры до целевой частоты.
    if (getDevice().isLowEnd && (now - _lastFrameRenderMs) < FRAME_TARGET_MS_LOW) {
        _animId = requestAnimationFrame(_gameLoop);
        return;
    }
    _lastFrameRenderMs = now;

    let rawDt = (now - _lastTime) / 1000;
    rawDt = Math.min(rawDt, 0.1);
    _lastTime = now;

    if (_iFramesRemaining > 0) _iFramesRemaining -= rawDt;
    if (_hitStunRemaining > 0) _hitStunRemaining -= rawDt;
    if (_overflowFxCd > 0) _overflowFxCd -= rawDt;

    const timeScale = _hitStunRemaining > 0 ? 0.2 : 1.0;
    const dt = rawDt * timeScale;

    // ── Фаза разгона ─────────────────────────────
    if (_state === 'accelerating') {
        const rawThrottle = Math.min(1, _throttle + rawDt / _accelDuration);
        _throttle = rawThrottle;
        const easedThrottle = _easeInQuad(_throttle);

        // Корабль управляем во время разгона
        if (_shipModel) {
            const speedBonusMult = 1 + _speedBonus / 100;
            updateShipPhysics(_shipModel, _velocity, dt, FLIGHT_SHIP_CONFIG, 1.0, speedBonusMult);
        }

        // Обновляем UI индикатор разгона
        Ui.updateAccelIndicator(easedThrottle);

        // VFX масштабируются с throttle
        if (_vfxState) {
            updateVfx(_vfxState, dt, rawDt, false, 0, _maxShield, _maxShield, 0, 1.0, _shipModel, getProfile(), false, easedThrottle);
        }

        // Рендер
        const scene = window.__threeScene;
        const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
        if (cam && _shipModel) _updateCameraFollow(cam, _shipModel, rawDt);
        if (_composer) {
            _composer.render();
        } else if (globalRenderer && scene && cam) {
            globalRenderer.render(scene, cam);
        }

        // Переход к playing при полном разгоне
        if (_throttle >= 1) {
            _finishAcceleration();
        }

        _animId = requestAnimationFrame(_gameLoop);
        return;
    }

    // ── Фаза игры ────────────────────────────────
    if (_state === 'playing') {
        _elapsed += dt;

        const newWave = Math.min(Math.floor(_elapsed / WAVE_DURATION_S), WAVE_COUNT - 1);
        if (newWave !== _currentWave) _currentWave = newWave;

        const remaining = Math.max(0, FLIGHT_DURATION_S - _elapsed);
        const timerEl = document.getElementById('flight-timer');
        if (timerEl) timerEl.textContent = String(Math.ceil(remaining));

        Ui.updateWaveProgress(_currentWave, WAVE_COUNT, _elapsed, WAVE_DURATION_S);

        if (remaining <= 0 || _shield <= 0) {
            _endFlight();
            return;
        }

        _comboTimer += dt;
        if (_comboTimer > COMBO_TIMEOUT && _combo > 1) {
            _combo = 1;
            Ui.updateComboDisplay(_combo);
        }

        // Энергия буста: расход при удержании, регенерация в простое.
        const wantsBoost = isBoostPressed();
        if (wantsBoost && (_boostActive ? _energy > 0 : _energy >= BOOST_MIN_TO_ACTIVATE)) {
            _boostActive = true;
            _energy = Math.max(0, _energy - BOOST_DRAIN_PER_S * dt);
        } else {
            _boostActive = false;
            _energy = Math.min(BOOST_MAX_ENERGY, _energy + BOOST_REGEN_PER_S * dt);
        }
        Ui.updateEnergyBar(_energy, BOOST_MAX_ENERGY);

        if (_shipModel) {
            const boostMult = _boostActive ? 2.2 : 1.0;
            const speedBonusMult = 1 + _speedBonus / 100;
            updateShipPhysics(_shipModel, _velocity, dt, FLIGHT_SHIP_CONFIG, boostMult, speedBonusMult);
        }

        _moveObjects(dt);
        
        if (_shipModel && _vfxState) {
            const scene = window.__threeScene;
            const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
            if (scene && cam) {
                const res = checkCollisions({
                    scene, camera: cam, shipModel: _shipModel, vfxState: _vfxState, elapsed: _elapsed,
                    asteroids: _asteroids, crystals: _crystals, bonuses: _bonuses,
                    capacity: _capacity, currentCargo: _collected,
                    combo: _combo, iFramesRemaining: _iFramesRemaining,
                    crystalColorHex: CRYSTAL_COLORS[_crystalType]?.color ?? 0x4fc3f7
                });

                if (res.crystalsEarned > 0) {
                    _collected += res.crystalsEarned;
                    _comboTimer = 0;
                    _combo = Math.min(5, _combo + 1);
                    if (_combo > _maxCombo) _maxCombo = _combo;
                    Ui.updateComboDisplay(_combo);
                }
                if (res.cargoOverflow && !_overflowNotified) {
                    _overflowNotified = true;
                    (window as any).showNotification?.(`Трюм полон (${_capacity})! Часть кристаллов потеряна.`, 'warning');
                }
                if (res.crystalsLost > 0) {
                    _lostOverflow += res.crystalsLost;
                    // Floating text с кулдауном — контакт при полном трюме может
                    // повторяться часто, спамить надписью нельзя.
                    const container = document.getElementById('screen-flight');
                    if (container && _overflowFxCd <= 0) {
                        _overflowFxCd = 1.5;
                        const sp2 = _shipModel.position;
                        spawnFloatingText(container, new THREE.Vector3(sp2.x, sp2.y + 1.2, sp2.z), cam, 'Трюм полон!', 0xf87171);
                    }
                }
                if (res.damageTaken > 0) {
                    _shield = Math.max(0, _shield - res.damageTaken);
                    _iFramesRemaining = IFRAMES_DURATION;
                    _hitStunRemaining = HIT_STUN_DURATION;
                    _combo = 1;
                    _comboTimer = 0;
                    Ui.updateComboDisplay(_combo);
                    if (_shield <= _maxShield * 0.3 && _shield > 0) playSfx('shield_warning');
                }
                if (res.healAmount > 0) {
                    _shield = Math.min(_maxShield, _shield + _maxShield * res.healAmount);
                }
                if (res.crystalsEarned > 0 || res.damageTaken > 0 || res.healAmount > 0) {
                    _updateUi();
                }
            }
        }

        const profile = getProfile();
        const waveChance = profile.spawnChancePerFrame * WAVE_SPAWN_MULT[_currentWave];
        if (Math.random() < waveChance && _spawnerState) {
            const sx = _shipModel?.position.x ?? 0;
            const sy = _shipModel?.position.y ?? 0;
            spawnWave(
                _spawnerState, window.__threeScene!, _currentWave, sx, sy,
                _velocity.x, _velocity.y,
                BASE_OBJ_SPEED * (WAVE_SPEED_MULT[_currentWave] ?? 1.8),
                profile.flightMaxAsteroids, profile.flightMaxCrystals,
                _asteroids, _crystals, _bonuses
            );
        }

        // Мини-радар и скорость — с троттлингом, рисовать каждый кадр незачем.
        _radarCd -= rawDt;
        _speedCd -= rawDt;
        if (_radarCd <= 0) {
            _radarCd = 0.1;
            Ui.updateRadar(_shipModel?.position.x ?? 0, _asteroids, _crystals, _bonuses, _crystalCssColor);
        }
        if (_speedCd <= 0) {
            _speedCd = 0.15;
            const maxV = FLIGHT_SHIP_CONFIG.maxSpeed * (1 + _speedBonus / 100);
            Ui.updateSpeedIndicator(maxV > 0 ? (_velocity.length() / maxV) * 100 : 0);
        }
    }

    if (_vfxState) {
        updateVfx(_vfxState, dt, rawDt, _boostActive, _hitStunRemaining, _shield, _maxShield, _elapsed,
            WAVE_SPEED_MULT[_currentWave] ?? 1.8, _shipModel, getProfile(), _state === 'playing', 1.0);
    }

    const scene = window.__threeScene;
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    if (cam && _shipModel) _updateCameraFollow(cam, _shipModel, rawDt);
    if (_composer) {
        _composer.render();
    } else if (globalRenderer && scene && cam) {
        globalRenderer.render(scene, cam);
    }

    _animId = requestAnimationFrame(_gameLoop);
}

function _moveObjects(dt: number): void {
    const waveMult = WAVE_SPEED_MULT[_currentWave] ?? 1.8;
    const speed = BASE_OBJ_SPEED * waveMult * dt;
    const scene = window.__threeScene;
    if (!scene) return;

    const sp = _shipModel?.position;
    const astRotX = dt * 0.5 * waveMult;
    const astRotY = dt * 0.3 * waveMult;

    // Астероиды: движение + вращение (магнит не нужен).
    for (let i = 0; i < _asteroids.length; i++) {
        const obj = _asteroids[i];
        obj.position.z += speed;
        obj.rotation.x += astRotX;
        obj.rotation.y += astRotY;
    }

    // Кристаллы: движение + магнит до sqrt по squared distance.
    const cMagnetR = _scanRange * 3;
    const cMagnetRSq = cMagnetR * cMagnetR;
    for (let i = 0; i < _crystals.length; i++) {
        const obj = _crystals[i];
        obj.position.z += speed;
        obj.rotation.x += dt * 1.2;
        obj.rotation.y += dt * 0.8;
        if (!sp) continue;
        const dx = sp.x - obj.position.x;
        const dy = sp.y - obj.position.y;
        const dz = sp.z - obj.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < cMagnetRSq && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            // pull=1 — перенос ровно в точку корабля; больше нельзя, иначе на
            // низком FPS (большой dt) кристалл перелетает цель и осциллирует.
            let pull = (1 - dist / cMagnetR) * 8 * dt / dist;
            if (pull > 1) pull = 1;
            obj.position.x += dx * pull;
            obj.position.y += dy * pull;
            obj.position.z += dz * pull;
        }
    }

    // Бонусы: то же, но без Vector3 clone/normalize.
    const bMagnetR = _scanRange * 3.5;
    const bMagnetRSq = bMagnetR * bMagnetR;
    for (let i = 0; i < _bonuses.length; i++) {
        const obj = _bonuses[i];
        obj.position.z += speed;
        obj.rotation.x += dt * 0.8;
        obj.rotation.y += dt * 1.0;
        if (!sp) continue;
        const dx = sp.x - obj.position.x;
        const dy = sp.y - obj.position.y;
        const dz = sp.z - obj.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bMagnetRSq && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            let pull = (1 - dist / bMagnetR) * 10 * dt / dist;
            if (pull > 1) pull = 1;
            obj.position.x += dx * pull;
            obj.position.y += dy * pull;
            obj.position.z += dz * pull;
        }
    }

    // Рециркуляция вместо удаления: вышедший из игры объект переставляется
    // вперёд по курсу корабля (пул фиксированного размера, без GC-мусора).
    // Боковой рецикл — только в зоне подлёта (z > NEAR_Z): дальние объекты,
    // заспавненные с упреждением, намеренно стоят в стороне от текущей позиции.
    const NEAR_Z = -40;
    const SIDE_X = 24;
    const SIDE_Y = 15;
    const sx = sp?.x ?? 0;
    const sy = sp?.y ?? 0;
    const approach = BASE_OBJ_SPEED * waveMult;

    for (let i = 0; i < _asteroids.length; i++) {
        const a = _asteroids[i];
        const past = a.position.z > 10;
        const aside = a.position.z > NEAR_Z &&
            (Math.abs(a.position.x - sx) > SIDE_X || Math.abs(a.position.y - sy) > SIDE_Y);
        if (past || aside) {
            if (past && !(a as any).userData._hit) _dodged++;
            (a as any).userData._hit = false;
            recycleObject(a, sx, sy, _velocity.x, _velocity.y, approach);
        }
    }
    for (let i = 0; i < _crystals.length; i++) {
        const c = _crystals[i];
        const aside = c.position.z > NEAR_Z &&
            (Math.abs(c.position.x - sx) > SIDE_X || Math.abs(c.position.y - sy) > SIDE_Y);
        if (c.position.z > 10 || aside) {
            recycleObject(c, sx, sy, _velocity.x, _velocity.y, approach);
        }
    }
    // Бонусы остаются одноразовыми — их редкость не должна зависеть от рецикла.
    for (let i = _bonuses.length - 1; i >= 0; i--) {
        const b = _bonuses[i];
        if (b.position.z > 10) {
            scene.remove(b);
            _bonuses[i] = _bonuses[_bonuses.length - 1];
            _bonuses.pop();
        }
    }
}

function _endFlight(): void {
    _state = 'results';

    if (globalRenderer) globalRenderer.domElement.style.transform = '';
    if (_shipModel) _shipModel.visible = true;

    // LiveOps-множитель награды (событийный буст, настраивается в админке/БД).
    // Применяется к итогу, а не на сборе: ёмкость трюма ограничивает физический
    // сбор, бонус — чистый множитель награды.
    const bonusMult = getStore().sessionData?.liveOps?.crystalFlightBonus ?? 1;
    const totalEarned = _collected > 0 ? Math.max(_collected, Math.round(_collected * bonusMult)) : 0;

    if (totalEarned > 0) {
        dispatch('EARN_CRYSTALS', { earned: { [_crystalType]: totalEarned } as Record<CrystalType, number> });
        playSfx('flight_end_success');
    } else {
        playSfx('flight_end_fail');
    }
    dispatch('INCREMENT_STAT', { key: 'flights' });

    Ui.showResults({
        collected: _collected, capacity: _capacity, shield: _shield, maxShield: _maxShield,
        energy: _energy, maxEnergy: BOOST_MAX_ENERGY,
        currentWave: _currentWave, waveCount: WAVE_COUNT, elapsed: _elapsed,
        waveDurationS: WAVE_DURATION_S, combo: _combo, maxCombo: _maxCombo,
        dodged: _dodged, crystalType: _crystalType,
        bonusMult, totalEarned, lost: _lostOverflow
    });
}

function _updateUi(): void {
    Ui.updateHud({
        collected: _collected, capacity: _capacity, shield: _shield, maxShield: _maxShield,
        energy: _energy, maxEnergy: BOOST_MAX_ENERGY,
        currentWave: _currentWave, waveCount: WAVE_COUNT, elapsed: _elapsed,
        waveDurationS: WAVE_DURATION_S, combo: _combo, maxCombo: _maxCombo,
        dodged: _dodged, crystalType: _crystalType
    });
}

function _cleanupState(): void {
    _elapsed = 0;
    _shield = _maxShield;
    _collected = 0;
    _currentWave = 0;
    _combo = 1;
    _maxCombo = 1;
    _comboTimer = 0;
    _dodged = 0;
    _iFramesRemaining = 0;
    _hitStunRemaining = 0;
    _velocity.set(0, 0);
    _throttle = 0;
    _overflowNotified = false;
    _lostOverflow = 0;
    _overflowFxCd = 0;
    _radarCd = 0;
    _speedCd = 0;
    _energy = BOOST_MAX_ENERGY;
    _boostActive = false;

    const scene = window.__threeScene;
    if (scene) {
        [..._asteroids, ..._crystals, ..._bonuses].forEach(obj => scene.remove(obj));
    }
    _asteroids = [];
    _crystals = [];
    _bonuses = [];
    
    if (_shipModel) {
        _shipModel.position.set(0, 0, 0);
        _shipModel.rotation.set(-Math.PI / 2, 0, 0);
        _shipModel.visible = true;
    }

    // Камера тоже едет вместе с кораблём, поэтому при рестарте/чистке
    // возвращаем её к стартовому оффсету над мировым нулём.
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    if (cam) {
        cam.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
    }
}

function _cleanup(): void {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';
    _paused = false;
    document.getElementById('flight-pause-overlay')?.classList.add('hidden');

    // Подсказки управления скрываем при выходе из экрана
    Ui.setControlHintsVisible(false);

    // Отключаем тач-контролы (handlers + сбрасываем joystick state)
    detachTouchControls();

    if (globalRenderer) {
        globalRenderer.domElement.style.transform = '';
        globalRenderer.toneMapping = THREE.NoToneMapping;
    }

    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
    if (cam) {
        cam.fov = 60;
        cam.updateProjectionMatrix();
    }

    _cleanupState();

    const scene = window.__threeScene;
    if (scene) {
        if (_shipModel) scene.remove(_shipModel);
        if (_vfxState) disposeVfx(_vfxState, scene);
        disposeParticlePool(scene);
    }

    if (_spawnerState) disposeSpawner(_spawnerState);
    if (_composer) disposeComposer(_composer);

    _shipModel = null;
    _vfxState = null;
    _spawnerState = null;
    _composer = null;
}

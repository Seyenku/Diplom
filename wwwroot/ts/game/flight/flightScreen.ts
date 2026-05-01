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
import { isBoostPressed } from '../inputManager.js';

import { FLIGHT_SHIP_CONFIG, updateShipPhysics } from '../systems/shipController.js';
import { loadShipGroup } from '../systems/shipLoader.js';
import { createComposer, disposeComposer } from '../systems/postProcessing.js';

import { FlightVfxState, initVfx, updateVfx, disposeVfx } from './flightVfx.js';
import { SpawnerState, initSpawner, spawnWave, disposeSpawner, FIELD_W, FIELD_H } from './flightSpawner.js';
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
    if (profile.flightParallaxLayers >= 2) _addFlightDustLayer(scene, 'mid', 300, 1.5, 0.25);
    if (profile.flightParallaxLayers >= 3) _addFlightDustLayer(scene, 'near', 120, 3.0, 0.15);
    
    scene.add(new THREE.AmbientLight(0x334155, 0.6));
    const dirLight = new THREE.DirectionalLight(0x4fc3f7, 1.2);
    dirLight.position.set(5, 10, 10);
    scene.add(dirLight);
    
    const backLight = new THREE.PointLight(0x818cf8, 0.8, 100);
    backLight.position.set(0, -5, -20);
    scene.add(backLight);
    
    if (profile.flightPostProcessing && globalRenderer) {
        globalRenderer.toneMapping = THREE.ACESFilmicToneMapping;
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
const WAVE_DURATION_S = 20;
const WAVE_COUNT = 3;
const FLIGHT_DURATION_S = WAVE_DURATION_S * WAVE_COUNT;
const BASE_SHIELD = 100;
const BASE_OBJ_SPEED = 25;
const COMBO_TIMEOUT = 2.5;

// Волновые множители
const WAVE_SPEED_MULT  = [1.0, 1.35, 1.8];
const WAVE_SPAWN_MULT  = [1.0, 1.4, 2.0];

type FlightState = 'idle' | 'countdown' | 'playing' | 'results';

// ── Локальное состояние ──────────────────────────
let _state: FlightState = 'idle';
let _animId: number | null = null;
let _elapsed = 0;
let _lastTime = 0;
let _currentWave = 0;

let _shield = BASE_SHIELD;
let _maxShield = BASE_SHIELD;
let _collected = 0;
let _crystalType: CrystalType = 'programming';

let _combo = 1;
let _maxCombo = 1;
let _comboTimer = 0;
let _dodged = 0;

let _iFramesRemaining = 0;
let _hitStunRemaining = 0;

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
        _startCountdown();
    }
};

export async function init(store: Readonly<GameStore>): Promise<void> {
    const sd = store.sessionData;
    if (!sd || !sd.crystalType) {
        transition(Screen.GALAXY_MAP);
        return;
    }
    
    _crystalType = sd.crystalType || 'programming';
    
    // Статы апгрейдов
    const st = store.player?.shipStats;
    _speedBonus = st?.speedBonus ?? 0;
    _shieldBonus = st?.shieldBonus ?? 0;
    _scanRange = st?.scanRange ?? 1;
    _capacity = st?.capacity ?? 1;

    _maxShield = BASE_SHIELD * (1 + _shieldBonus * 0.25);
    _shield = _maxShield;

    const shipColor = store.player?.shipColor ?? '#4fc3f7';
    _shipModel = await loadShipGroup(shipColor);
    
    await switchScene('flight');
    const scene = window.__threeScene;
    if (scene && _shipModel) scene.add(_shipModel);

    _initSubsystems();
    onQualityChange(_onQualityChanged);

    playMusic('ambient_flight');
    _startCountdown();
}

export function destroy(): void {
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
            bloom: { strength: 0.35, radius: 0.2, threshold: 0.85 },
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

function _startCountdown(): void {
    _cleanupState();
    _state = 'countdown';
    
    const el = document.getElementById('flight-countdown');
    if (el) {
        el.classList.remove('hidden');
        el.textContent = '3';
        playSfx('ui_click');
        setTimeout(() => { if (_state === 'countdown') { el.textContent = '2'; playSfx('ui_click'); } }, 1000);
        setTimeout(() => { if (_state === 'countdown') { el.textContent = '1'; playSfx('ui_click'); } }, 2000);
        setTimeout(() => {
            if (_state === 'countdown') {
                el.classList.add('hidden');
                _startPlaying();
            }
        }, 3000);
    } else {
        _startPlaying();
    }
}

function _startPlaying(): void {
    _state = 'playing';
    _lastTime = performance.now();
    if (_animId) cancelAnimationFrame(_animId);
    _animId = requestAnimationFrame(_gameLoop);
    _updateUi();
}

function _gameLoop(now: number): void {
    if (_state !== 'playing' && _state !== 'results') return;

    let rawDt = (now - _lastTime) / 1000;
    rawDt = Math.min(rawDt, 0.1);
    _lastTime = now;

    if (_iFramesRemaining > 0) _iFramesRemaining -= rawDt;
    if (_hitStunRemaining > 0) _hitStunRemaining -= rawDt;

    const timeScale = _hitStunRemaining > 0 ? 0.2 : 1.0;
    const dt = rawDt * timeScale;

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

        if (_shipModel) {
            const boostMult = isBoostPressed() ? 2.2 : 1.0;
            const speedBonusMult = 1 + _speedBonus * 0.3;
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
                    capacity: _capacity, combo: _combo, iFramesRemaining: _iFramesRemaining,
                    crystalColorHex: CRYSTAL_COLORS[_crystalType]?.color ?? 0x4fc3f7
                });

                if (res.crystalsEarned > 0) {
                    _collected += res.crystalsEarned;
                    _comboTimer = 0;
                    _combo = Math.min(5, _combo + 1);
                    if (_combo > _maxCombo) _maxCombo = _combo;
                    Ui.updateComboDisplay(_combo);
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
            spawnWave(_spawnerState, window.__threeScene!, _currentWave, _asteroids, _crystals, _bonuses);
        }
    }

    if (_vfxState) {
        updateVfx(_vfxState, dt, rawDt, isBoostPressed(), _hitStunRemaining, _shield, _maxShield, _elapsed, _currentWave, _shipModel, getProfile(), _state === 'playing');
    }

    const scene = window.__threeScene;
    const cam = (window as any).__threeCamera as THREE.PerspectiveCamera | undefined;
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

    _asteroids.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 0.5 * waveMult;
        obj.rotation.y += dt * 0.3 * waveMult;
    });

    const sp = _shipModel?.position;
    _crystals.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 1.2;
        obj.rotation.y += dt * 0.8;

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

    _bonuses.forEach(obj => {
        obj.position.z += speed;
        obj.rotation.x += dt * 0.8;
        obj.rotation.y += dt * 1.0;
        if (sp) {
            const magnetRadius = _scanRange * 3.5;
            const dist = obj.position.distanceTo(sp);
            if (dist < magnetRadius && dist > 0.1) {
                const pull = (1 - dist / magnetRadius) * 10 * dt;
                const dir = sp.clone().sub(obj.position).normalize();
                obj.position.add(dir.multiplyScalar(pull));
            }
        }
    });

    _asteroids = _asteroids.filter(a => {
        if (a.position.z > 10) {
            scene.remove(a);
            if (!(a as any).userData._hit) _dodged++;
            return false;
        }
        return true;
    });
    _crystals = _crystals.filter(c => {
        if (c.position.z > 10) { scene.remove(c); return false; }
        return true;
    });
    _bonuses = _bonuses.filter(b => {
        if (b.position.z > 10) { scene.remove(b); return false; }
        return true;
    });
}

function _endFlight(): void {
    _state = 'results';
    
    if (globalRenderer) globalRenderer.domElement.style.transform = '';
    if (_shipModel) _shipModel.visible = true;

    if (_collected > 0) {
        dispatch('EARN_CRYSTALS', { earned: { [_crystalType]: _collected } as Record<CrystalType, number> });
        playSfx('flight_end_success');
    } else {
        playSfx('flight_end_fail');
    }
    dispatch('INCREMENT_STAT', { key: 'flights' });

    Ui.showResults({
        collected: _collected, shield: _shield, maxShield: _maxShield,
        currentWave: _currentWave, waveCount: WAVE_COUNT, elapsed: _elapsed,
        waveDurationS: WAVE_DURATION_S, combo: _combo, maxCombo: _maxCombo,
        dodged: _dodged, crystalType: _crystalType
    });
}

function _updateUi(): void {
    Ui.updateHud({
        collected: _collected, shield: _shield, maxShield: _maxShield,
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
}

function _cleanup(): void {
    if (_animId) cancelAnimationFrame(_animId);
    _animId = null;
    _state = 'idle';

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
    }
    
    if (_spawnerState) disposeSpawner(_spawnerState);
    if (_composer) disposeComposer(_composer);

    _shipModel = null;
    _vfxState = null;
    _spawnerState = null;
    _composer = null;
}

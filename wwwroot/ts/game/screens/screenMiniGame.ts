/**
 * screenMiniGame.ts — 3D мини-игра «Пробная посадка»
 *
 * Игрок управляет посадочным модулем и уклоняется от астероидов,
 * пока идёт сближение с планетой.
 *
 * Условия:
 * - 30 секунд и здоровье > 0 => успешная посадка
 * - здоровье <= 0 => провал
 */

import * as THREE from 'three';
import { dispatch, goBack } from '../stateManager.js';
import { GameStore, MiniGameRewardDto } from '../types.js';
import { loadModel } from '../gltfLoader.js';
import { applyShipColor, createFallbackShip } from '../shipUtils.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { playSfx, playMusic } from '../audioManager.js';

const APPROACH_RAMP_S = 30;
const HEALTH_MAX = 100;
const SHIP_SPEED = 12;
const SHIP_BOUNDS_X = 7;
const SHIP_BOUNDS_Y = 4;
const SHIP_COLLISION_R = 0.9;

const PLANET_RADIUS = 18;
const PLANET_START_Z = -80;
const APPROACH_BASE_SPEED = 3.0;
const APPROACH_ACCEL = 1.2;
const ASTEROID_SPAWN_INTERVAL = 0.42;
const ASTEROID_MIN_R = 0.45;
const ASTEROID_MAX_R = 1.15;
const ASTEROID_BASE_SPEED = 22;
const ASTEROID_DAMAGE = 25;

type MiniGameState = 'idle' | 'playing' | 'ended';

interface Asteroid {
    mesh: THREE.Mesh;
    radius: number;
    spinAxis: THREE.Vector3;
    spinSpeed: number;
}

let _state: MiniGameState = 'idle';
let _planetId: string | null = null;

let _canvas: HTMLCanvasElement | null = null;
let _renderer: THREE.WebGLRenderer | null = null;
let _scene: THREE.Scene | null = null;
let _camera: THREE.PerspectiveCamera | null = null;

let _ship: THREE.Group | null = null;
let _planet: THREE.Mesh | null = null;
let _planetGlow: THREE.Mesh | null = null;
let _asteroids: Asteroid[] = [];
let _stars: THREE.Points | null = null;

// Shared GPU resources for asteroids (created once, reused for all spawns)
let _asteroidGeo: THREE.IcosahedronGeometry | null = null;
let _asteroidMat: THREE.MeshStandardMaterial | null = null;

let _resizeObs: ResizeObserver | null = null;
let _animId: number | null = null;

let _lastTime = 0;
let _elapsed = 0;
let _spawnAcc = 0;
let _health = HEALTH_MAX;
let _dodged = 0;
let _score = 0;
let _hitFlash = 0;
let _isPaused = false;

let _keys: Record<string, boolean> = {};
let _pointerTarget: THREE.Vector2 | null = null;
let _shipColor = '#4fc3f7';

window._miniGame = {
    pause() {
        _isPaused = !_isPaused;
    },
    returnToPlanet() {
        goBack();
    },
    retry() {
        _startGame();
    }
};

export async function init(store: Readonly<GameStore>): Promise<void> {
    _planetId = store.sessionData?.planetId ?? null;
    _shipColor = store.player?.shipColor ?? '#4fc3f7';

    _canvas = document.getElementById('minigame-canvas') as HTMLCanvasElement | null;
    if (!_canvas) return;

    _bindInput();
    await _initScene();
    playMusic('ambient_minigame');
    _startGame();
}

export function destroy(): void {
    _cleanup();
}

async function _initScene(): Promise<void> {
    if (!_canvas) return;

    _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setClearColor(0x020710, 1);

    const parent = _canvas.parentElement!;
    _renderer.setSize(parent.clientWidth, parent.clientHeight, false);

    _scene = new THREE.Scene();
    _scene.fog = new THREE.FogExp2(0x020710, 0.03);

    _camera = new THREE.PerspectiveCamera(62, parent.clientWidth / parent.clientHeight, 0.1, 600);
    _camera.position.set(0, 1.6, 14);
    _camera.lookAt(0, 0, -30);

    _scene.add(new THREE.AmbientLight(0x32435f, 0.7));
    const key = new THREE.DirectionalLight(0xaad6ff, 1.0);
    key.position.set(6, 9, 12);
    _scene.add(key);

    const rim = new THREE.PointLight(0x4fc3f7, 2.2, 120);
    rim.position.set(0, 2, -20);
    _scene.add(rim);

    _buildStars();
    await _buildShip();
    _buildPlanet();

    _resizeObs = new ResizeObserver(() => {
        if (!_renderer || !_camera || !_canvas) return;
        const p = _canvas.parentElement!;
        const w = p.clientWidth;
        const h = p.clientHeight;
        if (w === 0 || h === 0) return;
        _camera.aspect = w / h;
        _camera.updateProjectionMatrix();
        _renderer.setSize(w, h, false);
    });
    _resizeObs.observe(parent);
}

function _buildStars(): void {
    const geo = new THREE.BufferGeometry();
    const count = 1500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 140;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 70;
        pos[i * 3 + 2] = -Math.random() * 300;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xdbeafe, size: 0.12, transparent: true, opacity: 0.82 });
    _stars = new THREE.Points(geo, mat);
    _scene!.add(_stars);
}

async function _buildShip(): Promise<void> {
    const ship = new THREE.Group();
    ship.position.set(0, -0.3, 4);

    try {
        const mesh = await loadModel('/models/ship.glb');
        mesh.scale.set(0.5, 0.5, 0.5);
        mesh.rotation.y = -Math.PI / 2;
        ship.add(mesh);
    } catch (e) {
        console.warn('[MiniGame3D] ship.glb not loaded, using fallback', e);
        const fallback = createFallbackShip();
        ship.add(fallback);
    }

    applyShipColor(ship, _shipColor);
    _ship = ship;
    _scene!.add(ship);
}

function _buildPlanet(): void {
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        emissive: 0x1e3a8a,
        emissiveIntensity: 0.5,
        roughness: 0.68,
        metalness: 0.08
    });
    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(PLANET_RADIUS, 64, 48),
        coreMat
    );
    planet.position.set(0, 0, PLANET_START_Z);

    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(PLANET_RADIUS + 2.6, 48, 36),
        new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.24, side: THREE.BackSide })
    );
    glow.position.copy(planet.position);

    _planet = planet;
    _planetGlow = glow;

    _scene!.add(planet);
    _scene!.add(glow);
}

function _startGame(): void {
    _state = 'playing';
    _elapsed = 0;
    _spawnAcc = 0;
    _health = HEALTH_MAX;
    _dodged = 0;
    _score = 0;
    _hitFlash = 0;
    _isPaused = false;

    _clearAsteroids();

    if (_ship) _ship.position.set(0, -0.3, 4);
    if (_planet) _planet.position.set(0, 0, PLANET_START_Z);
    if (_planetGlow) {
        _planetGlow.position.set(0, 0, PLANET_START_Z);
        _planetGlow.scale.setScalar(1);
    }

    const overlay = document.getElementById('mg-result-overlay');
    if (overlay) overlay.classList.add('hidden');

    _updateHud(_getLandingEtaSeconds());

    _lastTime = performance.now();
    if (_animId) cancelAnimationFrame(_animId);
    _animId = requestAnimationFrame(_loop);
}

function _loop(now: number): void {
    if (_state !== 'playing') return;
    if (_isPaused) {
        _animId = requestAnimationFrame(_loop);
        return;
    }

    const dt = Math.min((now - _lastTime) / 1000, 0.06);
    _lastTime = now;

    _elapsed += dt;
    _updateShip(dt);
    _updatePlanet(dt);
    if (_hasReachedPlanetSurface()) {
        _finish(true);
        return;
    }
    _spawnAcc += dt;
    if (_spawnAcc >= ASTEROID_SPAWN_INTERVAL) {
        _spawnAcc -= ASTEROID_SPAWN_INTERVAL;
        _spawnAsteroid();
    }
    _updateAsteroids(dt);

    if (_hitFlash > 0) _hitFlash -= dt;
    _updateHud(_getLandingEtaSeconds());

    _renderer!.render(_scene!, _camera!);
    _animId = requestAnimationFrame(_loop);
}

function _updateShip(dt: number): void {
    if (!_ship) return;

    const move = new THREE.Vector2(0, 0);
    if (_keys['KeyA'] || _keys['ArrowLeft']) move.x -= 1;
    if (_keys['KeyD'] || _keys['ArrowRight']) move.x += 1;
    if (_keys['KeyW'] || _keys['ArrowUp']) move.y += 1;
    if (_keys['KeyS'] || _keys['ArrowDown']) move.y -= 1;

    if (_pointerTarget) {
        const to = _pointerTarget.clone().sub(new THREE.Vector2(_ship.position.x, _ship.position.y));
        _ship.position.x += to.x * Math.min(1, dt * 6);
        _ship.position.y += to.y * Math.min(1, dt * 6);
    } else if (move.lengthSq() > 0) {
        move.normalize();
        _ship.position.x += move.x * SHIP_SPEED * dt;
        _ship.position.y += move.y * SHIP_SPEED * dt;
    }

    _ship.position.x = THREE.MathUtils.clamp(_ship.position.x, -SHIP_BOUNDS_X, SHIP_BOUNDS_X);
    _ship.position.y = THREE.MathUtils.clamp(_ship.position.y, -SHIP_BOUNDS_Y, SHIP_BOUNDS_Y);

    _ship.rotation.z = -_ship.position.x * 0.05;
    _ship.rotation.x = _ship.position.y * 0.05;
}

function _updatePlanet(dt: number): void {
    if (!_planet || !_planetGlow) return;

    const t = Math.min(1, _elapsed / APPROACH_RAMP_S);
    const approachSpeed = APPROACH_BASE_SPEED + t * APPROACH_ACCEL;
    _planet.position.z += approachSpeed * dt;
    _planetGlow.position.z = _planet.position.z;
    _planetGlow.scale.setScalar(1 + t * 0.1);

    _planet.rotation.y += dt * 0.12;
    _planet.rotation.x += dt * 0.03;
    _planetGlow.rotation.y = _planet.rotation.y;

    if (_camera) {
        const targetZ = -34 + t * 18;
        _camera.lookAt(0, 0, targetZ);
    }
}

function _hasReachedPlanetSurface(): boolean {
    if (!_ship || !_planet) return false;
    const landingPlaneZ = _ship.position.z - PLANET_RADIUS - 0.6;
    return _planet.position.z >= landingPlaneZ;
}

function _getLandingEtaSeconds(): number {
    if (!_ship || !_planet) return 0;

    const landingPlaneZ = _ship.position.z - PLANET_RADIUS - 0.6;
    const remainingDist = landingPlaneZ - _planet.position.z;
    if (remainingDist <= 0) return 0;

    const b = APPROACH_BASE_SPEED;
    const a = APPROACH_ACCEL;
    const rampLeft = Math.max(0, APPROACH_RAMP_S - _elapsed);

    if (rampLeft <= 0) {
        return remainingDist / Math.max(0.001, b + a);
    }

    const v0 = b + a * (_elapsed / APPROACH_RAMP_S);
    const k = a / (2 * APPROACH_RAMP_S);
    const rampReach = v0 * rampLeft + k * rampLeft * rampLeft;

    if (remainingDist <= rampReach) {
        if (Math.abs(k) < 1e-6) return remainingDist / Math.max(0.001, v0);
        const disc = Math.max(0, v0 * v0 + 4 * k * remainingDist);
        const u = (-v0 + Math.sqrt(disc)) / (2 * k);
        return Math.max(0, u);
    }

    const afterRampDist = remainingDist - rampReach;
    const cruiseSpeed = b + a;
    return rampLeft + afterRampDist / Math.max(0.001, cruiseSpeed);
}

function _spawnAsteroid(): void {
    // Lazily create shared resources (1 allocation for entire game session)
    if (!_asteroidGeo) _asteroidGeo = new THREE.IcosahedronGeometry(1, 0);
    if (!_asteroidMat) _asteroidMat = new THREE.MeshStandardMaterial({ color: 0x7c8a9e, roughness: 0.9, metalness: 0.1 });

    const r = ASTEROID_MIN_R + Math.random() * (ASTEROID_MAX_R - ASTEROID_MIN_R);
    const mesh = new THREE.Mesh(_asteroidGeo, _asteroidMat);
    mesh.scale.setScalar(r);

    mesh.position.set(
        THREE.MathUtils.randFloatSpread(SHIP_BOUNDS_X * 3.2),
        THREE.MathUtils.randFloatSpread(SHIP_BOUNDS_Y * 3.2),
        -120 - Math.random() * 25
    );

    const asteroid: Asteroid = {
        mesh,
        radius: r,
        spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        spinSpeed: THREE.MathUtils.randFloat(0.8, 2.4)
    };

    _asteroids.push(asteroid);
    _scene!.add(mesh);
}

function _updateAsteroids(dt: number): void {
    if (!_ship) return;

    const shipPos = _ship.position;
    const speed = ASTEROID_BASE_SPEED + _elapsed * 0.35;

    for (let i = _asteroids.length - 1; i >= 0; i--) {
        const a = _asteroids[i];
        a.mesh.position.z += speed * dt;
        a.mesh.rotateOnAxis(a.spinAxis, a.spinSpeed * dt);

        const dist = a.mesh.position.distanceTo(shipPos);
        if (dist <= a.radius + SHIP_COLLISION_R) {
            _hitAsteroid(i);
            continue;
        }

        if (a.mesh.position.z > _camera!.position.z + 8) {
            _scene!.remove(a.mesh);
            _asteroids.splice(i, 1);
            _dodged += 1;
            _score += 8;
            playSfx('minigame_dodge');
        }
    }
}

function _hitAsteroid(index: number): void {
    const a = _asteroids[index];
    _scene!.remove(a.mesh);
    _asteroids.splice(index, 1);

    _health = Math.max(0, _health - ASTEROID_DAMAGE);
    _hitFlash = 0.25;
    playSfx('asteroid_hit');

    if (_health <= 0) {
        _finish(false);
    }
}

async function _finish(survived: boolean): Promise<void> {
    _state = 'ended';
    if (_animId) {
        cancelAnimationFrame(_animId);
        _animId = null;
    }

    const passed = survived && _health > 0;
    _score += Math.round(_health * 2 + _dodged * 12);
    
    if (passed) playSfx('minigame_land');
    else playSfx('minigame_crash');

    let reward: MiniGameRewardDto | null = null;
    try {
        const resp = await fetch('/game?handler=MiniGameResult', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'RequestVerificationToken': (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement)?.value ?? ''
            },
            body: JSON.stringify({
                planetId: _planetId,
                score: _score,
                timeMs: Math.round(_elapsed * 1000),
                passed
            })
        });
        if (resp.ok) reward = await resp.json() as MiniGameRewardDto;
    } catch (e) {
        console.warn('[MiniGame3D] submit failed:', e);
    }

    if (reward?.valid && reward.crystals) {
        dispatch('EARN_CRYSTALS', { earned: reward.crystals });
    }
    if (reward?.badges?.length) {
        reward.badges.forEach(b => dispatch('ADD_BADGE', { badge: b }));
    }
    dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });

    _showResults(passed, reward);
}

function _showResults(passed: boolean, reward: MiniGameRewardDto | null): void {
    const overlay = document.getElementById('mg-result-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    _setText('mg-result-icon', passed ? '🛬' : '💥');
    _setText('mg-result-title', passed ? 'Посадка выполнена!' : 'Посадка провалена!');
    _setText('mg-result-text', `Здоровье: ${_health}%  •  Уклонений: ${_dodged}  •  Счёт: ${_score}`);

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

function _updateHud(landingEtaSeconds: number): void {
    _setText('mg-timer', String(Math.ceil(Math.max(0, landingEtaSeconds))));

    const healthText = `${Math.max(0, Math.round(_health))}%`;
    _setText('mg-health', healthText);
    const healthEl = document.getElementById('mg-health');
    if (healthEl) {
        healthEl.style.color = _health > 60 ? '#4ade80' : _health > 30 ? '#facc15' : '#f87171';
        healthEl.style.textShadow = _hitFlash > 0 ? '0 0 14px rgba(248,113,113,0.9)' : 'none';
    }
}

function _bindInput(): void {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup', _onKeyUp);
    _canvas?.addEventListener('mousemove', _onMouseMove);
    _canvas?.addEventListener('touchmove', _onTouchMove, { passive: false });
}

function _onKeyDown(e: KeyboardEvent): void {
    _keys[e.code] = true;
    _pointerTarget = null;
}

function _onKeyUp(e: KeyboardEvent): void {
    _keys[e.code] = false;
}

function _onMouseMove(e: MouseEvent): void {
    if (!_canvas || !_ship) return;
    const rect = _canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    _pointerTarget = new THREE.Vector2(
        THREE.MathUtils.lerp(-SHIP_BOUNDS_X, SHIP_BOUNDS_X, nx),
        THREE.MathUtils.lerp(SHIP_BOUNDS_Y, -SHIP_BOUNDS_Y, ny)
    );
}

function _onTouchMove(e: TouchEvent): void {
    if (!_canvas) return;
    e.preventDefault();
    if (!e.touches.length) return;
    const t = e.touches[0];
    _onMouseMove(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
}

function _setText(id: string, value: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _clearAsteroids(): void {
    for (const a of _asteroids) {
        _scene?.remove(a.mesh);
    }
    _asteroids = [];
}

function _disposeScene(): void {
    _clearAsteroids();

    if (_scene) {
        disposeSceneGraph(_scene);
    }

    _ship = null;
    _planet = null;
    _planetGlow = null;
    _stars = null;
    _scene = null;
    _camera = null;

    // Dispose shared asteroid resources
    _asteroidGeo?.dispose(); _asteroidGeo = null;
    _asteroidMat?.dispose(); _asteroidMat = null;

    if (_renderer) {
        _renderer.dispose();
        _renderer = null;
    }
}

function _cleanup(): void {
    if (_animId) {
        cancelAnimationFrame(_animId);
        _animId = null;
    }

    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup', _onKeyUp);
    if (_canvas) {
        _canvas.removeEventListener('mousemove', _onMouseMove);
        _canvas.removeEventListener('touchmove', _onTouchMove);
    }

    if (_resizeObs) {
        _resizeObs.disconnect();
        _resizeObs = null;
    }

    _disposeScene();
    _state = 'idle';
}

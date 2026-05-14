/**
 * progCutscene3d.ts — 3D кинематографическая кат-сцена для мини-игры «Кибернетика»
 *
 * Таймлайн (~8 секунд):
 *   0–3 сек  — корабль летит к голубой планете (speed lines, engine trail)
 *   3–4 сек  — EM-буря: электрические частицы вокруг корабля
 *   4–5.5 сек — trail глитчит (мерцание цвет цианом/красным), системы сбоят
 *   5.5–6 сек — двигатели гаснут, корабль «дёргается»
 *   6–8 сек  — корабль дрейфует без тяги в темноте
 */

import * as THREE from 'three';
import { loadShipGroup } from '../systems/shipLoader.js';
import { spawnParticleBurst } from '../systems/particleEffects.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { playSfx } from '../audioManager.js';

// ── Константы сцены ─────────────────────────────────────────────────────────

const CUTSCENE_DURATION  = 8.0;
const PLANET_START_Z     = -120;
const PLANET_COLOR       = 0x4fc3f7;  // голубой — Туманность Кибернетики
const PLANET_GLOW_COLOR  = 0x93c5fd;
const PLANET_RADIUS      = 18;
const SPEED_LINES_COUNT  = 300;
const ENGINE_TRAIL_COUNT = 50;
const STAR_COUNT         = 2000;

// ── Типы ────────────────────────────────────────────────────────────────────

export type ProgCutsceneEvent = 'approach' | 'em_storm_detected' | 'system_failure' | 'computer_offline';

export type ProgCutsceneTimelineCallback = (event: ProgCutsceneEvent) => void;

export interface ProgCutsceneApi {
    play(): Promise<void>;
    stop(): void;
    dispose(): void;
}

// ── Фабричная функция ────────────────────────────────────────────────────────

export function createProgCutscene(
    canvas: HTMLCanvasElement,
    shipColor: string,
    onEvent: ProgCutsceneTimelineCallback,
): ProgCutsceneApi {
    let _renderer:  THREE.WebGLRenderer | null = null;
    let _scene:     THREE.Scene | null = null;
    let _camera:    THREE.PerspectiveCamera | null = null;
    let _animId:    number | null = null;
    let _startTime  = 0;
    let _stopped    = false;

    let _ship:          THREE.Group | null = null;
    let _planet:        THREE.Mesh | null = null;
    let _planetGlow:    THREE.Mesh | null = null;
    let _stars:         THREE.Points | null = null;
    let _speedLines:    THREE.LineSegments | null = null;
    let _speedLinesGeo: THREE.BufferGeometry | null = null;
    let _trailPoints:   THREE.Points | null = null;
    let _trailGeo:      THREE.BufferGeometry | null = null;
    let _trailPositions: Float32Array | null = null;

    let _firedApproach  = false;
    let _firedStorm     = false;
    let _firedFailure   = false;
    let _firedOffline   = false;

    // Флаг глитча — активен когда идут спавны EM-частиц
    let _glitchActive   = false;
    let _glitchFrame    = 0;

    let _shakeIntensity = 0;
    let _resolve: (() => void) | null = null;
    let _resizeObs: ResizeObserver | null = null;

    // ── Инициализация ─────────────────────────────────────────────────────

    async function _init(): Promise<void> {
        const parent = canvas.parentElement!;
        const w = parent.clientWidth  || 800;
        const h = parent.clientHeight || 600;

        _renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.setClearColor(0x020710, 1);
        _renderer.setSize(w, h, false);

        _scene = new THREE.Scene();
        _scene.fog = new THREE.FogExp2(0x020710, 0.02);

        _camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 600);
        _camera.position.set(0, 4, 18);
        _camera.lookAt(0, 0, -20);

        _scene.add(new THREE.AmbientLight(0x1a2040, 0.8));

        const keyLight = new THREE.DirectionalLight(0xd0e8ff, 1.2);
        keyLight.position.set(5, 8, 10);
        _scene.add(keyLight);

        // Голубой ободок от планеты
        const rimLight = new THREE.PointLight(PLANET_COLOR, 2.5, 140);
        rimLight.position.set(0, 2, -40);
        _scene.add(rimLight);

        // Фиолетовый акцент
        const accentLight = new THREE.PointLight(0x818cf8, 1.5, 80);
        accentLight.position.set(-5, 0, 5);
        _scene.add(accentLight);

        _buildStarfield();
        _buildSpeedLines();
        _buildPlanet();
        await _buildShip();
        _buildEngineTrail();

        _resizeObs = new ResizeObserver(() => {
            if (!_renderer || !_camera) return;
            const p = canvas.parentElement;
            if (!p) return;
            const rw = p.clientWidth;
            const rh = p.clientHeight;
            if (rw === 0 || rh === 0) return;
            _camera.aspect = rw / rh;
            _camera.updateProjectionMatrix();
            _renderer.setSize(rw, rh, false);
        });
        _resizeObs.observe(parent);
    }

    // ── Строители объектов ────────────────────────────────────────────────

    function _buildStarfield(): void {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 200;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
            pos[i * 3 + 2] = -Math.random() * 400;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xdbeafe,
            size: 0.14,
            transparent: true,
            opacity: 0.75,
        });
        _stars = new THREE.Points(geo, mat);
        _scene!.add(_stars);
    }

    function _buildSpeedLines(): void {
        const positions = new Float32Array(SPEED_LINES_COUNT * 6);
        for (let i = 0; i < SPEED_LINES_COUNT; i++) {
            const angle  = Math.random() * Math.PI * 2;
            const radius = 3 + Math.random() * 14;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const z = -(Math.random() * 200 + 20);
            const idx = i * 6;
            positions[idx]     = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;
            positions[idx + 3] = x;
            positions[idx + 4] = y;
            positions[idx + 5] = z - 0.5;
        }
        _speedLinesGeo = new THREE.BufferGeometry();
        _speedLinesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0x4fc3f7,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        _speedLines = new THREE.LineSegments(_speedLinesGeo, mat);
        _scene!.add(_speedLines);
    }

    function _buildPlanet(): void {
        const color = new THREE.Color(PLANET_COLOR);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.2,
            roughness: 0.5,
            metalness: 0.2,
        });
        _planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS, 48, 36), mat);
        _planet.position.set(0, 0, PLANET_START_Z);

        const glowMat = new THREE.MeshBasicMaterial({
            color: PLANET_GLOW_COLOR,
            transparent: true,
            opacity: 0.18,
            side: THREE.BackSide,
        });
        _planetGlow = new THREE.Mesh(
            new THREE.SphereGeometry(PLANET_RADIUS + 3, 32, 24),
            glowMat,
        );
        _planetGlow.position.copy(_planet.position);

        _scene!.add(_planet);
        _scene!.add(_planetGlow);
    }

    async function _buildShip(): Promise<void> {
        _ship = await loadShipGroup(shipColor, new THREE.Vector3(0, 0, 6));
        _scene!.add(_ship);
    }

    function _buildEngineTrail(): void {
        _trailPositions = new Float32Array(ENGINE_TRAIL_COUNT * 3);
        _trailGeo = new THREE.BufferGeometry();
        _trailGeo.setAttribute('position', new THREE.BufferAttribute(_trailPositions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x4fc3f7,
            size: 0.25,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        _trailPoints = new THREE.Points(_trailGeo, mat);
        _scene!.add(_trailPoints);
    }

    // ── Render loop ───────────────────────────────────────────────────────

    function _loop(now: number): void {
        if (_stopped || !_renderer || !_scene || !_camera) return;

        const t = (now - _startTime) / 1000;

        // ── Таймлайн событий ──
        if (!_firedApproach && t >= 0.1) {
            _firedApproach = true;
            onEvent('approach');
        }
        if (!_firedStorm && t >= 3.0) {
            _firedStorm = true;
            onEvent('em_storm_detected');
            _spawnEMBurst();
        }
        if (!_firedFailure && t >= 4.5) {
            _firedFailure = true;
            onEvent('system_failure');
            _triggerSystemFailure();
        }
        if (!_firedOffline && t >= 6.0) {
            _firedOffline = true;
            onEvent('computer_offline');
        }

        // Повторные EM-вспышки пока буря активна
        if (t >= 3.0 && t < 5.5 && Math.random() < 0.04) {
            _spawnEMBurst();
        }

        _updateCamera(t);
        _updateShip(t);
        _updatePlanet(t);
        _updateSpeedLines(t);
        _updateEngineTrail(t);

        if (_shakeIntensity > 0) {
            _shakeIntensity *= 0.85;
            if (_shakeIntensity < 0.01) _shakeIntensity = 0;
            _applyShake();
        }

        _renderer.render(_scene, _camera);

        if (t < CUTSCENE_DURATION) {
            _animId = requestAnimationFrame(_loop);
        } else {
            _resolve?.();
        }
    }

    // ── Обновление объектов ───────────────────────────────────────────────

    function _updateCamera(t: number): void {
        if (!_camera) return;

        if (t < 3.0) {
            const drift = Math.sin(t * 0.5) * 0.3;
            _camera.position.set(drift, 4 + Math.sin(t * 0.3) * 0.5, 18);
            _camera.lookAt(0, 0, -20);
            _camera.fov = 60;
        } else if (t < 5.0) {
            // Зум при обнаружении бури
            const progress = (t - 3.0) / 2.0;
            _camera.position.set(
                Math.sin(t * 2) * 0.3,    // лёгкое дрожание
                4 - progress * 1.0,
                18 - progress * 4,
            );
            _camera.fov = 60 + progress * 8;
            _camera.lookAt(0, 0, -15);
        } else if (t < 6.0) {
            // Сбой — резкая тряска применяется отдельно
            _camera.position.set(-1.5, 3.5, 15);
            _camera.fov = 70;
            _camera.lookAt(0, 0, -5);
        } else {
            // Отъезд — корабль дрейфует
            const progress = Math.min(1, (t - 6.0) / 2.0);
            _camera.position.set(
                -1.5 - progress * 2,
                3.5 + progress * 2,
                15 + progress * 7,
            );
            _camera.fov = 70 - progress * 8;
            _camera.lookAt(0, 0, -5);
        }
        _camera.updateProjectionMatrix();
    }

    function _updateShip(t: number): void {
        if (!_ship) return;

        if (t < 3.0) {
            _ship.position.z = 6 - t * 0.4;
            _ship.rotation.y = Math.sin(t * 0.4) * 0.05;
        } else if (t < 5.5) {
            // EM-буря — корабль начинает дёргаться
            const p = (t - 3.0) / 2.5;
            const jitter = p * 0.15;
            _ship.position.z = 6 - t * 0.4;
            _ship.position.x = (Math.random() - 0.5) * jitter;
            _ship.position.y = (Math.random() - 0.5) * jitter;
            _ship.rotation.z = (Math.random() - 0.5) * jitter * 0.5;
        } else {
            // Дрейф без тяги
            _ship.rotation.z += 0.001;
            _ship.rotation.x += 0.0005;
            _ship.position.z -= 0.005;
        }
    }

    function _updatePlanet(t: number): void {
        if (!_planet || !_planetGlow) return;
        const approach = Math.max(0, t - 1.0) * 1.5;
        _planet.position.z = PLANET_START_Z + approach;
        _planetGlow.position.z = _planet.position.z;
        _planet.rotation.y += 0.003;
        _planetGlow.rotation.y = _planet.rotation.y;
    }

    function _updateSpeedLines(t: number): void {
        if (!_speedLinesGeo || !_speedLines) return;

        let speed = 8;
        let lineLen = 1.2;
        let opacity = 0.18;

        if (t >= 3.0 && t < 5.5) {
            // Нарастание бури — лайны ускоряются
            const p = (t - 3.0) / 2.5;
            speed = 8 + p * 20;
            lineLen = 1.2 + p * 1.5;
            opacity = 0.18 + p * 0.2;
        } else if (t >= 5.5) {
            // После отказа двигателей — замедляются
            const p = Math.min(1, (t - 5.5) / 1.5);
            speed = 28 - p * 22;
            lineLen = 2.7 - p * 2.0;
            opacity = 0.38 - p * 0.3;
        }

        const mat = _speedLines.material as THREE.LineBasicMaterial;
        mat.opacity = Math.max(0.02, opacity);

        const pos = _speedLinesGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const count = arr.length / 6;

        for (let i = 0; i < count; i++) {
            const idx = i * 6;
            arr[idx + 2] += speed * 0.016;
            arr[idx + 5] += speed * 0.016;
            arr[idx + 5] = arr[idx + 2] - lineLen;

            if (arr[idx + 2] > 20) {
                const angle = Math.random() * Math.PI * 2;
                const r = 3 + Math.random() * 14;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                const z = -(100 + Math.random() * 150);
                arr[idx]     = x;
                arr[idx + 1] = y;
                arr[idx + 2] = z;
                arr[idx + 3] = x;
                arr[idx + 4] = y;
                arr[idx + 5] = z - lineLen;
            }
        }
        pos.needsUpdate = true;
    }

    function _updateEngineTrail(t: number): void {
        if (!_ship || !_trailPositions || !_trailGeo || !_trailPoints) return;

        // После сбоя trail гаснет
        let trailAlpha = 1.0;
        if (t >= 5.5) {
            trailAlpha = Math.max(0, 1 - (t - 5.5) / 1.0);
        }

        // Сдвигаем след
        for (let i = ENGINE_TRAIL_COUNT - 1; i > 0; i--) {
            _trailPositions[i * 3]     = _trailPositions[(i - 1) * 3]     + (Math.random() - 0.5) * 0.05;
            _trailPositions[i * 3 + 1] = _trailPositions[(i - 1) * 3 + 1] + (Math.random() - 0.5) * 0.05;
            _trailPositions[i * 3 + 2] = _trailPositions[(i - 1) * 3 + 2] + 6 * 0.016;
        }
        _trailPositions[0] = _ship.position.x + (Math.random() - 0.5) * 0.1;
        _trailPositions[1] = _ship.position.y - 0.3;
        _trailPositions[2] = _ship.position.z + 0.9;

        (_trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        const mat = _trailPoints.material as THREE.PointsMaterial;
        mat.opacity = 0.7 * trailAlpha;

        // Глитч-эффект: trail мерцает между голубым и красным во время бури
        if (t >= 3.0 && t < 5.5) {
            _glitchFrame++;
            if (_glitchFrame % 8 < 3) {
                mat.color.setHex(0xff2244);  // красный глитч
            } else {
                mat.color.setHex(0x4fc3f7);  // нормальный голубой
            }
        } else {
            mat.color.setHex(0x4fc3f7);
        }
    }

    // ── EM-буря ───────────────────────────────────────────────────────────

    function _spawnEMBurst(): void {
        if (!_scene || !_ship) return;
        const pos = _ship.position.clone();

        // Голубые электро-частицы
        spawnParticleBurst(_scene, pos, 0x4fc3f7, 18, 12, 1.2, 0.06);
        // Фиолетовые
        spawnParticleBurst(_scene, pos, 0x818cf8, 14, 10, 1.0, 0.05);

        playSfx('shield_warning');
    }

    function _triggerSystemFailure(): void {
        _glitchActive = true;
        _shakeIntensity = 0.8;

        // DOM-вспышка голубого цвета
        const flash = document.getElementById('prog-hit-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => {
                if (flash) flash.style.opacity = '0';
            }, 80);
        }

        playSfx('asteroid_hit');
    }

    function _applyShake(): void {
        if (!_camera) return;
        const i = _shakeIntensity;
        _camera.position.x += (Math.random() - 0.5) * i * 0.4;
        _camera.position.y += (Math.random() - 0.5) * i * 0.3;
    }

    // ── Очистка ───────────────────────────────────────────────────────────

    function _disposeAll(): void {
        if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }

        if (_scene) {
            disposeSceneGraph(_scene);
            _scene = null;
        }

        _ship = null;
        _planet = null;
        _planetGlow = null;
        _stars = null;
        _speedLines = null;
        _speedLinesGeo = null;
        _trailPoints = null;
        _trailGeo = null;
        _trailPositions = null;

        if (_renderer) {
            _renderer.forceContextLoss();
            _renderer.dispose();
            _renderer = null;
        }
    }

    // ── Публичный API ─────────────────────────────────────────────────────

    return {
        async play(): Promise<void> {
            await _init();

            return new Promise<void>((resolve) => {
                _resolve = resolve;
                _startTime = performance.now();
                _animId = requestAnimationFrame(_loop);
            });
        },

        stop(): void {
            _stopped = true;
            if (_animId !== null) {
                cancelAnimationFrame(_animId);
                _animId = null;
            }
            _resolve?.();
            _resolve = null;
        },

        dispose(): void {
            _stopped = true;
            if (_animId !== null) {
                cancelAnimationFrame(_animId);
                _animId = null;
            }
            _disposeAll();
        },
    };
}

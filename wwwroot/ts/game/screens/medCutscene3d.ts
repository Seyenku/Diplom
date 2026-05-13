/**
 * medCutscene3d.ts — 3D кинематографическая кат-сцена для мини-игры «Медицина»
 *
 * Таймлайн (~8 секунд):
 *   0–3 сек  — корабль летит к красной планете (speed lines, engine trail)
 *   3–4.5 сек — астероид появляется из глубины
 *   4.5–5 сек — корабль пытается уклониться (roll)
 *   5–6 сек  — СТОЛКНОВЕНИЕ (частицы, вспышка, camera shake)
 *   6–8 сек  — корабль дрейфует повреждённый, trail гаснет
 *
 * Использует существующие системы:
 *   - loadShipGroup()        из systems/shipLoader
 *   - spawnHitParticles()    из systems/particleEffects
 *   - spawnParticleBurst()   из systems/particleEffects
 *   - disposeSceneGraph()    из threeUtils
 */

import * as THREE from 'three';
import { loadShipGroup } from '../systems/shipLoader.js';
import { spawnHitParticles, spawnParticleBurst } from '../systems/particleEffects.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { playSfx } from '../audioManager.js';

// ── Константы сцены ─────────────────────────────────────────────────────────

const CUTSCENE_DURATION  = 8.0;   // секунд
const PLANET_START_Z     = -120;
const PLANET_COLOR       = 0xf87171;  // красный — Туманность Целителей
const PLANET_GLOW_COLOR  = 0xfca5a5;
const PLANET_RADIUS      = 18;
const SPEED_LINES_COUNT  = 300;
const ENGINE_TRAIL_COUNT = 50;
const STAR_COUNT         = 2000;

// ── Типы ────────────────────────────────────────────────────────────────────

export type CutsceneEvent = 'approach' | 'asteroid_spotted' | 'impact' | 'captain_hurt';

export type CutsceneTimelineCallback = (event: CutsceneEvent) => void;

export interface MedCutsceneApi {
    play(): Promise<void>;
    stop(): void;
    dispose(): void;
}

// ── Фабричная функция ────────────────────────────────────────────────────────

export function createMedCutscene(
    canvas: HTMLCanvasElement,
    shipColor: string,
    onEvent: CutsceneTimelineCallback,
): MedCutsceneApi {
    // ── Внутреннее состояние ──────────────────────────────────────────────

    let _renderer:  THREE.WebGLRenderer | null = null;
    let _scene:     THREE.Scene | null = null;
    let _camera:    THREE.PerspectiveCamera | null = null;
    let _animId:    number | null = null;
    let _startTime  = 0;
    let _stopped    = false;

    // Объекты сцены
    let _ship:         THREE.Group | null = null;
    let _planet:       THREE.Mesh | null = null;
    let _planetGlow:   THREE.Mesh | null = null;
    let _asteroid:     THREE.Mesh | null = null;
    let _stars:        THREE.Points | null = null;
    let _speedLines:   THREE.LineSegments | null = null;
    let _speedLinesGeo: THREE.BufferGeometry | null = null;
    let _trailPoints:  THREE.Points | null = null;
    let _trailGeo:     THREE.BufferGeometry | null = null;
    let _trailPositions: Float32Array | null = null;

    // Флаги событий (чтобы не срабатывали повторно)
    let _firedApproach    = false;
    let _firedAsteroid    = false;
    let _firedImpact      = false;
    let _firedHurt        = false;
    let _impacted         = false;

    // Camera shake
    let _shakeIntensity = 0;

    // Promise resolve
    let _resolve: (() => void) | null = null;
    let _resizeObs: ResizeObserver | null = null;

    // ── Инициализация Three.js ────────────────────────────────────────────

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

        // Освещение
        _scene.add(new THREE.AmbientLight(0x1a2040, 0.8));

        const keyLight = new THREE.DirectionalLight(0xffd0d0, 1.2);
        keyLight.position.set(5, 8, 10);
        _scene.add(keyLight);

        // Красный ободок от планеты
        const rimLight = new THREE.PointLight(PLANET_COLOR, 2.5, 140);
        rimLight.position.set(0, 2, -40);
        _scene.add(rimLight);

        // Строим объекты
        _buildStarfield();
        _buildSpeedLines();
        _buildPlanet();
        _buildAsteroid();
        await _buildShip();
        _buildEngineTrail();

        // ResizeObserver
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
            color: 0x8899cc,
            transparent: true,
            opacity: 0.22,
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
            roughness: 0.6,
            metalness: 0.1,
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

    function _buildAsteroid(): void {
        const geo = new THREE.IcosahedronGeometry(1.4, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x7c8a9e,
            roughness: 0.9,
            metalness: 0.1,
        });
        _asteroid = new THREE.Mesh(geo, mat);
        // Прячем за камерой, появится в нужный момент
        _asteroid.position.set(3, 1, -200);
        _asteroid.visible = false;
        _scene!.add(_asteroid);
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
        const dt = 0.016; // ~60fps step для простоты

        // ── Таймлайн событий ──
        if (!_firedApproach && t >= 0.1) {
            _firedApproach = true;
            onEvent('approach');
        }
        if (!_firedAsteroid && t >= 3.0) {
            _firedAsteroid = true;
            onEvent('asteroid_spotted');
            if (_asteroid) _asteroid.visible = true;
        }
        if (!_firedImpact && t >= 5.0) {
            _firedImpact = true;
            _triggerImpact();
        }
        if (!_firedHurt && t >= 6.0) {
            _firedHurt = true;
            onEvent('captain_hurt');
        }

        // ── Обновление объектов ──
        _updateCamera(t);
        _updateShip(t, dt);
        _updatePlanet(t, dt);
        if (t >= 3.0) _updateAsteroid(t, dt);
        _updateSpeedLines(t, dt);
        _updateEngineTrail(t, dt);

        // Camera shake decay
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
            // Позади-сверху корабля, небольшой drift
            const drift = Math.sin(t * 0.5) * 0.3;
            _camera.position.set(drift, 4 + Math.sin(t * 0.3) * 0.5, 18);
            _camera.lookAt(0, 0, -20);
            _camera.fov = 60;
        } else if (t < 5.0) {
            // Зум — камера приближается к кораблю
            const progress = (t - 3.0) / 2.0; // 0→1
            _camera.position.set(
                0,
                4 - progress * 1.5,
                18 - progress * 6,
            );
            _camera.fov = 60 + progress * 10; // расширение FOV для «скорости»
            _camera.lookAt(0, 0, -10);
        } else if (t < 6.0) {
            // Удар — резкая тряска уже применяется отдельно
            _camera.position.set(-2, 3.5, 14);
            _camera.fov = 72;
            _camera.lookAt(0, 0, -5);
        } else {
            // Отъезд — камера отходит, смотрит на повреждённый корабль
            const progress = Math.min(1, (t - 6.0) / 2.0);
            _camera.position.set(
                -2 - progress * 2,
                3.5 + progress * 2,
                14 + progress * 8,
            );
            _camera.fov = 72 - progress * 10;
            _camera.lookAt(0, 0, -5);
        }
        _camera.updateProjectionMatrix();
    }

    function _updateShip(t: number, _dt: number): void {
        if (!_ship) return;

        if (t < 4.5) {
            // Плавное движение вперёд
            _ship.position.z = 6 - t * 0.4;
            _ship.rotation.y = Math.sin(t * 0.4) * 0.05;
        } else if (t < 5.0) {
            // Маневр уклонения — крен вбок
            const p = (t - 4.5) / 0.5; // 0→1
            _ship.position.x = p * 2.5;
            _ship.rotation.z = -p * 0.4; // крен влево
        } else if (t < 5.1) {
            // Момент удара — резкий сдвиг
            _ship.position.x = 2.5 + (Math.random() - 0.5) * 0.5;
            _ship.position.y = (Math.random() - 0.5) * 0.4;
        } else {
            // Дрейф — медленное вращение
            _ship.rotation.z += 0.002;
            _ship.rotation.x += 0.001;
            _ship.position.z -= 0.01;
        }
    }

    function _updatePlanet(t: number, _dt: number): void {
        if (!_planet || !_planetGlow) return;

        // Планета приближается
        const approach = Math.max(0, t - 1.0) * 1.5;
        _planet.position.z = PLANET_START_Z + approach;
        _planetGlow.position.z = _planet.position.z;

        _planet.rotation.y += 0.003;
        _planetGlow.rotation.y = _planet.rotation.y;
    }

    function _updateAsteroid(t: number, _dt: number): void {
        if (!_asteroid) return;

        const localT = t - 3.0; // 0 в момент появления

        if (localT < 0) return;

        if (localT < 2.0) {
            // Астероид летит прямо на корабль
            const progress = localT / 2.0; // 0→1
            _asteroid.position.z = -120 + progress * 125; // от -120 до +5
            _asteroid.position.x = 3 - progress * 0.8;
            _asteroid.position.y = 1 - progress * 0.5;
            _asteroid.rotation.x += 0.04;
            _asteroid.rotation.y += 0.03;
        } else {
            // После столкновения — удаляем из вида
            _asteroid.visible = false;
        }
    }

    function _updateSpeedLines(t: number, _dt: number): void {
        if (!_speedLinesGeo || !_speedLines) return;

        // Скорость лайнов зависит от фазы
        let speed = 8;
        let lineLen = 1.2;
        let opacity = 0.22;

        if (t >= 3.0 && t < 5.0) {
            // Ускорение при приближении астероида
            const p = (t - 3.0) / 2.0;
            speed = 8 + p * 30;
            lineLen = 1.2 + p * 2.5;
            opacity = 0.22 + p * 0.3;
        } else if (t >= 5.0) {
            // После удара — замедляемся
            const p = Math.min(1, (t - 5.0) / 2.0);
            speed = 38 - p * 30;
            lineLen = 3.7 - p * 2.5;
            opacity = 0.52 - p * 0.3;
        }

        const mat = _speedLines.material as THREE.LineBasicMaterial;
        mat.opacity = Math.max(0.05, opacity);

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

    function _updateEngineTrail(t: number, _dt: number): void {
        if (!_ship || !_trailPositions || !_trailGeo || !_trailPoints) return;

        // После удара trail гаснет
        let trailAlpha = 1.0;
        if (t >= 5.0) {
            trailAlpha = Math.max(0, 1 - (t - 5.0) / 1.5);
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

        // Меняем цвет после удара на оранжевый (огонь)
        if (t >= 5.0 && t < 6.5) {
            mat.color.setHex(0xff6633);
        } else {
            mat.color.setHex(0x4fc3f7);
        }
    }

    // ── Событие столкновения ──────────────────────────────────────────────

    function _triggerImpact(): void {
        _impacted = true;
        onEvent('impact');

        if (!_scene || !_ship) return;

        const impactPos = _ship.position.clone();
        impactPos.z -= 1;

        // Красные частицы (кровь/разрушение)
        spawnHitParticles(_scene, impactPos);

        // Оранжевые искры
        spawnParticleBurst(_scene, impactPos, 0xff8833, 20, 10, 1.0, 0.08);

        // Белые осколки
        spawnParticleBurst(_scene, impactPos, 0xffffff, 12, 8, 0.7, 0.04);

        // Звук
        playSfx('asteroid_hit');

        // Camera shake
        _shakeIntensity = 1.2;

        // Вспышка в DOM
        const flash = document.getElementById('med-hit-flash');
        if (flash) {
            flash.style.opacity = '1';
            setTimeout(() => {
                if (flash) flash.style.opacity = '0';
            }, 60);
        }
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
        _asteroid = null;
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

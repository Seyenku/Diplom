/**
 * geoCutscene3d.ts — 3D кинематографическая кат-сцена для мини-игры «Геология»
 *
 * Таймлайн (~8 секунд):
 *   0–2 сек   — корабль летит к зелёно-коричневой планете
 *   2–3.5 сек — астероидный пояс на переднем плане, корабль замедляется
 *   3.5–5.2 сек — корабль зависает, зонд вылетает к астероиду
 *   5.2–6.5 сек — зонд закреплён, scan-кольца пульсируют
 *   6.5–8 сек — широкий план: планета, астероид с зондом
 */

import * as THREE from 'three';
import { loadShipGroup } from '../systems/shipLoader.js';
import { spawnParticleBurst } from '../systems/particleEffects.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { playSfx } from '../audioManager.js';

// ── Константы ────────────────────────────────────────────────────────────────

const CUTSCENE_DURATION = 8.0;
const PLANET_START_Z    = -120;
const PLANET_COLOR      = 0x7a9e50;
const PLANET_GLOW_COLOR = 0xa8c878;
const PLANET_RADIUS     = 18;
const SPEED_LINES_COUNT = 300;
const ENGINE_TRAIL_COUNT = 50;
const STAR_COUNT        = 2000;

const ASTEROID_POS = new THREE.Vector3(0, 0, -35);

// Позиции малых астероидов пояса
const BELT_OFFSETS: [number, number, number][] = [
    [-8,  3, -20], [ 7, -4, -22], [-5, -2, -18],
    [10,  1, -25], [-9,  2, -28], [ 4,  5, -17],
    [-3, -5, -30], [ 8, -2, -26],
];

// ── Типы ─────────────────────────────────────────────────────────────────────

export type GeoCutsceneEvent =
    'approach' | 'asteroid_belt_spotted' | 'probe_launched' | 'probe_attached' | 'scan_complete';

export interface GeoCutsceneApi {
    play(): Promise<void>;
    stop(): void;
    dispose(): void;
}

// ── Фабричная функция ────────────────────────────────────────────────────────

export function createGeoCutscene(
    canvas: HTMLCanvasElement,
    shipColor: string,
    onEvent: (event: GeoCutsceneEvent) => void,
): GeoCutsceneApi {

    let _renderer:  THREE.WebGLRenderer | null = null;
    let _scene:     THREE.Scene | null = null;
    let _camera:    THREE.PerspectiveCamera | null = null;
    let _animId:    number | null = null;
    let _startTime  = 0;
    let _stopped    = false;

    let _ship:           THREE.Group | null = null;
    let _planet:         THREE.Mesh | null = null;
    let _planetGlow:     THREE.Mesh | null = null;
    let _targetAsteroid: THREE.Mesh | null = null;
    let _beltAsteroids:  THREE.Mesh[] = [];
    let _stars:          THREE.Points | null = null;
    let _speedLines:     THREE.LineSegments | null = null;
    let _speedLinesGeo:  THREE.BufferGeometry | null = null;
    let _trailPoints:    THREE.Points | null = null;
    let _trailGeo:       THREE.BufferGeometry | null = null;
    let _trailPositions: Float32Array | null = null;
    let _probe:          THREE.Points | null = null;
    let _probePos:       THREE.Vector3 = new THREE.Vector3();
    let _scanRings:      THREE.Mesh[] = [];
    let _drillLight:     THREE.PointLight | null = null;

    let _firedApproach  = false;
    let _firedBelt      = false;
    let _firedProbe     = false;
    let _firedAttached  = false;
    let _firedScan      = false;

    let _shakeIntensity = 0;
    let _resolve: (() => void) | null = null;
    let _resizeObs: ResizeObserver | null = null;

    // ── Инициализация ─────────────────────────────────────────────────────

    async function _init(): Promise<void> {
        const parent = canvas.parentElement!;
        const w = parent.clientWidth  || 800;
        const h = parent.clientHeight || 600;

        _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.setClearColor(0x020710, 1);
        _renderer.setSize(w, h, false);

        _scene = new THREE.Scene();
        _scene.fog = new THREE.FogExp2(0x020710, 0.018);

        _camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 600);
        _camera.position.set(0, 4, 18);
        _camera.lookAt(0, 0, -20);

        _scene.add(new THREE.AmbientLight(0x1a2a14, 0.8));

        const keyLight = new THREE.DirectionalLight(0xd8e8c0, 1.2);
        keyLight.position.set(5, 8, 10);
        _scene.add(keyLight);

        const rimLight = new THREE.PointLight(PLANET_COLOR, 2.5, 140);
        rimLight.position.set(0, 2, -40);
        _scene.add(rimLight);

        _drillLight = new THREE.PointLight(0x7aff50, 0, 20);
        _drillLight.position.copy(ASTEROID_POS);
        _scene.add(_drillLight);

        _buildStarfield();
        _buildSpeedLines();
        _buildPlanet();
        _buildBeltAsteroids();
        _buildTargetAsteroid();
        await _buildShip();
        _buildEngineTrail();
        _buildProbe();
        _buildScanRings();

        _resizeObs = new ResizeObserver(() => {
            if (!_renderer || !_camera) return;
            const p = canvas.parentElement;
            if (!p) return;
            const rw = p.clientWidth, rh = p.clientHeight;
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
        _stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xdbeafe, size: 0.14, transparent: true, opacity: 0.7,
        }));
        _scene!.add(_stars);
    }

    function _buildSpeedLines(): void {
        const positions = new Float32Array(SPEED_LINES_COUNT * 6);
        for (let i = 0; i < SPEED_LINES_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 3 + Math.random() * 14;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const z = -(Math.random() * 200 + 20);
            const idx = i * 6;
            positions[idx] = x; positions[idx+1] = y; positions[idx+2] = z;
            positions[idx+3] = x; positions[idx+4] = y; positions[idx+5] = z - 0.5;
        }
        _speedLinesGeo = new THREE.BufferGeometry();
        _speedLinesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        _speedLines = new THREE.LineSegments(_speedLinesGeo, new THREE.LineBasicMaterial({
            color: 0x7ab858, transparent: true, opacity: 0.16,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        _scene!.add(_speedLines);
    }

    function _buildPlanet(): void {
        const color = new THREE.Color(PLANET_COLOR);
        _planet = new THREE.Mesh(
            new THREE.SphereGeometry(PLANET_RADIUS, 48, 36),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.65, metalness: 0.05 }),
        );
        _planet.position.set(0, 0, PLANET_START_Z);

        _planetGlow = new THREE.Mesh(
            new THREE.SphereGeometry(PLANET_RADIUS + 3, 32, 24),
            new THREE.MeshBasicMaterial({ color: PLANET_GLOW_COLOR, transparent: true, opacity: 0.16, side: THREE.BackSide }),
        );
        _planetGlow.position.copy(_planet.position);

        _scene!.add(_planet);
        _scene!.add(_planetGlow);
    }

    function _buildBeltAsteroids(): void {
        const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a2e, roughness: 0.95 });
        for (const [x, y, z] of BELT_OFFSETS) {
            const radius = 0.4 + Math.random() * 0.8;
            const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat);
            mesh.position.set(x, y, z);
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            _beltAsteroids.push(mesh);
            _scene!.add(mesh);
        }
    }

    function _buildTargetAsteroid(): void {
        _targetAsteroid = new THREE.Mesh(
            new THREE.IcosahedronGeometry(2.5, 2),
            new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.95, metalness: 0.05 }),
        );
        _targetAsteroid.position.copy(ASTEROID_POS);
        _scene!.add(_targetAsteroid);
    }

    async function _buildShip(): Promise<void> {
        _ship = await loadShipGroup(shipColor, new THREE.Vector3(0, 0, 6));
        _scene!.add(_ship);
    }

    function _buildEngineTrail(): void {
        _trailPositions = new Float32Array(ENGINE_TRAIL_COUNT * 3);
        _trailGeo = new THREE.BufferGeometry();
        _trailGeo.setAttribute('position', new THREE.BufferAttribute(_trailPositions, 3));
        _trailPoints = new THREE.Points(_trailGeo, new THREE.PointsMaterial({
            color: 0x7aff50, size: 0.22, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        }));
        _scene!.add(_trailPoints);
    }

    function _buildProbe(): void {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        _probe = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xfde68a, size: 0.5, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        }));
        _scene!.add(_probe);
    }

    function _buildScanRings(): void {
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.2, 0.4, 32),
                new THREE.MeshBasicMaterial({
                    color: 0x7aff50, transparent: true, opacity: 0,
                    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
                }),
            );
            ring.position.copy(ASTEROID_POS);
            ring.rotation.x = Math.PI / 2;
            ring.userData['phaseOffset'] = i * 0.38;
            ring.scale.set(0, 0, 0);
            _scanRings.push(ring);
            _scene!.add(ring);
        }
    }

    // ── Render loop ───────────────────────────────────────────────────────

    function _loop(now: number): void {
        if (_stopped || !_renderer || !_scene || !_camera) return;
        const t = (now - _startTime) / 1000;

        if (!_firedApproach && t >= 0.1)  { _firedApproach = true; onEvent('approach'); }
        if (!_firedBelt     && t >= 2.0)  { _firedBelt = true; onEvent('asteroid_belt_spotted'); }
        if (!_firedProbe    && t >= 3.5)  { _firedProbe = true; onEvent('probe_launched'); playSfx('minigame_land'); }
        if (!_firedAttached && t >= 5.2)  { _firedAttached = true; onEvent('probe_attached'); }
        if (!_firedScan     && t >= 6.5)  { _firedScan = true; onEvent('scan_complete'); }

        _updateCamera(t);
        _updateShip(t);
        _updatePlanet();
        _updateBeltAsteroids();
        _updateSpeedLines(t);
        _updateEngineTrail(t);
        _updateProbe(t, now);
        _updateScanRings(t, now);

        if (_shakeIntensity > 0) {
            _shakeIntensity *= 0.88;
            if (_shakeIntensity < 0.01) _shakeIntensity = 0;
            _camera.position.x += (Math.random() - 0.5) * _shakeIntensity * 0.3;
            _camera.position.y += (Math.random() - 0.5) * _shakeIntensity * 0.2;
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
        if (t < 2.0) {
            // За кораблём
            const drift = Math.sin(t * 0.5) * 0.3;
            _camera.position.set(drift, 4 + Math.sin(t * 0.3) * 0.4, 18);
            _camera.lookAt(0, 0, -20);
            _camera.fov = 60;
        } else if (t < 3.5) {
            // Замедление — слегка надвигаемся
            const p = (t - 2.0) / 1.5;
            _camera.position.set(0, 4 - p * 0.5, 18 - p * 2);
            _camera.fov = 60 + p * 5;
            _camera.lookAt(0, 0, -25);
        } else if (t < 5.2) {
            // Боковой вид: видны и корабль, и астероид
            const p = Math.min(1, (t - 3.5) / 1.7);
            _camera.position.set(-p * 8, 4 + p * 2, 12 - p * 4);
            _camera.fov = 65;
            _camera.lookAt(-2, 0, -18);
        } else if (t < 6.5) {
            // Крупный план астероида с зондом
            const p = Math.min(1, (t - 5.2) / 1.3);
            _camera.position.set(-8 + p * 5, 6 - p * 1, 8 - p * 14);
            _camera.fov = 65 - p * 10;
            _camera.lookAt(0, 0, -35);
        } else {
            // Широкий план: отъезд
            const p = Math.min(1, (t - 6.5) / 1.5);
            _camera.position.set(-3 + p * 3, 5 + p * 5, -6 + p * 14);
            _camera.fov = 55 + p * 10;
            _camera.lookAt(0, 0, -30);
        }
        _camera.updateProjectionMatrix();
    }

    function _updateShip(t: number): void {
        if (!_ship) return;
        if (t < 2.0) {
            _ship.position.z = 6 - t * 0.4;
            _ship.rotation.y = Math.sin(t * 0.4) * 0.05;
        } else if (t < 3.5) {
            // Торможение
            const p = (t - 2.0) / 1.5;
            _ship.position.z = 6 - 2.0 * 0.4 - p * 0.15;
            _ship.rotation.y = Math.sin(t * 0.2) * 0.03;
        } else {
            // Зависание — лёгкое покачивание
            _ship.position.y = Math.sin(t * 1.2) * 0.12;
            _ship.rotation.z = Math.sin(t * 0.8) * 0.02;
        }
    }

    function _updatePlanet(): void {
        if (!_planet || !_planetGlow) return;
        // Планета медленно приближается до t=2, потом стоит
        _planet.rotation.y += 0.002;
        _planetGlow.rotation.y = _planet.rotation.y;
    }

    function _updateBeltAsteroids(): void {
        for (const ast of _beltAsteroids) {
            ast.rotation.y += 0.004 + ast.position.x * 0.0001;
            ast.rotation.x += 0.002;
        }
    }

    function _updateSpeedLines(t: number): void {
        if (!_speedLinesGeo || !_speedLines) return;

        let speed = 8;
        let lineLen = 1.2;
        let opacity = 0.16;

        if (t >= 2.0 && t < 3.5) {
            // Замедление
            const p = (t - 2.0) / 1.5;
            speed = 8 - p * 6;
            lineLen = 1.2 - p * 0.6;
            opacity = 0.16 - p * 0.08;
        } else if (t >= 3.5) {
            speed = 1.5;
            lineLen = 0.5;
            opacity = 0.05;
        }

        const mat = _speedLines.material as THREE.LineBasicMaterial;
        mat.opacity = Math.max(0.02, opacity);

        const pos = _speedLinesGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const count = arr.length / 6;
        for (let i = 0; i < count; i++) {
            const idx = i * 6;
            arr[idx+2] += speed * 0.016;
            arr[idx+5] += speed * 0.016;
            arr[idx+5] = arr[idx+2] - lineLen;
            if (arr[idx+2] > 20) {
                const angle = Math.random() * Math.PI * 2;
                const r = 3 + Math.random() * 14;
                const nx = Math.cos(angle) * r;
                const ny = Math.sin(angle) * r;
                const nz = -(100 + Math.random() * 150);
                arr[idx] = nx; arr[idx+1] = ny; arr[idx+2] = nz;
                arr[idx+3] = nx; arr[idx+4] = ny; arr[idx+5] = nz - lineLen;
            }
        }
        pos.needsUpdate = true;
    }

    function _updateEngineTrail(t: number): void {
        if (!_ship || !_trailPositions || !_trailGeo || !_trailPoints) return;

        // При зависании (t>3.5) trail постепенно тускнеет
        let alpha = 1.0;
        if (t >= 3.5) alpha = Math.max(0.1, 1 - (t - 3.5) / 2.0);

        for (let i = ENGINE_TRAIL_COUNT - 1; i > 0; i--) {
            _trailPositions[i*3]   = _trailPositions[(i-1)*3]   + (Math.random()-0.5)*0.05;
            _trailPositions[i*3+1] = _trailPositions[(i-1)*3+1] + (Math.random()-0.5)*0.05;
            _trailPositions[i*3+2] = _trailPositions[(i-1)*3+2] + 6 * 0.016;
        }
        _trailPositions[0] = _ship.position.x + (Math.random()-0.5)*0.1;
        _trailPositions[1] = _ship.position.y - 0.3;
        _trailPositions[2] = _ship.position.z + 0.9;

        (_trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (_trailPoints.material as THREE.PointsMaterial).opacity = 0.7 * alpha;
    }

    function _updateProbe(t: number, _now: number): void {
        if (!_probe) return;
        const mat = _probe.material as THREE.PointsMaterial;

        if (t < 3.5) {
            mat.opacity = 0;
            return;
        }

        // Зонд летит от корабля к астероиду (3.5 → 5.2)
        if (t < 5.2) {
            const p = Math.min(1, (t - 3.5) / 1.7);
            const ease = 1 - Math.pow(1 - p, 2);
            const shipPos = _ship?.position ?? new THREE.Vector3(0, 0, 5);
            _probePos.lerpVectors(shipPos, ASTEROID_POS, ease);
            const posAttr = _probe.geometry.attributes.position as THREE.BufferAttribute;
            (posAttr.array as Float32Array)[0] = _probePos.x;
            (posAttr.array as Float32Array)[1] = _probePos.y;
            (posAttr.array as Float32Array)[2] = _probePos.z;
            posAttr.needsUpdate = true;
            mat.opacity = 0.6 + ease * 0.4;
            mat.size = 0.5 + ease * 0.2;
        } else {
            // Зонд на астероиде — пульсирует
            const pulse = 0.7 + 0.3 * Math.sin(_now * 0.006);
            mat.opacity = pulse;
            mat.size = 0.4;
        }
    }

    function _updateScanRings(t: number, now: number): void {
        if (t < 5.2) return;
        const localT = t - 5.2;

        for (const ring of _scanRings) {
            const offset = ring.userData['phaseOffset'] as number;
            const phase = ((localT + offset) % 1.4) / 1.4;
            const s = phase * 4;
            ring.scale.set(s, s, s);
            (ring.material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI) * 0.6;
            // Разворачиваем кольца лицом к камере
            if (_camera) ring.lookAt(_camera.position);
        }

        // Свечение зонда на астероиде
        if (_drillLight) {
            _drillLight.intensity = 0.5 + 0.5 * Math.sin(now * 0.004);
        }
    }

    // ── Очистка ───────────────────────────────────────────────────────────

    function _disposeAll(): void {
        if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
        if (_scene) { disposeSceneGraph(_scene); _scene = null; }
        _ship = null; _planet = null; _planetGlow = null;
        _targetAsteroid = null; _beltAsteroids = [];
        _stars = null; _speedLines = null; _speedLinesGeo = null;
        _trailPoints = null; _trailGeo = null; _trailPositions = null;
        _probe = null; _scanRings = [];
        if (_renderer) { _renderer.forceContextLoss(); _renderer.dispose(); _renderer = null; }
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
            if (_animId !== null) { cancelAnimationFrame(_animId); _animId = null; }
            _resolve?.(); _resolve = null;
        },
        dispose(): void {
            _stopped = true;
            if (_animId !== null) { cancelAnimationFrame(_animId); _animId = null; }
            _disposeAll();
        },
    };
}

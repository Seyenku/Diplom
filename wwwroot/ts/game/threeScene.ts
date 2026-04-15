/**
 * threeScene.ts — Инициализация и управление Three.js сценой
 *
 * Canvas (#game-canvas) живёт в DOM постоянно.
 * Сцена меняется через switchScene() при смене экранов,
 * без destroy/recreate WebGL-контекста.
 *
 * Three.js файл: three.module.min.js (WebGL renderer)
 */

import * as THREE from 'three';
import { getProfile, onQualityChange } from './qualityPresets.js';

type SceneName = 'starfield' | 'asteroid-belt' | 'flight' | 'galaxy-map' | 'planet' | 'none';

let _renderer: THREE.WebGLRenderer | null = null;
let _currentScene: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let _animFrameId: number | null = null;
let _starfieldPoints: THREE.Points | null = null;
let _lastSceneName: SceneName = 'none';

// ────────────────────────────────────────────────────────────────────────────

/**
 * Инициализирует Three.js рендерер на указанном canvas.
 * Вызывается один раз при старте.
 */
export async function initThreeScene(canvasId: string): Promise<void> {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);

    const profile = getProfile();

    _renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: profile.antialias,
        alpha: true,
    });

    _renderer.setPixelRatio(profile.pixelRatio);
    _renderer.setSize((canvas.parentNode as HTMLElement)!.clientWidth, (canvas.parentNode as HTMLElement)!.clientHeight, false);
    _renderer.setClearColor(0x050a1a, 1);

    window.addEventListener('resize', _onResize);

    // Подписка на изменение качества графики
    onQualityChange(() => {
        recreateRenderer();
    });

    // Стартовая сцена — звёздное поле (фон главного меню)
    await switchScene('starfield');
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Переключает Three.js сцену без пересоздания WebGL-контекста.
 * Предыдущая сцена корректно очищается (dispose GPU-ресурсов).
 */
export async function switchScene(sceneName: SceneName): Promise<void> {
    if (_animFrameId) cancelAnimationFrame(_animFrameId);
    _disposeCurrentScene();

    _lastSceneName = sceneName;
    _currentScene = _buildScene(sceneName);
    _startRenderLoop();
}

/**
 * Пересоздаёт WebGL-рендерер с новыми параметрами качества.
 * Необходимо для смены antialias (параметр WebGL-контекста, нельзя менять на лету).
 */
export function recreateRenderer(): void {
    if (!_renderer) return;
    const profile = getProfile();
    const canvas = _renderer.domElement;
    const container = canvas.parentNode as HTMLElement;

    if (_animFrameId) cancelAnimationFrame(_animFrameId);
    _disposeCurrentScene();
    _renderer.dispose();

    _renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: profile.antialias,
        alpha: true,
    });
    _renderer.setPixelRatio(profile.pixelRatio);
    _renderer.setSize(container.clientWidth, container.clientHeight, false);
    _renderer.setClearColor(0x050a1a, 1);

    // Пересоздаём текущую сцену с новыми параметрами
    _currentScene = _buildScene(_lastSceneName);
    _startRenderLoop();
}

/** Рекурсивно освобождает GPU-ресурсы текущей сцены */
function _disposeCurrentScene(): void {
    if (!_currentScene) return;
    _currentScene.scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
                // Dispose текстур материала
                for (const key of Object.keys(mat)) {
                    const val = (mat as unknown as Record<string, unknown>)[key];
                    if (val instanceof THREE.Texture) val.dispose();
                }
                mat.dispose();
            });
        }
    });
    _starfieldPoints = null;
    _currentScene = null;
}

// ── Билдеры сцен ──────────────────────────────────────────────────────────

function _buildScene(name: SceneName): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null {
    const scene = new THREE.Scene();
    const canvas = _renderer!.domElement;
    const container = canvas.parentNode as HTMLElement;
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.z = 300;

    switch (name) {
        case 'starfield':
            _addStarfield(scene);
            break;
        case 'asteroid-belt':
            _addStarfield(scene);
            _addAsteroidBelt(scene);
            break;
        case 'flight': {
            const profile = getProfile();
            _addStarfield(scene, profile.flightStarfieldCount, 0.6);
            camera.position.set(0, 2, 8);
            camera.lookAt(0, 0, -50);
            // Освещение для flight
            scene.add(new THREE.AmbientLight(0x334155, 0.6));
            const dirLight = new THREE.DirectionalLight(0x4fc3f7, 1.2);
            dirLight.position.set(5, 10, 10);
            scene.add(dirLight);
            const backLight = new THREE.PointLight(0x818cf8, 0.8, 100);
            backLight.position.set(0, -5, -20);
            scene.add(backLight);
            break;
        }
        case 'galaxy-map':
            _addStarfield(scene, 2000, 0.8);
            _addNebulaFog(scene);
            break;
        case 'planet':
            _addStarfield(scene, 800, 0.5);
            break;
        case 'none':
        default:
            break;
    }

    // Глобальный доступ к текущей сцене (для screenFlight динамического добавления объектов)
    window.__threeScene = scene;

    return { scene, camera };
}

function _addStarfield(scene: THREE.Scene, count?: number, size = 1.0): void {
    const n = count ?? getProfile().starfieldCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 2000;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    _starfieldPoints = points;
}

function _addAsteroidBelt(scene: THREE.Scene): void {
    const profile = getProfile();
    const geo = new THREE.SphereGeometry(4, 5, 5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7c8a9e, roughness: 0.9 });
    const light = new THREE.PointLight(0x4fc3f7, 2, 800);
    light.position.set(0, 0, 200);
    scene.add(light, new THREE.AmbientLight(0x334155, 0.5));
    for (let i = 0; i < profile.asteroidBeltCount; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        const angle = Math.random() * Math.PI * 2;
        const r = 100 + Math.random() * 120;
        mesh.position.set(Math.cos(angle) * r, (Math.random() - 0.5) * 40, Math.sin(angle) * r);
        mesh.scale.setScalar(0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random(), Math.random(), Math.random());
        scene.add(mesh);
    }
}

function _addNebulaFog(scene: THREE.Scene): void {
    scene.fog = new THREE.FogExp2(0x0a0f2e, 0.0015);
    const light = new THREE.PointLight(0xa78bfa, 1.5, 600);
    light.position.set(0, 50, 0);
    scene.add(light, new THREE.AmbientLight(0x1e1b4b, 0.4));
}

// ── Render loop ───────────────────────────────────────────────────────────

function _startRenderLoop(): void {
    if (!_renderer || !_currentScene) return;

    function render(): void {
        _animFrameId = requestAnimationFrame(render);
        // Лёгкое вращение звёздного поля для атмосферности
        if (_starfieldPoints) _starfieldPoints.rotation.y += 0.00015;
        _renderer!.render(_currentScene!.scene, _currentScene!.camera);
    }
    render();
}

function _onResize(): void {
    if (!_renderer || !_currentScene) return;
    const { camera } = _currentScene;
    const canvas = _renderer.domElement;
    const container = canvas.parentNode as HTMLElement;

    // Если контейнер скрыт или имеет нулевой размер, избегаем ошибок
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(container.clientWidth, container.clientHeight, false);
}

export { _renderer as renderer };

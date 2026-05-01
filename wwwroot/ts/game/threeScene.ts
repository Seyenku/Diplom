/**
 * threeScene.ts — Инициализация и управление базовой Three.js сценой (#game-canvas)
 *
 * Canvas (#game-canvas) живёт в DOM постоянно.
 * Сцена меняется через switchScene() при смене экранов,
 * без destroy/recreate WebGL-контекста.
 */

import * as THREE from 'three';
import { getProfile, onQualityChange } from './qualityPresets.js';
import { disposeSceneGraph } from './threeUtils.js';

export type SceneBuilder = () => { scene: THREE.Scene; camera: THREE.PerspectiveCamera };

let _renderer: THREE.WebGLRenderer | null = null;
let _currentScene: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let _animFrameId: number | null = null;
let _starfieldPoints: THREE.Points | null = null;
let _lastSceneName: string = 'none';

const _builders = new Map<string, SceneBuilder>();

export function registerSceneBuilder(name: string, builder: SceneBuilder): void {
    _builders.set(name, builder);
}

// ────────────────────────────────────────────────────────────────────────────

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

    onQualityChange(() => {
        recreateRenderer();
    });

    // Стартовая сцена
    await switchScene('starfield');
}

export async function switchScene(sceneName: string): Promise<void> {
    if (_animFrameId) cancelAnimationFrame(_animFrameId);
    _disposeCurrentScene();

    _lastSceneName = sceneName;
    const builder = _builders.get(sceneName);
    
    if (builder) {
        _currentScene = builder();
    } else {
        // Fallback to empty scene if no builder found
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        _currentScene = { scene, camera };
        window.__threeScene = scene;
        (window as any).__threeCamera = camera;
    }
    
    // Check if starfield exists in the new scene for the generic animation loop
    _starfieldPoints = _currentScene?.scene.children.find(c => c.userData?.type === 'starfield') as THREE.Points ?? null;

    _startRenderLoop();
}

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

    const builder = _builders.get(_lastSceneName);
    if (builder) {
        _currentScene = builder();
        _starfieldPoints = _currentScene.scene.children.find(c => c.userData?.type === 'starfield') as THREE.Points ?? null;
    }
    
    _startRenderLoop();
}

function _disposeCurrentScene(): void {
    if (!_currentScene) return;
    disposeSceneGraph(_currentScene.scene);
    _starfieldPoints = null;
    _currentScene = null;
}

// ── Общие утилиты для билдеров сцен ───────────────────────────────────────

export function getBaseCamera(): THREE.PerspectiveCamera {
    const canvas = _renderer!.domElement;
    const container = canvas.parentNode as HTMLElement;
    return new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
}

export function addStarfield(scene: THREE.Scene, count?: number, size = 1.0): THREE.Points {
    const n = count ?? getProfile().starfieldCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 2000;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    const points = new THREE.Points(geo, mat);
    points.userData = { type: 'starfield' };
    scene.add(points);
    return points;
}

// ── Базовые сцены ─────────────────────────────────────────────────────────

registerSceneBuilder('starfield', () => {
    const scene = new THREE.Scene();
    const camera = getBaseCamera();
    camera.position.z = 300;
    addStarfield(scene);
    
    window.__threeScene = scene;
    (window as any).__threeCamera = camera;
    return { scene, camera };
});

// ── Render loop ───────────────────────────────────────────────────────────

function _startRenderLoop(): void {
    if (!_renderer || !_currentScene) return;

    if (_lastSceneName === 'galaxy-map' || _lastSceneName === 'flight') return;

    function render(): void {
        _animFrameId = requestAnimationFrame(render);
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

    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(container.clientWidth, container.clientHeight, false);
}

export { _renderer as renderer };

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
let _renderer = null;
let _currentScene = null;
let _animFrameId = null;
let _starfieldPoints = null;
let _lastSceneName = 'none';
const _builders = new Map();
export function registerSceneBuilder(name, builder) {
    _builders.set(name, builder);
}
// ────────────────────────────────────────────────────────────────────────────
export async function initThreeScene(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas)
        throw new Error(`Canvas #${canvasId} not found`);
    const profile = getProfile();
    _renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: profile.antialias,
        alpha: true,
    });
    _renderer.setPixelRatio(profile.pixelRatio);
    _renderer.setSize(canvas.parentNode.clientWidth, canvas.parentNode.clientHeight, false);
    _renderer.setClearColor(0x050a1a, 1);
    window.addEventListener('resize', _onResize);
    onQualityChange(() => {
        recreateRenderer();
    });
    // Стартовая сцена
    await switchScene('starfield');
}
export async function switchScene(sceneName) {
    if (_animFrameId)
        cancelAnimationFrame(_animFrameId);
    _disposeCurrentScene();
    _lastSceneName = sceneName;
    const builder = _builders.get(sceneName);
    if (builder) {
        _currentScene = builder();
    }
    else {
        // Fallback to empty scene if no builder found
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        _currentScene = { scene, camera };
        window.__threeScene = scene;
        window.__threeCamera = camera;
    }
    // Check if starfield exists in the new scene for the generic animation loop
    _starfieldPoints = _currentScene?.scene.children.find(c => c.userData?.type === 'starfield') ?? null;
    _startRenderLoop();
}
export function recreateRenderer() {
    if (!_renderer)
        return;
    const profile = getProfile();
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
    if (_animFrameId)
        cancelAnimationFrame(_animFrameId);
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
        _starfieldPoints = _currentScene.scene.children.find(c => c.userData?.type === 'starfield') ?? null;
    }
    _startRenderLoop();
}
function _disposeCurrentScene() {
    if (!_currentScene)
        return;
    disposeSceneGraph(_currentScene.scene);
    _starfieldPoints = null;
    _currentScene = null;
}
// ── Общие утилиты для билдеров сцен ───────────────────────────────────────
export function getBaseCamera() {
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
    return new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
}
export function addStarfield(scene, count, size = 1.0) {
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
    window.__threeCamera = camera;
    return { scene, camera };
});
// ── Render loop ───────────────────────────────────────────────────────────
function _startRenderLoop() {
    if (!_renderer || !_currentScene)
        return;
    if (_lastSceneName === 'galaxy-map' || _lastSceneName === 'flight')
        return;
    function render() {
        _animFrameId = requestAnimationFrame(render);
        if (_starfieldPoints)
            _starfieldPoints.rotation.y += 0.00015;
        _renderer.render(_currentScene.scene, _currentScene.camera);
    }
    render();
}
function _onResize() {
    if (!_renderer || !_currentScene)
        return;
    const { camera } = _currentScene;
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
    if (container.clientWidth === 0 || container.clientHeight === 0)
        return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(container.clientWidth, container.clientHeight, false);
}
export { _renderer as renderer };
//# sourceMappingURL=threeScene.js.map
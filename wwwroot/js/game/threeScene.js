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
import { disposeSceneGraph } from './threeUtils.js';
let _renderer = null;
let _currentScene = null;
let _animFrameId = null;
let _starfieldPoints = null;
let _lastSceneName = 'none';
// ────────────────────────────────────────────────────────────────────────────
/**
 * Инициализирует Three.js рендерер на указанном canvas.
 * Вызывается один раз при старте.
 */
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
export async function switchScene(sceneName) {
    if (_animFrameId)
        cancelAnimationFrame(_animFrameId);
    _disposeCurrentScene();
    _lastSceneName = sceneName;
    _currentScene = _buildScene(sceneName);
    _startRenderLoop();
}
/**
 * Пересоздаёт WebGL-рендерер с новыми параметрами качества.
 * Необходимо для смены antialias (параметр WebGL-контекста, нельзя менять на лету).
 */
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
    // Пересоздаём текущую сцену с новыми параметрами
    _currentScene = _buildScene(_lastSceneName);
    _startRenderLoop();
}
/** Рекурсивно освобождает GPU-ресурсы текущей сцены */
function _disposeCurrentScene() {
    if (!_currentScene)
        return;
    disposeSceneGraph(_currentScene.scene);
    _starfieldPoints = null;
    _currentScene = null;
}
// ── Билдеры сцен ──────────────────────────────────────────────────────────
function _buildScene(name) {
    const scene = new THREE.Scene();
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
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
            // Layer 1: далёкие звёзды (всегда)
            _addStarfield(scene, profile.flightStarfieldCount, 0.6);
            // Layer 2: средняя космическая пыль (medium+)
            if (profile.flightParallaxLayers >= 2) {
                _addFlightDustLayer(scene, 'mid', 300, 1.5, 0.25);
            }
            // Layer 3: ближняя пыль (high)
            if (profile.flightParallaxLayers >= 3) {
                _addFlightDustLayer(scene, 'near', 120, 3.0, 0.15);
            }
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
            // ToneMapping для bloom post-processing
            if (profile.flightPostProcessing && _renderer) {
                _renderer.toneMapping = THREE.ACESFilmicToneMapping;
                _renderer.toneMappingExposure = 1.0;
            }
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
    window.__threeCamera = camera;
    return { scene, camera };
}
function _addStarfield(scene, count, size = 1.0) {
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
function _addAsteroidBelt(scene) {
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
function _addNebulaFog(scene) {
    scene.fog = new THREE.FogExp2(0x0a0f2e, 0.0015);
    const light = new THREE.PointLight(0xa78bfa, 1.5, 600);
    light.position.set(0, 50, 0);
    scene.add(light, new THREE.AmbientLight(0x1e1b4b, 0.4));
}
/** Adds a parallax dust layer for the flight scene */
function _addFlightDustLayer(scene, tag, count, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 40; // X spread
        pos[i * 3 + 1] = (Math.random() - 0.5) * 25; // Y spread
        pos[i * 3 + 2] = (Math.random() - 0.5) * 600; // Z depth
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
// ── Render loop ───────────────────────────────────────────────────────────
function _startRenderLoop() {
    if (!_renderer || !_currentScene)
        return;
    // Galaxy Map and Flight use their own dedicated render loops.
    // Running this background loop simultaneously wastes GPU time (double rendering).
    if (_lastSceneName === 'galaxy-map' || _lastSceneName === 'flight')
        return;
    function render() {
        _animFrameId = requestAnimationFrame(render);
        // Лёгкое вращение звёздного поля для атмосферности
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
    // Если контейнер скрыт или имеет нулевой размер, избегаем ошибок
    if (container.clientWidth === 0 || container.clientHeight === 0)
        return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(container.clientWidth, container.clientHeight, false);
}
export { _renderer as renderer };
//# sourceMappingURL=threeScene.js.map
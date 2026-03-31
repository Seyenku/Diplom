/**
 * threeScene.js — Инициализация и управление Three.js сценой
 *
 * Canvas (#game-canvas) живёт в DOM постоянно.
 * Сцена меняется через switchScene() при смене экранов,
 * без destroy/recreate WebGL-контекста.
 *
 * Three.js файл: three.module.min.js (WebGL renderer)
 */

let _renderer     = null;
let _currentScene = null;
let _animFrameId  = null;

// Глобальная ссылка на Three.js
const getT = () => window.THREE ?? null;

// ────────────────────────────────────────────────────────────────────────────

/**
 * Инициализирует Three.js рендерер на указанном canvas.
 * Вызывается один раз при старте.
 * @param {string} canvasId
 */
export async function initThreeScene(canvasId) {
    const T = getT();
    if (!T) {
        throw new Error('THREE is not defined — убедитесь, что three.module.min.js загружен через importmap');
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);

    _renderer = new T.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
    });

    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(canvas.parentNode.clientWidth, canvas.parentNode.clientHeight);
    _renderer.setClearColor(0x050a1a, 1);

    window.addEventListener('resize', _onResize);

    // Стартовая сцена — звёздное поле (фон главного меню)
    await switchScene('starfield');
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Переключает Three.js сцену без пересоздания WebGL-контекста.
 * @param {'starfield'|'asteroid-belt'|'flight'|'galaxy-map'|'planet'|'none'} sceneName
 */
export async function switchScene(sceneName) {
    if (_animFrameId) cancelAnimationFrame(_animFrameId);

    _currentScene = _buildScene(sceneName);
    _startRenderLoop();
}

// ── Билдеры сцен ──────────────────────────────────────────────────────────

function _buildScene(name) {
    const T = getT();
    if (!T) return null;

    const scene  = new T.Scene();
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
    const camera = new T.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.z = 300;

    switch (name) {
        case 'starfield':
            _addStarfield(scene);
            break;
        case 'asteroid-belt':
            _addStarfield(scene);
            _addAsteroidBelt(scene);
            break;
        case 'flight':
            _addStarfield(scene, 2500, 0.6);
            camera.position.set(0, 2, 8);
            camera.lookAt(0, 0, -50);
            // Освещение для flight
            scene.add(new T.AmbientLight(0x334155, 0.6));
            const dirLight = new T.DirectionalLight(0x4fc3f7, 1.2);
            dirLight.position.set(5, 10, 10);
            scene.add(dirLight);
            const backLight = new T.PointLight(0x818cf8, 0.8, 100);
            backLight.position.set(0, -5, -20);
            scene.add(backLight);
            break;
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

function _addStarfield(scene, count = 1500, size = 1.0) {
    const T = getT();
    const geo = new T.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 2000;
    }
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    const mat = new T.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    scene.add(new T.Points(geo, mat));
}

function _addAsteroidBelt(scene) {
    const T = getT();
    const geo   = new T.SphereGeometry(4, 5, 5);
    const mat   = new T.MeshStandardMaterial({ color: 0x7c8a9e, roughness: 0.9 });
    const light = new T.PointLight(0x4fc3f7, 2, 800);
    light.position.set(0, 0, 200);
    scene.add(light, new T.AmbientLight(0x334155, 0.5));
    for (let i = 0; i < 60; i++) {
        const mesh  = new T.Mesh(geo, mat);
        const angle = Math.random() * Math.PI * 2;
        const r     = 100 + Math.random() * 120;
        mesh.position.set(Math.cos(angle) * r, (Math.random() - 0.5) * 40, Math.sin(angle) * r);
        mesh.scale.setScalar(0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random(), Math.random(), Math.random());
        scene.add(mesh);
    }
}

function _addNebulaFog(scene) {
    const T = getT();
    scene.fog = new T.FogExp2(0x0a0f2e, 0.0015);
    const light = new T.PointLight(0xa78bfa, 1.5, 600);
    light.position.set(0, 50, 0);
    scene.add(light, new T.AmbientLight(0x1e1b4b, 0.4));
}

// ── Render loop ───────────────────────────────────────────────────────────

function _startRenderLoop() {
    if (!_renderer || !_currentScene) return;

    function render() {
        _animFrameId = requestAnimationFrame(render);
        const { scene, camera } = _currentScene;
        // Лёгкое вращение звёздного поля для атмосферности
        scene.children.forEach(obj => {
            if (obj.isPoints) obj.rotation.y += 0.00015;
        });
        _renderer.render(scene, camera);
    }
    render();
}

function _onResize() {
    if (!_renderer || !_currentScene) return;
    const { camera } = _currentScene;
    const canvas = _renderer.domElement;
    const container = canvas.parentNode;
    
    // Если контейнер скрыт или имеет нулевой размер, избегаем ошибок
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(container.clientWidth, container.clientHeight);
}

export { _renderer as renderer };

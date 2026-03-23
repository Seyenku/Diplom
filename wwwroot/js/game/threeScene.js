/**
 * threeScene.js — Инициализация и управление Three.js сценой
 *
 * Canvas (#game-canvas) живёт в DOM постоянно.
 * Сцена меняется через switchScene() при смене экранов,
 * без destroy/recreate WebGL-контекста.
 *
 * Three.js файл: three.webgpu.nodes.min.js (WebGPU renderer + Nodes)
 * TSL:           three.tsl.min.js
 */

let _renderer     = null;
let _currentScene = null;
let _animFrameId  = null;

// Глобальная ссылка на Three.js (WebGPU-бандл может экспортировать как THREE или THREE_Nodes)
const getT = () => window.THREE ?? window.THREE_Nodes ?? null;

// ────────────────────────────────────────────────────────────────────────────

/**
 * Инициализирует Three.js рендерер на указанном canvas.
 * Вызывается один раз при старте.
 * @param {string} canvasId
 */
export async function initThreeScene(canvasId) {
    const T = getT();
    if (!T) {
        throw new Error('THREE is not defined — убедитесь, что three.webgpu.nodes.min.js загружен перед main.js');
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);

    // WebGPU-бандл содержит WebGLRenderer (и WebGPURenderer если доступен)
    const RendererClass = T.WebGPURenderer ?? T.WebGLRenderer;
    _renderer = new RendererClass({
        canvas,
        antialias: true,
        alpha: true,
    });

    // WebGPURenderer требует async init
    if (_renderer.init) await _renderer.init();

    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.setClearColor(0x050a1a, 1);

    window.addEventListener('resize', _onResize);

    // Стартовая сцена — звёздное поле (фон главного меню)
    await switchScene('starfield');
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Переключает Three.js сцену без пересоздания WebGL-контекста.
 * @param {'starfield'|'asteroid-belt'|'galaxy-map'|'planet'|'none'} sceneName
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
    const camera = new T.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 300;

    switch (name) {
        case 'starfield':
            _addStarfield(scene);
            break;
        case 'asteroid-belt':
            _addStarfield(scene);
            _addAsteroidBelt(scene);
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
    const mat = new T.PointsNodeMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    scene.add(new T.Points(geo, mat));
}

function _addAsteroidBelt(scene) {
    const T = getT();
    const geo   = new T.SphereGeometry(4, 5, 5);
    const mat   = new T.MeshStandardNodeMaterial({ color: 0x7c8a9e, roughness: 0.9 });
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    _renderer.setSize(window.innerWidth, window.innerHeight);
}

export { _renderer as renderer };

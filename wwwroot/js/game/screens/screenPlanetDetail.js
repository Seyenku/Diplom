/**
 * screenPlanetDetail.js — Описание планеты / профессии с 3D-моделью
 *
 * Рендерит вращающуюся 3D-сферу планеты в viewport,
 * заполняет карточки навыков, кристаллов, рисков.
 */

import { getStore, transition, Screen, dispatch } from '../stateManager.js';
import { switchScene } from '../threeScene.js';

// ── Цветовая схема ──────────────────────────────────────────────────────────

const DIR_META = {
    technology:   { label: '💻 IT',           color: 0x4fc3f7, emoji: '💻' },
    medicine:     { label: '⚕ Медицина',     color: 0xf87171, emoji: '⚕' },
    biotech:      { label: '🧬 Биотех',       color: 0x4ade80, emoji: '🧬' },
    ecology:      { label: '🌿 Экология',     color: 0x34d399, emoji: '🌿' },
    design:       { label: '🎨 Дизайн',       color: 0xf472b6, emoji: '🎨' },
    neuroscience: { label: '🧠 Нейронауки',   color: 0xc084fc, emoji: '🧠' },
    physics:      { label: '⚛ Физика',        color: 0xa78bfa, emoji: '⚛' },
    mathematics:  { label: '📐 Математика',    color: 0xfbbf24, emoji: '📐' },
};

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _planetRenderer = null;
let _planetScene    = null;
let _planetCamera   = null;
let _planetAnimId   = null;
let _planetMesh     = null;
let _resizeObs      = null;

window._planetDetail = {
    startMiniGame() {
        transition(Screen.MINIGAME);
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store) {
    await switchScene('planet');

    const planetId = store.sessionData?.planetId;
    const catalog  = store.sessionData?.catalog ?? [];
    const planet   = catalog.find(p => p.id === planetId);

    if (!planet) {
        _set('planet-name', 'Планета не найдена');
        _set('planet-description', 'Вернитесь к карте галактики и выберите планету.');
        return;
    }

    // Заголовок
    const dirMeta = DIR_META[planet.category] ?? { label: planet.category, color: 0x888888 };
    _set('planet-category', dirMeta.label?.toUpperCase() ?? '');
    _set('planet-name', planet.name);
    _set('planet-description', planet.description);

    // Навыки
    _renderList('hard-skills-list', planet.hardSkills ?? [], '🔧');
    _renderList('soft-skills-list', planet.softSkills ?? [], '✨');
    _renderList('risks-list', planet.risks ?? [], '⚠️');

    // Кристаллы
    _renderCrystals(planet.crystalRequirements ?? {});

    // Кнопка мини-игры — блокируем если не хватает кристаллов
    _updateMiniGameButton(planet, store.player);

    // 3D-модель планеты
    _init3DPlanet(planet, dirMeta);
}

export function destroy() {
    _cleanup3D();
}

// ── 3D-модель ───────────────────────────────────────────────────────────────

function _init3DPlanet(planet, dirMeta) {
    const THREE = window.THREE;
    if (!THREE) return;

    const viewport = document.getElementById('planet-3d-viewport');
    if (!viewport) return;

    // Очищаем skeleton
    viewport.innerHTML = '';

    const w = viewport.clientWidth || 300;
    const h = viewport.clientHeight || 300;

    _planetRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    _planetRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _planetRenderer.setSize(w, h, false);
    _planetRenderer.setClearColor(0x000000, 0); // прозрачный фон
    _planetRenderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    viewport.appendChild(_planetRenderer.domElement);

    _planetScene = new THREE.Scene();

    _planetCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    _planetCamera.position.set(0, 0, 6);

    // Освещение
    _planetScene.add(new THREE.AmbientLight(0x334155, 0.5));
    const dirLight = new THREE.DirectionalLight(dirMeta.color, 1.0);
    dirLight.position.set(3, 4, 5);
    _planetScene.add(dirLight);
    const rimLight = new THREE.PointLight(0xffffff, 0.3, 20);
    rimLight.position.set(-3, -2, 3);
    _planetScene.add(rimLight);

    // Сфера планеты
    const planetColor = new THREE.Color(dirMeta.color);
    const geo = new THREE.SphereGeometry(1.8, 48, 36);
    const mat = new THREE.MeshStandardMaterial({
        color: planetColor,
        emissive: planetColor,
        emissiveIntensity: 0.15,
        roughness: 0.5,
        metalness: 0.3,
    });
    _planetMesh = new THREE.Mesh(geo, mat);
    _planetScene.add(_planetMesh);

    // Атмосфера (полупрозрачная оболочка)
    const atmoGeo = new THREE.SphereGeometry(2.0, 48, 36);
    const atmoMat = new THREE.MeshBasicMaterial({
        color: planetColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
    });
    _planetScene.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Орбитальное кольцо
    const ringGeo = new THREE.RingGeometry(2.2, 2.35, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: dirMeta.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    _planetScene.add(ring);

    // «Облака» — пятна на поверхности (декоративные)
    const reqCount = Object.values(planet.crystalRequirements ?? {}).reduce((a, b) => a + b, 0);
    for (let i = 0; i < Math.min(reqCount, 8); i++) {
        const spotGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 8, 6);
        const spotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
        });
        const spot = new THREE.Mesh(spotGeo, spotMat);
        const phi   = Math.random() * Math.PI;
        const theta = Math.random() * Math.PI * 2;
        spot.position.setFromSphericalCoords(1.82, phi, theta);
        _planetMesh.add(spot);
    }

    // ResizeObserver
    _resizeObs = new ResizeObserver(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        if (vw === 0 || vh === 0) return;
        _planetCamera.aspect = vw / vh;
        _planetCamera.updateProjectionMatrix();
        _planetRenderer.setSize(vw, vh, false);
    });
    _resizeObs.observe(viewport);

    // Render loop
    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

function _planetRenderLoop() {
    if (!_planetRenderer || !_planetScene || !_planetCamera) return;

    if (_planetMesh) {
        _planetMesh.rotation.y += 0.003;
    }

    _planetRenderer.render(_planetScene, _planetCamera);
    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

function _cleanup3D() {
    if (_planetAnimId) cancelAnimationFrame(_planetAnimId);
    _planetAnimId = null;

    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }

    if (_planetRenderer) {
        _planetRenderer.domElement.parentNode?.removeChild(_planetRenderer.domElement);
        _planetRenderer.dispose();
        _planetRenderer = null;
    }

    _planetScene  = null;
    _planetCamera = null;
    _planetMesh   = null;
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _renderList(listId, items, icon) {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = items.length
        ? items.map(s => `<li class="planet-skill-item">${icon} ${s}</li>`).join('')
        : `<li class="planet-skill-item" style="opacity:0.5;">— нет данных</li>`;
}

function _renderCrystals(requirements) {
    const el = document.getElementById('crystal-requirements');
    if (!el) return;

    const entries = Object.entries(requirements);
    if (entries.length === 0) {
        el.innerHTML = '<span style="font-size:0.85rem;color:var(--color-text-muted);">Нет требований</span>';
        return;
    }

    el.innerHTML = entries.map(([dir, n]) => {
        const meta = DIR_META[dir] ?? { label: dir, color: 0x888888 };
        const colorHex = `#${meta.color.toString(16).padStart(6, '0')}`;
        return `<div class="crystal-req-badge" style="--crystal-color:${colorHex};">
            <span class="crystal-req-icon">${meta.emoji ?? '💎'}</span>
            <span class="crystal-req-label">${meta.label?.split(' ').slice(1).join(' ') ?? dir}</span>
            <span class="crystal-req-count">×${n}</span>
        </div>`;
    }).join('');
}

function _updateMiniGameButton(planet, player) {
    const btn = document.getElementById('btn-play-minigame');
    if (!btn) return;

    const requirements = planet.crystalRequirements ?? {};
    const playerCrystals = player?.crystals ?? {};

    const canPlay = Object.entries(requirements).every(([dir, n]) => {
        return (playerCrystals[dir] ?? 0) >= n;
    });

    if (!canPlay && Object.keys(requirements).length > 0) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.title = 'Не хватает кристаллов для посадки';
        btn.textContent = '🔒 Не хватает кристаллов';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.title = '';
        btn.textContent = '🎮 Пробная посадка';
    }
}

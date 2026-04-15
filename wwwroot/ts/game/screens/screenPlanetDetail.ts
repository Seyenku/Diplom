/**
 * screenPlanetDetail.ts — Описание планеты / профессии с 3D-моделью
 *
 * Рендерит вращающуюся 3D-сферу планеты в viewport,
 * заполняет карточки навыков, кристаллов, рисков.
 * Кнопка «Открыть планету» тратит кристаллы кластера.
 */

import * as THREE from 'three';
import { getStore, transition, Screen, dispatch } from '../stateManager.js';
import { switchScene } from '../threeScene.js';
import { GameStore, PlanetDto, CrystalType, ClusterType } from '../types.js';

// ── Цветовая схема кластеров ────────────────────────────────────────────────

const CLUSTER_META: Record<string, { label: string; color: number; emoji: string }> = {
    programming: { label: '💻 Программирование', color: 0x4fc3f7, emoji: '💎' },
    medicine:    { label: '❤️ Медицина',         color: 0xf87171, emoji: '❤️' },
    geology:     { label: '🌍 Геология',         color: 0x34d399, emoji: '🌿' },
};

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _planetRenderer: THREE.WebGLRenderer | null = null;
let _planetScene: THREE.Scene | null = null;
let _planetCamera: THREE.PerspectiveCamera | null = null;
let _planetAnimId: number | null = null;
let _planetMesh: THREE.Mesh | null = null;
let _resizeObs: ResizeObserver | null = null;

window._planetDetail = {
    startMiniGame() {
        transition(Screen.MINIGAME);
    },
    unlockPlanet(planetId: string) {
        const store = getStore();
        const catalog = (store.sessionData?.catalog ?? []) as PlanetDto[];
        const planet = catalog.find(p => p.id === planetId);
        if (!planet) return;

        const crystalType = planet.crystalType as CrystalType;
        const cost = planet.unlockCost ?? 0;
        const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[crystalType] ?? 0;

        if (playerCrystals < cost) {
            alert(`Недостаточно кристаллов. Нужно: ${cost}, есть: ${playerCrystals}.`);
            return;
        }

        // Тратим кристаллы
        dispatch('SPEND_CRYSTALS', { spent: { [crystalType]: cost } as Record<CrystalType, number> });
        // Открываем планету
        dispatch('DISCOVER_PLANET', { planetId });

        // Обновляем UI
        _updateUnlockButton(planet, getStore().player!);
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    await switchScene('planet');

    const planetId = store.sessionData?.planetId;
    const catalog = (store.sessionData?.catalog ?? []) as PlanetDto[];
    const planet = catalog.find(p => p.id === planetId);

    if (!planet) {
        _set('planet-name', 'Планета не найдена');
        _set('planet-description', 'Вернитесь к карте галактики и выберите планету.');
        return;
    }

    // Заголовок
    const clusterMeta = CLUSTER_META[planet.crystalType] ?? { label: planet.clusterName, color: 0x888888, emoji: '💎' };
    _set('planet-category', planet.clusterName?.toUpperCase() ?? '');
    _set('planet-name', planet.name);
    _set('planet-description', planet.description);

    // Навыки
    _renderList('hard-skills-list', planet.hardSkills ?? [], '🔧');
    _renderList('soft-skills-list', planet.softSkills ?? [], '✨');
    _renderList('risks-list', planet.risks ?? [], '⚠️');

    // Кристаллы (стоимость открытия)
    _renderUnlockCost(planet);

    // Кнопка открытия / мини-игры
    _updateUnlockButton(planet, store.player!);

    // 3D-модель планеты
    _init3DPlanet(planet, clusterMeta);
}

export function destroy(): void {
    _cleanup3D();
}

// ── 3D-модель ───────────────────────────────────────────────────────────────

function _init3DPlanet(planet: PlanetDto, clusterMeta: { label: string; color: number; emoji: string }): void {
    const viewport = document.getElementById('planet-3d-viewport');
    if (!viewport) return;

    viewport.innerHTML = '';

    const w = viewport.clientWidth || 300;
    const h = viewport.clientHeight || 300;

    _planetRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    _planetRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _planetRenderer.setSize(w, h, false);
    _planetRenderer.setClearColor(0x000000, 0);
    _planetRenderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    viewport.appendChild(_planetRenderer.domElement);

    _planetScene = new THREE.Scene();

    _planetCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    _planetCamera.position.set(0, 0, 6);

    // Освещение
    _planetScene!.add(new THREE.AmbientLight(0x334155, 0.5));
    const dirLight = new THREE.DirectionalLight(clusterMeta.color, 1.0);
    dirLight.position.set(3, 4, 5);
    _planetScene!.add(dirLight);
    const rimLight = new THREE.PointLight(0xffffff, 0.3, 20);
    rimLight.position.set(-3, -2, 3);
    _planetScene!.add(rimLight);

    // Сфера планеты
    const planetColor = new THREE.Color(clusterMeta.color);
    const geo = new THREE.SphereGeometry(1.8, 48, 36);
    const mat = new THREE.MeshStandardMaterial({
        color: planetColor,
        emissive: planetColor,
        emissiveIntensity: 0.15,
        roughness: 0.5,
        metalness: 0.3,
    });
    _planetMesh = new THREE.Mesh(geo, mat);
    _planetScene!.add(_planetMesh);

    // Атмосфера
    const atmoGeo = new THREE.SphereGeometry(2.0, 48, 36);
    const atmoMat = new THREE.MeshBasicMaterial({
        color: planetColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
    });
    _planetScene!.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Орбитальное кольцо
    const ringGeo = new THREE.RingGeometry(2.2, 2.35, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: clusterMeta.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    _planetScene!.add(ring);

    // «Облака»
    const cost = planet.unlockCost ?? 5;
    for (let i = 0; i < Math.min(cost, 8); i++) {
        const spotGeo = new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 8, 6);
        const spotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
        });
        const spot = new THREE.Mesh(spotGeo, spotMat);
        const phi = Math.random() * Math.PI;
        const theta = Math.random() * Math.PI * 2;
        spot.position.setFromSphericalCoords(1.82, phi, theta);
        _planetMesh!.add(spot);
    }

    // ResizeObserver
    _resizeObs = new ResizeObserver(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        if (vw === 0 || vh === 0) return;
        _planetCamera!.aspect = vw / vh;
        _planetCamera!.updateProjectionMatrix();
        _planetRenderer!.setSize(vw, vh, false);
    });
    _resizeObs.observe(viewport);

    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

function _planetRenderLoop(): void {
    if (!_planetRenderer || !_planetScene || !_planetCamera) return;

    if (_planetMesh) {
        _planetMesh.rotation.y += 0.003;
    }

    _planetRenderer.render(_planetScene, _planetCamera);
    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

function _cleanup3D(): void {
    if (_planetAnimId) cancelAnimationFrame(_planetAnimId);
    _planetAnimId = null;

    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }

    if (_planetRenderer) {
        _planetRenderer.domElement.parentNode?.removeChild(_planetRenderer.domElement);
        _planetRenderer.dispose();
        _planetRenderer = null;
    }

    _planetScene = null;
    _planetCamera = null;
    _planetMesh = null;
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function _set(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _renderList(listId: string, items: string[], icon: string): void {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = items.length
        ? items.map(s => `<li class="planet-skill-item">${icon} ${s}</li>`).join('')
        : `<li class="planet-skill-item" style="opacity:0.5;">— нет данных</li>`;
}

function _renderUnlockCost(planet: PlanetDto): void {
    const el = document.getElementById('crystal-requirements');
    if (!el) return;

    const cost = planet.unlockCost ?? 0;
    if (cost === 0) {
        el.innerHTML = '<span style="font-size:0.85rem;color:#4ade80;">✅ Открыта по умолчанию</span>';
        return;
    }

    const meta = CLUSTER_META[planet.crystalType] ?? { label: 'Кристаллы', emoji: '💎', color: 0x888888 };
    const colorHex = `#${(meta.color as number).toString(16).padStart(6, '0')}`;

    el.innerHTML = `<div class="crystal-req-badge" style="--crystal-color:${colorHex};">
        <span class="crystal-req-icon">${meta.emoji}</span>
        <span class="crystal-req-label">${meta.label?.split(' ').slice(1).join(' ') ?? 'Кристаллы'}</span>
        <span class="crystal-req-count">×${cost}</span>
    </div>`;
}

function _updateUnlockButton(planet: PlanetDto, player: NonNullable<Parameters<typeof init>[0]['player']>): void {
    const btn = document.getElementById('btn-play-minigame') as HTMLButtonElement | null;
    if (!btn) return;

    const discovered = (player?.discoveredPlanets ?? []).includes(planet.id) || planet.isStarterVisible;
    const cost = planet.unlockCost ?? 0;
    const crystalType = planet.crystalType as CrystalType;
    const playerCrystals = ((player?.crystals ?? {}) as Record<string, number>)[crystalType] ?? 0;

    if (discovered) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.title = '';
        btn.textContent = '🎮 Пробная посадка';
        btn.onclick = () => window._planetDetail?.startMiniGame();
    } else if (playerCrystals >= cost) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.title = '';
        btn.textContent = `🔓 Открыть за ${cost} ${(CLUSTER_META[crystalType]?.emoji ?? '💎')}`;
        btn.onclick = () => window._planetDetail?.unlockPlanet(planet.id);
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.title = `Нужно ещё ${cost - playerCrystals} кристаллов`;
        btn.textContent = `🔒 Нужно ${cost} ${(CLUSTER_META[crystalType]?.emoji ?? '💎')} (есть ${playerCrystals})`;
    }
}

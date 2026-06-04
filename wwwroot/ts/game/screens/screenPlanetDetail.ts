/**
 * screenPlanetDetail.ts — Описание планеты / профессии с 3D-моделью
 *
 * Рендерит вращающуюся 3D-сферу планеты в viewport,
 * заполняет карточки навыков, кристаллов, рисков.
 * Кнопка «Открыть планету» тратит кристаллы кластера.
 */

import * as THREE from 'three';
import { getStore, transition, Screen, dispatch, on, off } from '../stateManager.js';
import type { ScreenId } from '../types.js';
import { switchScene, registerSceneBuilder, getBaseCamera, addStarfield } from '../threeScene.js';

// ── Scene Builder ───────────────────────────────────────────────────────────

registerSceneBuilder('planet', () => {
    const scene = new THREE.Scene();
    const camera = getBaseCamera();
    camera.position.z = 300;
    addStarfield(scene, 800, 0.5);
    
    window.__threeScene = scene;
    (window as any).__threeCamera = camera;
    return { scene, camera };
});
import { GameStore, PlanetDto, CrystalType, ClusterType, ActionType } from '../types.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { CLUSTER_MAP } from '../clusterConfig.js';
import { playSfx } from '../audioManager.js';
import { getTextureProfile, textureUrl, TextureProfile } from '../planetTextures.js';
import { loadTexture, releaseTexture } from '../textureManager.js';
import { getProfile as getQualityProfile } from '../qualityPresets.js';

// ── Цветовая схема кластеров (из clusterConfig.ts) ──────────────────────────────

const CLUSTER_META: Record<string, { label: string; shortLabel: string; color: number; emoji: string }> =
    Object.fromEntries(
        Object.entries(CLUSTER_MAP).map(([k, c]) => [k, {
            label:      `${c.icon} ${c.shortLabel}`,
            shortLabel: c.shortLabel,
            color:      c.color,
            emoji:      c.crystalEmoji,
        }])
    );

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _planetRenderer: THREE.WebGLRenderer | null = null;
let _planetScene: THREE.Scene | null = null;
let _planetCamera: THREE.PerspectiveCamera | null = null;
let _planetAnimId: number | null = null;
let _planetMesh: THREE.Mesh | null = null;
let _cloudMesh: THREE.Mesh | null = null;
let _resizeObs: ResizeObserver | null = null;
let _currentPlanet: PlanetDto | null = null;
let _activeTextureProfile: TextureProfile | null = null;
let _activeTextureUrls: string[] = [];

// ── Reading mode ────────────────────────────────────────────────────────────
type DetailMode = 'overview' | 'reading';
let _mode: DetailMode = 'overview';

// ── Drag-to-rotate state ────────────────────────────────────────────────────
let _isDragging = false;
let _dragPointerId: number | null = null;
let _dragLastX = 0;
let _dragLastY = 0;
let _rotVelY = 0;   // инерция вокруг Y (горизонталь)
let _rotVelX = 0;   // инерция вокруг X (вертикаль)
let _accumDragPx = 0;
let _idleSinceMs = 0;
let _dragHandlers: { type: string; fn: (e: Event) => void }[] = [];

const DRAG_SENSITIVITY = 0.005;
const INERTIA_DECAY = 0.92;
const INERTIA_MIN = 0.0002;
const IDLE_BEFORE_AUTO_MS = 1500;
const CLICK_DRAG_THRESHOLD_PX = 5;

// ── Реактивное обновление UI при изменении баланса кристаллов ────────────────

function _refreshUI(): void {
    const store = getStore();
    if (!store.player || !_currentPlanet) return;
    const discovered = (store.player?.discoveredPlanets ?? []).includes(_currentPlanet.id) || _currentPlanet.isStarterVisible;
    _updateUnlockButton(_currentPlanet, store.player, discovered);
    _renderPlayerCrystals(_currentPlanet, store);
}

const _REACTIVE_ACTIONS: ActionType[] = ['EARN_CRYSTALS', 'ADD_CRYSTALS', 'SPEND_CRYSTALS', 'DISCOVER_PLANET'];

function _subscribeToStoreChanges(): void {
    for (const action of _REACTIVE_ACTIONS) on(action, _refreshUI);
}

function _unsubscribeFromStoreChanges(): void {
    for (const action of _REACTIVE_ACTIONS) off(action, _refreshUI);
}

window._planetDetail = {
    startMiniGame() {
        const store = getStore();
        const planetId = store.sessionData?.planetId;
        const catalog = (store.sessionData?.catalog ?? []) as PlanetDto[];
        const planet = catalog.find(p => p.id === planetId);
        if (!planet) return;

        const discovered = (store.player?.discoveredPlanets ?? []).includes(planet.id) || planet.isStarterVisible;

        // Если планета ещё не открыта — списываем кристаллы за попытку
        if (!discovered) {
            const crystalType = planet.crystalType as CrystalType;
            const cost = planet.unlockCost ?? 0;
            const bal = ((store.player?.crystals ?? {}) as Record<string, number>)[crystalType] ?? 0;
            if (bal < cost) {
                const meta = CLUSTER_META[crystalType];
                const label = meta?.shortLabel ?? 'этого типа';
                (window as any).showNotification(
                    `Недостаточно кристаллов «${label}»!\nНужно: ${cost}, есть: ${bal}.\nСоберите кристаллы в полёте через карту галактики.`,
                    'warning'
                );
                return;
            }
            dispatch('SPEND_CRYSTALS', { spent: { [crystalType]: cost } as Record<CrystalType, number> });
        }

        // Маршрутизация по кластеру
        const targetScreen = _getMiniGameScreen(planet.clusterId);
        transition(targetScreen);
    },
};

function _getMiniGameScreen(clusterId: string): ScreenId {
    switch (clusterId) {
        case 'medicine': return Screen.MINIGAME_MEDICINE;
        case 'programming': return Screen.MINIGAME_PROGRAMMING;
        case 'geology': return Screen.MINIGAME_GEOLOGY;
        default: throw new Error(`[PlanetDetail] Unknown clusterId: ${clusterId}`);
    }
}

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
    _renderPlayerCrystals(planet, store);

    // Определяем статус открытия
    const discovered = (store.player?.discoveredPlanets ?? []).includes(planet.id) || planet.isStarterVisible;

    // Навыки — скрываем до открытия планеты
    if (discovered) {
        _renderList('hard-skills-list', planet.hardSkills ?? []);
        _renderList('soft-skills-list', planet.softSkills ?? []);
        _renderList('risks-list', planet.risks ?? []);
    } else {
        _renderLockedList('hard-skills-list');
        _renderLockedList('soft-skills-list');
        _renderLockedList('risks-list');
    }

    // Кристаллы (стоимость открытия)
    _renderUnlockCost(planet);

    // Кнопка открытия / мини-игры
    _updateUnlockButton(planet, store.player!, discovered);

    // Запоминаем текущую планету и подписываемся на изменения баланса
    _currentPlanet = planet;
    _subscribeToStoreChanges();

    // 3D-модель планеты
    _init3DPlanet(planet, clusterMeta);
}

export function destroy(): void {
    _unsubscribeFromStoreChanges();
    _currentPlanet = null;
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
    _planetRenderer.setPixelRatio(getQualityProfile().pixelRatio);
    _planetRenderer.setSize(w, h, false);
    _planetRenderer.setClearColor(0x000000, 0);
    _planetRenderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    viewport.appendChild(_planetRenderer.domElement);

    _planetScene = new THREE.Scene();

    // FOV 40°, z=7 → видимая ширина ≈ 5.10 units, кольцо помещается с запасом.
    _planetCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    _planetCamera.position.set(0, 0, 7);

    // ── Профиль текстуры (учитываем уровень качества) ───────────────────
    const qualityProfile = getQualityProfile();
    const texLevel = qualityProfile.planetTextures; // 'off' | 'surface' | 'full'
    const texProfile = texLevel === 'off' ? null : getTextureProfile(planet.textureKey);
    _activeTextureProfile = texProfile;
    _activeTextureUrls = [];

    const atmoColorHex = texProfile?.atmoColor ?? clusterMeta.color;
    const atmoColor = new THREE.Color(atmoColorHex);

    // ── Освещение ───────────────────────────────────────────────────────
    _planetScene.add(new THREE.AmbientLight(0x334155, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(3, 4, 5);
    _planetScene.add(dirLight);
    const rimLight = new THREE.PointLight(atmoColorHex, 0.5, 20);
    rimLight.position.set(-3, -2, 3);
    _planetScene.add(rimLight);

    // ── Surface mesh (базовый слой) ─────────────────────────────────────
    const surfaceGeo = new THREE.SphereGeometry(1.8, 48, 36);
    const surfaceMat = new THREE.MeshStandardMaterial({
        color: texProfile ? 0xffffff : atmoColor,
        emissive: texProfile ? new THREE.Color(0x000000) : atmoColor,
        emissiveIntensity: texProfile ? 0 : 0.15,
        roughness: texProfile ? 0.85 : 0.5,
        metalness: texProfile ? 0.05 : 0.3,
    });
    if (texProfile) {
        const url = textureUrl(texProfile.surface);
        surfaceMat.map = loadTexture(url);
        _activeTextureUrls.push(url);

        // Normal-map только в режиме 'full'
        if (texLevel === 'full' && texProfile.normal) {
            const nUrl = textureUrl(texProfile.normal);
            surfaceMat.normalMap = loadTexture(nUrl);
            _activeTextureUrls.push(nUrl);
        }
    }
    _planetMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    _planetScene.add(_planetMesh);

    // ── Cloud mesh (параллакс-слой) — только в режиме 'full' ────────────
    if (texLevel === 'full' && texProfile?.clouds) {
        const cloudGeo = new THREE.SphereGeometry(1.83, 48, 36);
        const cloudUrl = textureUrl(texProfile.clouds);
        const cloudMat = new THREE.MeshStandardMaterial({
            map: loadTexture(cloudUrl),
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            roughness: 1.0,
            metalness: 0,
        });
        _activeTextureUrls.push(cloudUrl);
        _cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        _planetScene.add(_cloudMesh);
    }

    // ── Atmospheric shell ───────────────────────────────────────────────
    const atmoGeo = new THREE.SphereGeometry(1.98, 48, 36);
    const atmoMat = new THREE.MeshBasicMaterial({
        color: atmoColor,
        transparent: true,
        opacity: 0.10,
        side: THREE.BackSide,
        depthWrite: false,
    });
    _planetScene.add(new THREE.Mesh(atmoGeo, atmoMat));

    // ── Орбитальное кольцо ─────────────────────────────────────────────
    // Внешний радиус 2.10 (диаметр 4.20) — помещается в кадр камеры с запасом.
    const ringGeo = new THREE.RingGeometry(2.00, 2.10, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: atmoColorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    _planetScene.add(ring);

    // ── ResizeObserver ──────────────────────────────────────────────────
    _resizeObs = new ResizeObserver(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        if (vw === 0 || vh === 0) return;
        _planetCamera!.aspect = vw / vh;
        _planetCamera!.updateProjectionMatrix();
        _planetRenderer!.setSize(vw, vh, false);
    });
    _resizeObs.observe(viewport);

    _attachDragHandlers(_planetRenderer.domElement);

    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

// ── Drag handlers ───────────────────────────────────────────────────────────

function _attachDragHandlers(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.style.pointerEvents = 'auto';

    const onPointerDown = (e: PointerEvent): void => {
        _isDragging = true;
        _dragPointerId = e.pointerId;
        _dragLastX = e.clientX;
        _dragLastY = e.clientY;
        _accumDragPx = 0;
        _rotVelY = 0;
        _rotVelX = 0;
        canvas.style.cursor = 'grabbing';
        try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!_isDragging || _dragPointerId !== e.pointerId) return;
        // В reading-режиме drag отключён — но обновляем accum, чтобы клик не превратился в drag
        if (_mode === 'reading') {
            _dragLastX = e.clientX;
            _dragLastY = e.clientY;
            return;
        }
        const dx = e.clientX - _dragLastX;
        const dy = e.clientY - _dragLastY;
        _dragLastX = e.clientX;
        _dragLastY = e.clientY;
        _accumDragPx += Math.abs(dx) + Math.abs(dy);

        const yDelta = dx * DRAG_SENSITIVITY;
        const xDelta = dy * DRAG_SENSITIVITY;

        if (_planetMesh) {
            _planetMesh.rotation.y += yDelta;
            _planetMesh.rotation.x = Math.max(-1.2, Math.min(1.2, _planetMesh.rotation.x + xDelta));
        }
        if (_cloudMesh) {
            _cloudMesh.rotation.y += yDelta;
            _cloudMesh.rotation.x = Math.max(-1.2, Math.min(1.2, _cloudMesh.rotation.x + xDelta));
        }

        // Сохраняем последнюю «скорость» для инерции
        _rotVelY = yDelta;
        _rotVelX = xDelta;
    };

    const onPointerUp = (e: PointerEvent): void => {
        if (_dragPointerId !== null && _dragPointerId !== e.pointerId) return;
        const wasClick = _accumDragPx < CLICK_DRAG_THRESHOLD_PX;
        _isDragging = false;
        _dragPointerId = null;
        _idleSinceMs = performance.now();
        canvas.style.cursor = 'grab';
        try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }

        if (wasClick) {
            // Hook для будущего reading-mode (этап 5)
            _onPlanetClick();
            // Инерция не нужна — пользователь не «крутил»
            _rotVelY = 0;
            _rotVelX = 0;
        }
    };

    const onPointerCancel = (): void => {
        _isDragging = false;
        _dragPointerId = null;
        _idleSinceMs = performance.now();
        canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerdown',   onPointerDown   as EventListener);
    canvas.addEventListener('pointermove',   onPointerMove   as EventListener);
    canvas.addEventListener('pointerup',     onPointerUp     as EventListener);
    canvas.addEventListener('pointercancel', onPointerCancel as EventListener);
    canvas.addEventListener('pointerleave',  onPointerCancel as EventListener);

    _dragHandlers = [
        { type: 'pointerdown',   fn: onPointerDown   as EventListener },
        { type: 'pointermove',   fn: onPointerMove   as EventListener },
        { type: 'pointerup',     fn: onPointerUp     as EventListener },
        { type: 'pointercancel', fn: onPointerCancel as EventListener },
        { type: 'pointerleave',  fn: onPointerCancel as EventListener },
    ];
}

function _detachDragHandlers(): void {
    const canvas = _planetRenderer?.domElement;
    if (!canvas) { _dragHandlers = []; return; }
    _dragHandlers.forEach(h => canvas.removeEventListener(h.type, h.fn));
    _dragHandlers = [];
}

/** Клик по планете переключает overview ↔ reading. */
function _onPlanetClick(): void {
    _setMode(_mode === 'overview' ? 'reading' : 'overview');
}

function _setMode(mode: DetailMode): void {
    if (_mode === mode) return;
    _mode = mode;
    const root = document.getElementById('screen-planet-detail');
    if (!root) return;
    root.classList.toggle('planet-mode--reading', mode === 'reading');
    root.classList.toggle('planet-mode--overview', mode === 'overview');

    // В reading сбрасываем «накрученное» вращение, чтобы планета смотрела ровно
    if (mode === 'reading' && _planetMesh) {
        _rotVelY = 0;
        _rotVelX = 0;
    }

    const canvas = _planetRenderer?.domElement;
    if (canvas) {
        canvas.style.cursor = mode === 'reading' ? 'pointer' : 'grab';
    }
}

function _planetRenderLoop(): void {
    if (!_planetRenderer || !_planetScene || !_planetCamera) return;

    const surfSpeed  = _activeTextureProfile?.surfaceRotSpeed ?? 0.003;
    const cloudSpeed = _activeTextureProfile?.cloudRotSpeed   ?? 0.0045;

    const sinceIdle = performance.now() - _idleSinceMs;
    const inertiaActive =
        !_isDragging && (Math.abs(_rotVelY) > INERTIA_MIN || Math.abs(_rotVelX) > INERTIA_MIN);

    if (_isDragging) {
        // Во время drag — пользователь сам крутит, авто отключаем
    } else if (inertiaActive) {
        // Затухающая инерция после release
        if (_planetMesh) {
            _planetMesh.rotation.y += _rotVelY;
            _planetMesh.rotation.x = Math.max(-1.2, Math.min(1.2, _planetMesh.rotation.x + _rotVelX));
        }
        if (_cloudMesh) {
            _cloudMesh.rotation.y += _rotVelY;
            _cloudMesh.rotation.x = Math.max(-1.2, Math.min(1.2, _cloudMesh.rotation.x + _rotVelX));
        }
        _rotVelY *= INERTIA_DECAY;
        _rotVelX *= INERTIA_DECAY;
    } else if (sinceIdle > IDLE_BEFORE_AUTO_MS) {
        // Авто-rotation с параллаксом (разные скорости для surface и cloud)
        if (_planetMesh) _planetMesh.rotation.y += surfSpeed;
        if (_cloudMesh)  _cloudMesh.rotation.y  += cloudSpeed;
    }

    _planetRenderer.render(_planetScene, _planetCamera);
    _planetAnimId = requestAnimationFrame(_planetRenderLoop);
}

function _cleanup3D(): void {
    if (_planetAnimId) cancelAnimationFrame(_planetAnimId);
    _planetAnimId = null;

    _detachDragHandlers();
    _isDragging = false;
    _dragPointerId = null;
    _rotVelY = 0;
    _rotVelX = 0;
    _accumDragPx = 0;
    _idleSinceMs = 0;

    // Сбрасываем reading-mode (чтобы следующий вход на экран начался с overview)
    _mode = 'overview';
    const root = document.getElementById('screen-planet-detail');
    root?.classList.remove('planet-mode--reading');
    root?.classList.remove('planet-mode--overview');

    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }

    // Сначала отвязываем текстуры из материалов (чтобы disposeSceneGraph их не диспозил)
    // и отдаём их обратно в TextureManager (refcount-).
    if (_planetMesh && _planetMesh.material) {
        const mat = _planetMesh.material as THREE.MeshStandardMaterial;
        mat.map = null;
        mat.normalMap = null;
    }
    if (_cloudMesh && _cloudMesh.material) {
        const mat = _cloudMesh.material as THREE.MeshStandardMaterial;
        mat.map = null;
    }
    _activeTextureUrls.forEach(url => releaseTexture(url));
    _activeTextureUrls = [];
    _activeTextureProfile = null;

    // Recursively free all GPU resources (geometries, materials)
    if (_planetScene) {
        disposeSceneGraph(_planetScene);
    }

    if (_planetRenderer) {
        _planetRenderer.domElement.parentNode?.removeChild(_planetRenderer.domElement);
        _planetRenderer.forceContextLoss();
        _planetRenderer.dispose();
        _planetRenderer = null;
    }

    _planetScene = null;
    _planetCamera = null;
    _planetMesh = null;
    _cloudMesh = null;
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function _set(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _renderList(listId: string, items: string[]): void {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = items.length
        ? items.map(s => `<li class="planet-skill-item">${_escapeHtml(s)}</li>`).join('')
        : `<li class="planet-skill-item" style="opacity:0.5;">— нет данных</li>`;
}

function _renderLockedList(listId: string): void {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = `
        <li class="planet-skill-item planet-skill-locked">Скрыто до открытия</li>
        <li class="planet-skill-item planet-skill-locked">??????????</li>
        <li class="planet-skill-item planet-skill-locked">??????????</li>`;
}

function _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function _updateUnlockButton(
    planet: PlanetDto,
    player: NonNullable<Parameters<typeof init>[0]['player']>,
    discovered: boolean
): void {
    const btn = document.getElementById('btn-play-minigame') as HTMLButtonElement | null;
    if (!btn) return;

    const cost = planet.unlockCost ?? 0;
    const crystalType = planet.crystalType as CrystalType;
    const playerCrystals = ((player?.crystals ?? {}) as Record<string, number>)[crystalType] ?? 0;
    const emoji = CLUSTER_META[crystalType]?.emoji ?? '💎';

    // Кнопка обрабатывается через data-action="planetDetail.startMiniGame"
    // (см. _ScreenPlanetDetail.cshtml + делегированный listener в main.ts).
    // Не назначаем btn.onclick — иначе оба обработчика срабатывают
    // одновременно и пользователь видит два уведомления (или дважды
    // тратит кристаллы при достаточном балансе).
    if (discovered) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.title = '';
        btn.textContent = '🎮 Пробная посадка';
    } else if (playerCrystals >= cost) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.title = `Потратить ${cost} ${emoji} и начать исследование`;
        btn.textContent = `🚀 Исследовать — ${cost} ${emoji}`;
    } else {
        // Не нажимаем disabled, чтобы пользователь мог получить уведомление,
        // но визуально отмечаем «недоступно».
        btn.disabled = false;
        btn.style.opacity = '0.5';
        btn.title = `Нужно ещё ${cost - playerCrystals} кристаллов`;
        btn.textContent = `🔒 Исследовать — ${cost} ${emoji}`;
    }
}

function _renderPlayerCrystals(planet: PlanetDto, store: Readonly<GameStore>): void {
    const el = document.getElementById('planet-player-crystals');
    if (!el) return;

    const crystalType = planet.crystalType as CrystalType;
    const meta = CLUSTER_META[crystalType] ?? { emoji: '💎' };
    const amount = ((store.player?.crystals ?? {}) as Record<string, number>)[crystalType] ?? 0;
    el.textContent = `${meta.emoji} Кристаллы: ${amount}`;
}

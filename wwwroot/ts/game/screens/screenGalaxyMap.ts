/**
 * screenGalaxyMap.ts — Звёздная карта: 3 туманности с планетами внутри
 *
 * Два состояния камеры:
 *   - overview:  общий вид, видны 3 туманности (облака частиц)
 *   - focused:   камера приблизилась к выбранной туманности, видны планеты-сферы
 *
 * Three.js: отдельный WebGLRenderer внутри #galaxy-3d-canvas-wrap.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getStore, dispatch, transition, Screen, ScreenId, on, off } from '../stateManager.js';
import { switchScene } from '../threeScene.js';
import { GameStore, PlanetDto, ClusterDto, ClusterType, CrystalType, ClusterMeta, ActionType } from '../types.js';
import { getProfile, onQualityChange, offQualityChange } from '../qualityPresets.js';
import { disposeSceneGraph } from '../threeUtils.js';
import { CLUSTER_META } from '../clusterConfig.js';
import { playMusic } from '../audioManager.js';

// CLUSTER_META импортирован из clusterConfig.ts

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _allPlanets: PlanetDto[] = [];
let _clusters: ClusterDto[] = [];
let _discoveredIds = new Set<string>();
let _cameraState: 'overview' | 'focused' | 'zooming-to-planet' = 'overview';
let _focusedCluster: ClusterType | null = null;

// Planet zoom transition state
let _zoomingPlanetId: string | null = null;
let _zoomStartTime = 0;
const PLANET_ZOOM_DURATION = 500; // ms — camera fly + overlay fade-in duration

// Three.js
let _mapRenderer: THREE.WebGLRenderer | null = null;
let _composer: EffectComposer | null = null;
let _mapScene: THREE.Scene | null = null;
let _mapCamera: THREE.PerspectiveCamera | null = null;
let _mapAnimId: number | null = null;
let _raycaster: THREE.Raycaster | null = null;
let _mouse: THREE.Vector2 | null = null;
let _nebulaMeshes: Record<ClusterType, THREE.Group> = {} as Record<ClusterType, THREE.Group>;
let _planetMeshes: THREE.Mesh[] = [];
let _hoveredObj: THREE.Object3D | null = null;
let _isRightMouseDown = false;
let _isTouchDown = false;
let _lastInteractX = 0;
let _lastInteractY = 0;
let _spherical = { radius: 120, theta: 0, phi: 1.1 };
let _targetRadius = 120;  // target radius for smooth camera interpolation
let _targetCenter: THREE.Vector3 | null = null;
let _targetDest: THREE.Vector3 | null = null;
let _lastPinchDist = 0;
let _mapResizeObs: ResizeObserver | null = null;

// Optimizations
let _mouseMovedSinceLastRaycast = false;
let _tooltipEl: HTMLElement | null = null;
let _tooltipNameEl: HTMLElement | null = null;
let _tooltipCatEl: HTMLElement | null = null;
const _textureCache = new Map<string, THREE.CanvasTexture>();
let _isGalaxyMapActive = false;

// Shared GPU geometries (created once, reused for all planets)
let _sharedPlanetGeo: THREE.SphereGeometry | null = null;
let _sharedOutlineGeo: THREE.SphereGeometry | null = null;
let _sharedRingGeo: THREE.RingGeometry | null = null;
let _sharedOrbitGeo: THREE.BufferGeometry | null = null;
const _orbitMap = new Map<string, THREE.LineLoop>();

// Named handler for contextmenu (so it can be removed in cleanup)
function _onContextMenu(e: Event): void { e.preventDefault(); }

interface SphericalState {
    radius: number;
    theta: number;
    phi: number;
}

// ── Глобальный API для HTML-onclick ─────────────────────────────────────────

window._galaxyMap = {
    backToOverview() {
        _cameraState = 'overview';
        _focusedCluster = null;
        _clearPlanetMeshes();
        _hideNebulaPanel();
        _showBackButton(false);
        _targetDest!.set(0, 0, 0);
        _targetRadius = 120;
        _updateZoomUI();
    },

    resetCamera() {
        window._galaxyMap.backToOverview();
        _spherical.theta = 0;
        _spherical.phi = 1.1;
    },

    flyToRegion() {
        if (!_focusedCluster) return;
        transition(Screen.FLIGHT as ScreenId, {
            regionId: _focusedCluster,
            crystalType: _focusedCluster,
        } as Parameters<typeof dispatch<'SET_SESSION'>>[1]);
    },

    openPlanet(planetId: string) {
        if (_cameraState === 'zooming-to-planet') return; // block double-click

        // Find the planet mesh for fly-to animation
        const planetMesh = _planetMeshes.find(m => m.userData.planetId === planetId);
        if (!planetMesh) {
            // Fallback: instant transition if mesh not found
            transition(Screen.PLANET_DETAIL as ScreenId, {
                planetId,
                regionId: _focusedCluster ?? undefined,
                crystalType: _focusedCluster ?? undefined,
            } as Parameters<typeof dispatch<'SET_SESSION'>>[1]);
            return;
        }

        _cameraState = 'zooming-to-planet';
        _zoomingPlanetId = planetId;
        _zoomStartTime = performance.now();

        // Fly camera toward the planet (world position, not local to orbitPivot)
        const worldPos = new THREE.Vector3();
        planetMesh.getWorldPosition(worldPos);
        _targetDest!.copy(worldPos);
        _targetRadius = 3;

        // Start fullscreen overlay fade-in (symmetric with zoom-out fade)
        const overlay = document.getElementById('planet-zoom-overlay');
        if (overlay) {
            const meta = _focusedCluster ? CLUSTER_META[_focusedCluster] : null;
            const color = meta?.colorHex ?? '#4fc3f7';
            overlay.style.background = `radial-gradient(circle, ${color}dd 0%, #020710 70%)`;
            overlay.className = '';
            void overlay.offsetWidth; // force reflow
            overlay.classList.add('fade-in');
        }
    },
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    playMusic('ambient_map');
    await switchScene('galaxy-map');

    _clusters = (store.sessionData?.clusters ?? []) as ClusterDto[];
    _allPlanets = (store.sessionData?.catalog ?? []) as PlanetDto[];
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);

    // Если каталог пуст, загружаем
    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/game?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json() as PlanetDto[];
        } catch { /* офлайн */ }
    }

    _cameraState = 'overview';
    _focusedCluster = null;
    // Always reset camera orbit to safe defaults (fixes stale radius=3 from zoom-in)
    _spherical = { radius: 120, theta: 0, phi: 1.1 };
    _targetRadius = 120;
    _init3DMap();

    const returnCluster = store.sessionData?.regionId as ClusterType | undefined;
    const returnPlanetId = store.sessionData?.planetId as string | undefined;
    const prevScreen = store.previousScreen;

    if (returnCluster && (returnCluster in CLUSTER_META)) {
        const meta = CLUSTER_META[returnCluster];

        // Build nebula content (planets, panel, etc.)
        _focusCluster(returnCluster);

        // Instantly teleport camera center to the nebula (no drift from 0,0,0)
        if (_targetCenter) _targetCenter.set(meta.position.x, meta.position.y, meta.position.z);
        _spherical.radius = 36;
        _targetRadius = 36;

        // Reverse cinematic: if returning from Planet Detail, start camera at the planet
        if (prevScreen === Screen.PLANET_DETAIL && returnPlanetId) {
            const planetMesh = _planetMeshes.find(m => m.userData.planetId === returnPlanetId);
            if (planetMesh) {
                // Spawn camera right next to the planet (world position, not local to orbitPivot)
                const worldPos = new THREE.Vector3();
                planetMesh.getWorldPosition(worldPos);
                if (_targetCenter) _targetCenter.copy(worldPos);
                _spherical.radius = 3;

                // Target: fly back to nebula overview
                _targetDest!.set(meta.position.x, meta.position.y, meta.position.z);
                _targetRadius = 36;

                // Show covering overlay, then fade it out to reveal the pullback
                const overlay = document.getElementById('planet-zoom-overlay');
                if (overlay) {
                    overlay.style.cssText = '';
                    overlay.style.background = `radial-gradient(circle, ${meta.colorHex}dd 0%, #020710 70%)`;
                    overlay.className = 'covering';
                    // Next frame: start fading to reveal camera pulling back
                    requestAnimationFrame(() => {
                        overlay.className = 'fading';
                        setTimeout(() => { overlay.className = ''; }, 450);
                    });
                }
            }
        }
    }

    // Подписка на изменение качества графики (полная переинициализация карты)
    _isGalaxyMapActive = true;
    onQualityChange(_onQualityChanged);

    // Подписка на изменение баланса кристаллов (обновляет панель + сетку планет)
    on('EARN_CRYSTALS',   _refreshNebulaPanel);
    on('ADD_CRYSTALS',    _refreshNebulaPanel);
    on('SPEND_CRYSTALS',  _refreshNebulaPanel);
    on('DISCOVER_PLANET', _refreshNebulaPanel);
}

export function destroy(): void {
    _isGalaxyMapActive = false;
    offQualityChange(_onQualityChanged);
    off('EARN_CRYSTALS',   _refreshNebulaPanel);
    off('ADD_CRYSTALS',    _refreshNebulaPanel);
    off('SPEND_CRYSTALS',  _refreshNebulaPanel);
    off('DISCOVER_PLANET', _refreshNebulaPanel);
    _cleanup3D();
}

/** Коллбэк смены качества: полная переинициализация 3D-карты */
function _onQualityChanged(): void {
    if (!_isGalaxyMapActive) return;
    // Очищаем текстурный кеш, т.к. размеры текстур могли измениться
    _textureCache.clear();
    _cleanup3D();
    _init3DMap();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Утилиты: генерация текстур через Canvas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Генерирует мягкую glow-текстуру для спрайтов (radial gradient)
 */
function _createGlowTexture(size: number, color: string, softness: number = 0.5): THREE.CanvasTexture {
    const key = `glow_${size}_${color}_${softness}`;
    if (_textureCache.has(key)) return _textureCache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(softness, color + '80');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    _textureCache.set(key, texture);
    return texture;
}

/**
 * Генерирует текстуру звезды с мерцанием
 */
function _createStarTexture(size: number = 32): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(200, 220, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(150, 180, 255, 0.3)');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Добавляем "блики" — 4 луча
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(size/2, size/2);
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.moveTo(-size/2, 0);
        ctx.lineTo(size/2, 0);
        ctx.stroke();
        ctx.restore();
    }
    
    return new THREE.CanvasTexture(canvas);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3D MAP
// ═══════════════════════════════════════════════════════════════════════════

function _init3DMap(): void {
    const wrap = document.getElementById('galaxy-3d-canvas-wrap');
    if (!wrap) return;

    const w = wrap.clientWidth || 600;
    const h = wrap.clientHeight || 400;

    // Рендерер
    const profile = getProfile();
    _mapRenderer = new THREE.WebGLRenderer({ antialias: profile.antialias, alpha: true, powerPreference: 'high-performance' });
    _mapRenderer.setPixelRatio(profile.pixelRatio);
    _mapRenderer.setSize(w, h, false);
    _mapRenderer.setClearColor(0x050a1a, 1);
    // Output encoding для корректного цвета
    _mapRenderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping: сжимает HDR-яркость от AdditiveBlending, чтобы
    // частицы туманностей не пробивали порог bloom сплошным белым пятном
    _mapRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    _mapRenderer.toneMappingExposure = 1.0;
    _mapRenderer.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:var(--radius-sm);';
    wrap.insertBefore(_mapRenderer.domElement, wrap.firstChild);

    // Сцена
    _mapScene = new THREE.Scene();

    // Камера
    _mapCamera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    _mapCamera.position.set(0, 30, 120);
    _mapCamera.lookAt(0, 0, 0);

    // Освещение
    _mapScene.add(new THREE.AmbientLight(0x334155, 0.5));
    const dirL = new THREE.DirectionalLight(0xffffff, 0.6);
    dirL.position.set(20, 40, 30);
    _mapScene.add(dirL);

    // Post-processing (Bloom)
    const renderPass = new RenderPass(_mapScene, _mapCamera);
    // Strength: 0.5 (мягкое свечение), Radius: 0.4 (компактное рассеивание), Threshold: 0.92 (только яркие объекты)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.4, 0.92);
    _composer = new EffectComposer(_mapRenderer);
    _composer.addPass(renderPass);
    _composer.addPass(bloomPass);
    // OutputPass: восстанавливает sRGB гамма-коррекцию и применяет toneMapping
    // Без него EffectComposer выводит сырые линейные данные → блеклые цвета
    _composer.addPass(new OutputPass());

    // Звёздный фон
    _addMapStars();

    // 3 туманности
    _buildNebulae(['programming', 'medicine', 'geology']);

    _targetCenter = new THREE.Vector3(0, 0, 0);
    _targetDest = new THREE.Vector3(0, 0, 0);

    // Raycaster
    _raycaster = new THREE.Raycaster();
    _mouse = new THREE.Vector2(-999, -999);

    const canvas = _mapRenderer.domElement;
    canvas.addEventListener('mousemove', _onMapMouseMove);
    canvas.addEventListener('mousedown', _onMapMouseDown);
    canvas.addEventListener('mouseup', _onMapMouseUp);
    canvas.addEventListener('mouseleave', _onMapMouseUp);
    canvas.addEventListener('contextmenu', _onContextMenu);
    canvas.addEventListener('click', _onMapClick);
    canvas.addEventListener('wheel', _onMapWheel, { passive: false });
    canvas.addEventListener('touchstart', _onMapTouchStart, { passive: true });
    canvas.addEventListener('touchmove', _onMapTouchMove, { passive: false });
    canvas.addEventListener('touchend', _onMapTouchEnd);
    canvas.addEventListener('touchcancel', _onMapTouchEnd);

    // DOM Caching
    _tooltipEl = document.getElementById('galaxy-tooltip');
    _tooltipNameEl = document.getElementById('galaxy-tooltip-name');
    _tooltipCatEl = document.getElementById('galaxy-tooltip-cat');

    _mapResizeObs = new ResizeObserver(() => _onMapResize());
    _mapResizeObs.observe(wrap);

    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Звёзды ──────────────────────────────────────────────────────────────────

function _addMapStars(): void {
    const profile = getProfile();
    const geo = new THREE.BufferGeometry();
    const n = profile.mapStarsCount;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 600;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.7
    });
    _mapScene!.add(new THREE.Points(geo, mat));
}

// ── Туманности (оптимизированные: Points вместо отдельных Sprite) ──────────────

function _buildNebulae(clusterIds: ClusterType[]): void {
    const profile = getProfile();
    const PARTICLE_COUNT = profile.nebulaParticles;
    const SPARKS_COUNT = profile.nebulaSparks;

    for (const clusterId of clusterIds) {
        const meta = CLUSTER_META[clusterId];
        const group = new THREE.Group();
        group.position.set(meta.position.x, meta.position.y, meta.position.z);
        group.userData = { clusterId, type: 'nebula' };

        // Текстуры под цвет кластера
        const texSize = profile.glowTextureSize;
        const glowTexture = _createGlowTexture(texSize, meta.colorHex);
        const coreTexture = _createGlowTexture(texSize * 2, meta.colorHex, 0.3);
        const sparksColor = _getSparksColor(clusterId);

        // ── Слой 1: Облако частиц через Points (1 draw call!) ──
        const cloudGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const sizes = new Float32Array(PARTICLE_COUNT);
        const phases = new Float32Array(PARTICLE_COUNT);

        const baseColor = new THREE.Color(meta.color);

        // Генерация 4 под-центров для разрыва идеальной сферической формы
        const subCenters: THREE.Vector3[] = [];
        for (let j = 0; j < 4; j++) {
            subCenters.push(new THREE.Vector3(
                (Math.random() - 0.5) * 40,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 40
            ));
        }

        const clusterPlanets = _allPlanets.filter(p => p.clusterId === clusterId);
        let maxOrbitR = 8;
        for (let j = 0; j < clusterPlanets.length; j++) {
            const r = 8 + (j % 4) * 4.8 + Math.floor(j / 4) * 2.2;
            if (r > maxOrbitR) maxOrbitR = r;
        }
        const innerRadius = maxOrbitR + 6; // Сделаем отступ от последней орбиты

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            let px = 0, py = 0, pz = 0;
            let distSq = 0;
            let attempts = 0;
            const minDistSq = (maxOrbitR + 3) * (maxOrbitR + 3);

            do {
                const node = subCenters[Math.floor(Math.random() * subCenters.length)];
                const r = innerRadius + Math.random() * 37;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);

                px = node.x + r * Math.sin(phi) * Math.cos(theta) * 1.5;
                py = node.y + r * Math.sin(phi) * Math.sin(theta) * 0.25;
                pz = node.z + r * Math.cos(phi) * 1.2;

                distSq = px * px + py * py + pz * pz;
                attempts++;
            } while (distSq < minDistSq && attempts < 5);

            positions[i * 3]     = px;
            positions[i * 3 + 1] = py;
            positions[i * 3 + 2] = pz;

            // Вариация яркости
            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3]     = baseColor.r * brightness;
            colors[i * 3 + 1] = baseColor.g * brightness;
            colors[i * 3 + 2] = baseColor.b * brightness;

            sizes[i] = 1.5 + Math.random() * 3;
            phases[i] = Math.random() * Math.PI * 2;
        }

        cloudGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        cloudGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        cloudGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        cloudGeo.userData = { phases };

        const cloudMat = new THREE.PointsMaterial({
            size: 2.5,
            map: glowTexture,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const cloud = new THREE.Points(cloudGeo, cloudMat);
        cloud.userData = { type: 'nebula-cloud' };
        group.add(cloud);

        // ── Слой 2: Яркие "искры" (1 draw call) ──
        const sparksGeo = new THREE.BufferGeometry();
        const sparksPos = new Float32Array(SPARKS_COUNT * 3);
        for (let i = 0; i < SPARKS_COUNT; i++) {
            const node = subCenters[Math.floor(Math.random() * subCenters.length)];
            const r = innerRadius + Math.random() * 25; // Искры тоже снаружи
            const theta = Math.random() * Math.PI * 2;
            
            sparksPos[i * 3]     = node.x + r * Math.cos(theta) * 1.5;
            sparksPos[i * 3 + 1] = node.y + (Math.random() - 0.5) * 5;
            sparksPos[i * 3 + 2] = node.z + r * Math.sin(theta) * 1.2;
        }
        sparksGeo.setAttribute('position', new THREE.BufferAttribute(sparksPos, 3));

        const sparksMat = new THREE.PointsMaterial({
            size: 2,
            map: _createGlowTexture(64, sparksColor),
            color: new THREE.Color(sparksColor),
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const sparks = new THREE.Points(sparksGeo, sparksMat);
        sparks.userData = { type: 'sparks' };
        group.add(sparks);

        // ── Слой 3: Пульсирующее ядро (1 спрайт) ──
        const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: coreTexture,
            color: new THREE.Color(meta.color),
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        coreSprite.scale.set(60, 60, 1);
        coreSprite.userData = { type: 'core', currentScale: 60, currentOp: 0.4 };
        group.add(coreSprite);

        // ── Слой 4: Точечный свет ──
        const light = new THREE.PointLight(meta.color, 1.2, 120);
        group.add(light);

        // ── Хит-бокс (невидимая сфера для raycasting) ──
        // Увеличен радиус с 14 до 30 из-за размашистости туманностей
        const hitGeo = new THREE.SphereGeometry(30, 16, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.userData = { clusterId, type: 'nebula-hitbox' };
        group.add(hitMesh);

        _mapScene!.add(group);
        (_nebulaMeshes as Record<ClusterType, THREE.Group>)[clusterId] = group;
    }
}

/**
 * Возвращает акцентный цвет искр для каждой туманности
 */
function _getSparksColor(clusterId: ClusterType): string {
    switch (clusterId) {
        case 'programming': return '#a78bfa'; // фиолетовый (IT)
        case 'medicine':    return '#fca5a5'; // розовый (Медицина)
        case 'geology':     return '#6ee7b7'; // мятный (Геология)
    }
}

// ── Планеты внутри фокусированной туманности ────────────────────────────────

/** Lazily creates shared geometries for all planet meshes (1 allocation instead of N) */
function _ensureSharedGeos(): void {
    if (_sharedPlanetGeo) return;
    const p = getProfile();
    // Unit-radius sphere; actual size is controlled via mesh.scale
    _sharedPlanetGeo = new THREE.SphereGeometry(1, p.planetSegments[0], p.planetSegments[1]);
    // Outline sphere (slightly larger)
    _sharedOutlineGeo = new THREE.SphereGeometry(1, 16, 12);
    // Ring (unit-size, scaled per planet)
    _sharedRingGeo = new THREE.RingGeometry(1.3, 1.45, p.planetRingSegments);
    // Orbit line (unit-radius circle)
    _sharedOrbitGeo = new THREE.BufferGeometry().setFromPoints(
        new THREE.Path().absarc(0, 0, 1, 0, Math.PI * 2, false).getPoints(64)
    );
}

function _buildPlanetsForCluster(clusterId: ClusterType): void {
    if (!_mapScene) return;

    _clearPlanetMeshes();
    _ensureSharedGeos();

    const clusterPlanets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const center = meta.position;

    clusterPlanets.forEach((planet, i) => {
        const discovered = _discoveredIds.has(planet.id) || planet.isStarterVisible;
        const baseColor = new THREE.Color(meta.color);

        const radius = 0.8 + Math.min(planet.unlockCost ?? 5, 10) * 0.08;
        const visibleColor = discovered ? baseColor.clone().lerp(new THREE.Color(0xffffff), 0.22) : new THREE.Color(0x46506f);
        const baseEmissiveIntensity = discovered ? 0.72 : 0.2;
        const mat = new THREE.MeshStandardMaterial({
            color: visibleColor,
            emissive: discovered ? baseColor : new THREE.Color(0x111122),
            emissiveIntensity: baseEmissiveIntensity,
            roughness: 0.3,
            metalness: 0.22,
            transparent: !discovered,
            opacity: discovered ? 1.0 : 0.62,
        });

        // Reuse shared geometry, control size via scale
        const mesh = new THREE.Mesh(_sharedPlanetGeo!, mat);
        mesh.scale.setScalar(radius);

        // Расположение и форма орбиты
        const angle = (i / clusterPlanets.length) * Math.PI * 2 + Math.random() * 0.18;
        const orbitR = 8 + (i % 4) * 4.8 + Math.floor(i / 4) * 2.2;
        const orbitRadiusX = orbitR;
        const orbitRadiusZ = orbitR * (0.6 + Math.random() * 0.4); // Эллипс
        const yOffset = (Math.random() - 0.5) * 3;
        const tiltX = (Math.random() - 0.5) * 0.3; // небольшой наклон
        const tiltZ = (Math.random() - 0.5) * 0.3;
        // Угловая скорость: чем дальше орбита, тем медленнее (двигаются все планеты)
        const orbitSpeed = 0.15 / Math.sqrt(orbitR);

        // Создаём Pivot (родительский узел) для наклона всей орбиты
        const orbitPivot = new THREE.Group();
        orbitPivot.position.set(center.x, center.y + yOffset, center.z);
        orbitPivot.rotation.set(tiltX, 0, tiltZ);
        orbitPivot.userData = { type: 'orbit-pivot' };
        _mapScene!.add(orbitPivot);

        // Планета позиционируется локально внутри Pivot
        mesh.position.set(
            Math.cos(angle) * orbitRadiusX,
            0,
            Math.sin(angle) * orbitRadiusZ
        );

        mesh.userData = {
            planetId: planet.id,
            planetName: planet.name,
            clusterId,
            discovered,
            unlockCost: planet.unlockCost,
            baseEmissiveIntensity,
            type: 'planet',
            // Orbital animation data
            orbitAngle: angle,
            orbitRadiusX,
            orbitRadiusZ,
            orbitSpeed,
        };

        // Кольцо для открытых планет (shared ring geo, unique material)
        if (discovered) {
            const ringMat = new THREE.MeshBasicMaterial({
                color: meta.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25,
            });
            const ring = new THREE.Mesh(_sharedRingGeo!, ringMat);
            ring.rotation.x = Math.PI / 2;
            // Scale ring relative to planet radius (undo parent scale then apply ring size)
            const ringScale = (radius + 0.3) / radius;
            ring.scale.setScalar(ringScale);
            mesh.add(ring);
        }

        // Темный контур вокруг планеты (shared outline geo, unique material)
        const outline = new THREE.Mesh(
            _sharedOutlineGeo!,
            new THREE.MeshBasicMaterial({
                color: discovered ? 0xb8c2d8 : 0x9aa3b5,
                side: THREE.BackSide,
                transparent: true,
                opacity: discovered ? 0.26 : 0.2,
                depthWrite: false,
            })
        );
        // Outline is slightly larger than planet (1.1x)
        outline.scale.setScalar(1.1);
        mesh.add(outline);

        // Тонкая линия орбиты для каждой планеты (shared orbit geo, unique material)
        const orbitMat = new THREE.LineBasicMaterial({
            color: discovered ? meta.color : 0x556677,
            transparent: true,
            opacity: discovered ? 0.25 : 0.1,
            depthWrite: false,
        });
        const orbitLine = new THREE.LineLoop(_sharedOrbitGeo!, orbitMat);
        orbitLine.scale.set(orbitRadiusX, orbitRadiusZ, 1);
        orbitLine.rotation.x = Math.PI / 2;
        orbitLine.userData = { planetId: planet.id, type: 'orbit' };
        orbitPivot.add(orbitLine);
        _orbitMap.set(planet.id, orbitLine);

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: _createGlowTexture(128, meta.colorHex, 0.4),
            color: discovered
                ? new THREE.Color(meta.color).lerp(new THREE.Color(0xffffff), 0.2)
                : new THREE.Color(meta.color).lerp(new THREE.Color(0x111827), 0.35),
            transparent: true,
            opacity: discovered ? 0.42 : 0.24,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        halo.scale.set(4.8, 4.8, 1);
        mesh.add(halo);

        orbitPivot.add(mesh); // Добавляем планету в Pivot, а не напрямую в сцену
        _planetMeshes.push(mesh);
    });
}

function _clearPlanetMeshes(): void {
    _planetMeshes.forEach(m => {
        if (m.parent && m.parent !== _mapScene) {
            _mapScene?.remove(m.parent); // Удаляем весь orbitPivot из сцены
        } else {
            _mapScene?.remove(m);
        }
        // Recursively dispose all materials and textures (but NOT shared geometries)
        m.traverse(child => {
            const c = child as THREE.Mesh;
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(mat => {
                    for (const key of Object.keys(mat)) {
                        const val = (mat as unknown as Record<string, unknown>)[key];
                        if (val instanceof THREE.Texture) val.dispose();
                    }
                    mat.dispose();
                });
            }
        });
    });
    _planetMeshes = [];
    _hoveredObj = null;

    _orbitMap.forEach(line => {
        if (line.parent) line.removeFromParent();
        if (line.material) (line.material as THREE.Material).dispose();
    });
    _orbitMap.clear();
}

// ── Render loop ─────────────────────────────────────────────────────────────

function _mapRenderLoop(): void {
    if (!_mapRenderer || !_mapScene || !_mapCamera) return;

    // Плавное перемещение камеры
    if (_targetDest && _targetCenter) {
        _targetCenter.lerp(_targetDest, 0.05);
        _spherical.radius += (_targetRadius - _spherical.radius) * 0.05;

        _mapCamera.position.x = _targetCenter.x + _spherical.radius * Math.sin(_spherical.phi) * Math.sin(_spherical.theta);
        _mapCamera.position.y = _targetCenter.y + _spherical.radius * Math.cos(_spherical.phi);
        _mapCamera.position.z = _targetCenter.z + _spherical.radius * Math.sin(_spherical.phi) * Math.cos(_spherical.theta);

        _mapCamera.lookAt(_targetCenter);
    }

    // Check if planet zoom animation has completed
    if (_cameraState === 'zooming-to-planet' && _zoomingPlanetId) {
        const elapsed = performance.now() - _zoomStartTime;
        if (elapsed >= PLANET_ZOOM_DURATION) {
            // Overlay now covers the screen — swap screens underneath
            const overlay = document.getElementById('planet-zoom-overlay');
            if (overlay) overlay.className = 'covering';

            const planetId = _zoomingPlanetId;
            _zoomingPlanetId = null;
            _cameraState = 'focused'; // reset before destroy

            // Run real transition hidden behind the overlay
            transition(Screen.PLANET_DETAIL as ScreenId, {
                planetId,
                regionId: _focusedCluster ?? undefined,
                crystalType: _focusedCluster ?? undefined,
            } as Parameters<typeof dispatch<'SET_SESSION'>>[1]).then(() => {
                // Planet Detail is ready — fade out the overlay to reveal it
                if (overlay) {
                    overlay.className = 'fading';
                    setTimeout(() => { overlay.className = ''; }, 450);
                }
            });

            // transition() вызовет destroy(), обнуляя _mapRenderer — выходим сразу
            return;
        }
    }

    // Вращение и пульсация туманности
    const time = performance.now() / 1000;
    for (const group of Object.values(_nebulaMeshes)) {
        group.rotation.y += 0.001;
        
        const clusterId = group.userData.clusterId as ClusterType;
        const isFocused = _cameraState === 'focused' && _focusedCluster === clusterId;
        const isOverview = _cameraState === 'overview';
        // Если сфокусированы на другой туманности, то эта становится почти прозрачной
        const targetOpacityMultiplier = (isOverview || isFocused) ? 1.0 : 0.05;

        for (const child of group.children) {
            const ud = child.userData as Record<string, unknown>;
            if (ud.type === 'core') {
                const targetScale = isFocused ? 15 : 60;
                const targetOp = isFocused ? 0.8 : 0.4;
                
                ud.currentScale = (ud.currentScale as number) + (targetScale - (ud.currentScale as number)) * 0.05;
                ud.currentOp = (ud.currentOp as number) + (targetOp - (ud.currentOp as number)) * 0.05;

                const pulseSpeed = isFocused ? 3.0 : 1.5;
                const pulseAmp = isFocused ? 0.15 : 0.08;
                const pulse = 1 + Math.sin(time * pulseSpeed) * pulseAmp;

                (child as THREE.Sprite).scale.setScalar((ud.currentScale as number) * pulse);
                
                const mat = (child as THREE.Sprite).material;
                const finalOp = (ud.currentOp as number) + Math.sin(time * 2.0) * (isFocused ? 0.2 : 0.1);
                mat.opacity += ((finalOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
            } else if (ud.type === 'nebula-cloud') {
                const mat = ((child as THREE.Points).material as THREE.PointsMaterial);
                const baseOp = 0.45 + Math.sin(time * 0.6) * 0.05;
                mat.opacity += ((baseOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
            } else if (ud.type === 'sparks') {
                (child as THREE.Points).rotation.y += 0.003;
                const mat = ((child as THREE.Points).material as THREE.PointsMaterial);
                const baseOp = 0.6;
                mat.opacity += ((baseOp * targetOpacityMultiplier) - mat.opacity) * 0.05;
            }
        }
    }

    // Вращение и орбитальное движение планет
    _planetMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005;

        const ud = mesh.userData as Record<string, number>;
        const speed = ud.orbitSpeed;
        if (speed) {
            ud.orbitAngle += speed * 0.016; // ~60fps dt
            mesh.position.x = Math.cos(ud.orbitAngle) * ud.orbitRadiusX;
            mesh.position.z = Math.sin(ud.orbitAngle) * ud.orbitRadiusZ;
        }
    });

    // Raycasting (only if mouse moved)
    if (_mouseMovedSinceLastRaycast) {
        _mouseMovedSinceLastRaycast = false;
        
        _raycaster!.setFromCamera(_mouse!, _mapCamera);

        // Определяем что рейкастим в зависимости от состояния
        let targets: THREE.Object3D[] = [];
        if (_cameraState === 'overview') {
            // Рейкастим хит-боксы туманностей
            for (const group of Object.values(_nebulaMeshes)) {
                group.children.forEach(child => {
                    if ((child.userData as { type?: string })?.type === 'nebula-hitbox') targets.push(child);
                });
            }
        } else {
            // Рейкастим планеты
            targets = _planetMeshes;
        }

        const intersects = _raycaster!.intersectObjects(targets, false);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            if (_hoveredObj !== hit) {
                _unhover();
                _hoveredObj = hit;
                _hover(hit);
            }
        } else {
            _unhover();
        }
    }

    const settings = getStore().settings;
    const isBloomEnabled = settings?.useBloom ?? true; // по умолчанию включено
    if (isBloomEnabled && _composer) {
        _composer.render();
    } else {
        _mapRenderer.render(_mapScene, _mapCamera);
    }
    
    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Hover / Unhover ─────────────────────────────────────────────────────────

function _hover(obj: THREE.Object3D): void {
    const userData = obj.userData as Record<string, unknown>;
    if (userData?.type === 'nebula-hitbox') {
        const meta = CLUSTER_META[userData.clusterId as ClusterType];
        _showTooltip(meta?.label ?? 'Туманность', `${meta?.crystalEmoji ?? '💎'} Кристаллы`);
        if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'pointer';
    } else if (userData?.type === 'planet') {
        const mesh = obj as THREE.Mesh;
        mesh.scale.setScalar(1.22);
        if (mesh.material) {
            const baseIntensity = Number(userData.baseEmissiveIntensity ?? 0.35);
            (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = baseIntensity + 0.35;
        }
        const orbitLine = _orbitMap.get(userData.planetId as string);
        if (orbitLine && orbitLine.material) {
            (orbitLine.material as THREE.LineBasicMaterial).opacity = 0.65;
        }
        _showTooltip(
            userData.planetName as string,
            userData.discovered ? 'ЛКМ — открыть' : `🔒 ${userData.unlockCost} 💎`
        );
        if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'pointer';
    }
}

function _unhover(): void {
    if (!_hoveredObj) return;
    const userData = _hoveredObj.userData as Record<string, unknown>;
    if (userData?.type === 'planet') {
        const mesh = _hoveredObj as THREE.Mesh;
        mesh.scale.setScalar(1.0);
        if (mesh.material) {
            const baseIntensity = Number(userData.baseEmissiveIntensity ?? 0.35);
            (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = baseIntensity;
        }
        const orbitLine = _orbitMap.get(userData.planetId as string);
        if (orbitLine && orbitLine.material) {
            (orbitLine.material as THREE.LineBasicMaterial).opacity = 0.25;
        }
    }
    _hoveredObj = null;
    _hideTooltip();
    if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'default';
}

function _showTooltip(name: string, cat: string): void {
    if (_tooltipEl && _tooltipNameEl && _tooltipCatEl) {
        _tooltipNameEl.textContent = name;
        _tooltipCatEl.textContent = cat;
        _tooltipEl.classList.remove('hidden');
    }
}

function _hideTooltip(): void {
    if (_tooltipEl) _tooltipEl.classList.add('hidden');
}

// ── Обработка кликов ────────────────────────────────────────────────────────

function _onMapClick(): void {
    if (_cameraState === 'zooming-to-planet') return; // block clicks during fly animation
    if (!_hoveredObj) return;

    const userData = _hoveredObj.userData as Record<string, unknown>;
    if (userData?.type === 'nebula-hitbox') {
        // Фокусировка на туманность
        const clusterId = userData.clusterId as ClusterType;
        _focusCluster(clusterId);
    } else if (userData?.type === 'planet') {
        // Переход на планету
        const planetId = userData.planetId as string;
        window._galaxyMap.openPlanet(planetId);
    }
}

function _focusCluster(clusterId: ClusterType): void {
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    _cameraState = 'focused';
    _focusedCluster = clusterId;
    _targetDest!.set(meta.position.x, meta.position.y, meta.position.z);
    _targetRadius = 28; // Камера пролетает сквозь облако и останавливается на внутренней границе
    _updateZoomUI();
    _showBackButton(true);

    _buildPlanetsForCluster(clusterId);
    _showNebulaPanel(clusterId);
}

// ── Панель информации о туманности ──────────────────────────────────────────

function _showNebulaPanel(clusterId: ClusterType): void {
    const meta = CLUSTER_META[clusterId];
    const panel = document.getElementById('nebula-info-panel');
    if (!panel || !meta) return;

    document.getElementById('nebula-info-icon')!.textContent = meta.icon;
    document.getElementById('nebula-info-name')!.textContent = meta.label;

    const cluster = _clusters.find(c => c.name === clusterId);
    document.getElementById('nebula-info-desc')!.textContent = cluster?.description ?? '';

    const store = getStore();
    const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[clusterId] ?? 0;
    const planetCount = _allPlanets.filter(p => p.clusterId === clusterId).length;

    document.getElementById('nebula-info-crystal')!.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;
    document.getElementById('nebula-info-planets')!.textContent = `🪐 Планет: ${planetCount}`;

    // Рендерим сетку планет
    _renderPlanetGrid(clusterId);

    panel.classList.remove('hidden');
}

function _hideNebulaPanel(): void {
    const panel = document.getElementById('nebula-info-panel');
    if (panel) panel.classList.add('hidden');
}

/** Реактивно обновляет текст кристаллов и сетку планет при изменении баланса */
function _refreshNebulaPanel(): void {
    if (!_focusedCluster) return;
    const meta = CLUSTER_META[_focusedCluster];
    if (!meta) return;
    const store = getStore();
    const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[_focusedCluster] ?? 0;
    const el = document.getElementById('nebula-info-crystal');
    if (el) el.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;
    // Обновляем также discoveredIds на случай если DISCOVER_PLANET сработал
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);
    _renderPlanetGrid(_focusedCluster);
}

function _renderPlanetGrid(clusterId: ClusterType): void {
    const grid = document.getElementById('nebula-planet-grid');
    if (!grid) return;

    const planets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];
    const store = getStore();
    const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[clusterId] ?? 0;

    grid.innerHTML = planets.map(p => {
        const discovered = _discoveredIds.has(p.id) || p.isStarterVisible;
        const canUnlock = !discovered && playerCrystals >= (p.unlockCost ?? 0);

        const stateClass = discovered
            ? 'nebula-planet-card--open'
            : canUnlock
                ? 'nebula-planet-card--can-unlock'
                : 'nebula-planet-card--locked';

        const statusText = discovered
            ? '✅'
            : canUnlock
                ? `🔓 ${p.unlockCost} ${meta.crystalEmoji}`
                : `🔒 ${p.unlockCost} ${meta.crystalEmoji}`;

        return `<div class="nebula-planet-card ${stateClass}"
                     style="--accent:${meta.colorHex};"
                     onclick="window._galaxyMap?.openPlanet('${p.id}')">
            <span class="nebula-planet-name">${p.name}</span>
            <span class="nebula-planet-cost">${statusText}</span>
        </div>`;
    }).join('');
}

function _showBackButton(show: boolean): void {
    const btn = document.getElementById('btn-galaxy-back');
    if (btn) btn.classList.toggle('hidden', !show);
}

// ── Обработка ввода ─────────────────────────────────────────────────────────

function _onMapMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
        _isRightMouseDown = true;
        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }
}

function _onMapMouseUp(e: MouseEvent): void {
    if (e.button === 2 || e.type === 'mouseleave') {
        _isRightMouseDown = false;
    }
}

function _onMapMouseMove(e: MouseEvent): void {
    if (!_mapRenderer || !_mouse) return;

    if (_isRightMouseDown) {
        const deltaX = e.clientX - _lastInteractX;
        const deltaY = e.clientY - _lastInteractY;
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi -= deltaY * 0.005;
        _spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));
        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }

    const rect = _mapRenderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _mouseMovedSinceLastRaycast = true;

    // Тултип следует за мышью
    if (_tooltipEl && !_tooltipEl.classList.contains('hidden')) {
        _tooltipEl.style.left = `${e.clientX - rect.left + 12}px`;
        _tooltipEl.style.top = `${e.clientY - rect.top - 10}px`;
    }
}

function _onMapWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomSpeed = 0.05;
    _spherical.radius += Math.sign(e.deltaY) * zoomSpeed * _spherical.radius;
    const minR = _cameraState === 'focused' ? 12 : 40;
    const maxR = _cameraState === 'focused' ? 80 : 200;
    _spherical.radius = Math.max(minR, Math.min(maxR, _spherical.radius));
    _targetRadius = _spherical.radius;  // sync target to prevent lerp fighting wheel input
    _updateZoomUI();
}

function _updateZoomUI(): void {
    const el = document.getElementById('galaxy-zoom-percent');
    if (el) {
        const maxR = _cameraState === 'focused' ? 80 : 200;
        const minR = _cameraState === 'focused' ? 12 : 40;
        const pct = Math.round(((maxR - _targetRadius) / (maxR - minR)) * 100);
        el.textContent = `${pct}%`;
    }
}

function _onMapTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
        _isTouchDown = true;
        _lastInteractX = e.touches[0].clientX;
        _lastInteractY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        _isTouchDown = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
    if (_mapRenderer) {
        const rect = _mapRenderer.domElement.getBoundingClientRect();
        const t = e.touches[0];
        _mouse!.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse!.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
    }
}

function _onMapTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1 || e.touches.length === 2) e.preventDefault();

    if (_isTouchDown && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - _lastInteractX;
        const deltaY = e.touches[0].clientY - _lastInteractY;
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi -= deltaY * 0.005;
        _spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));
        _lastInteractX = e.touches[0].clientX;
        _lastInteractY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = _lastPinchDist - dist;
        _spherical.radius += delta * 0.2;
        const minR = _cameraState === 'focused' ? 12 : 40;
        const maxR = _cameraState === 'focused' ? 80 : 200;
        _spherical.radius = Math.max(minR, Math.min(maxR, _spherical.radius));
        _targetRadius = _spherical.radius;  // sync target to prevent lerp fighting pinch input
        _updateZoomUI();
        _lastPinchDist = dist;
    }

    if (_mapRenderer && e.touches.length > 0) {
        const rect = _mapRenderer.domElement.getBoundingClientRect();
        const t = e.touches[0];
        _mouse!.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse!.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        _mouseMovedSinceLastRaycast = true;
    }
}

function _onMapTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
        // Tap = click
        if (_isTouchDown) _onMapClick();
        _isTouchDown = false;
    }
}

function _onMapResize(): void {
    const wrap = document.getElementById('galaxy-3d-canvas-wrap');
    if (!wrap || !_mapRenderer || !_mapCamera) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) return;
    _mapCamera.aspect = w / h;
    _mapCamera.updateProjectionMatrix();
    _mapRenderer.setSize(w, h, false);
    if (_composer) _composer.setSize(w, h);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function _cleanup3D(): void {
    if (_mapAnimId) cancelAnimationFrame(_mapAnimId);
    _mapAnimId = null;

    // Dispose render targets внутри composer (предотвращает утечку GPU-памяти)
    if (_composer) { _composer.dispose(); _composer = null; }

    if (_mapResizeObs) { _mapResizeObs.disconnect(); _mapResizeObs = null; }

    // Recursively free all GPU resources of the entire scene (nebulae, stars, lights, etc.)
    if (_mapScene) {
        disposeSceneGraph(_mapScene);
    }

    // Dispose shared planet geometries
    _sharedPlanetGeo?.dispose(); _sharedPlanetGeo = null;
    _sharedOutlineGeo?.dispose(); _sharedOutlineGeo = null;
    _sharedRingGeo?.dispose(); _sharedRingGeo = null;

    // Dispose texture cache (CanvasTextures stay in VRAM until disposed)
    _textureCache.forEach(tex => tex.dispose());
    _textureCache.clear();

    if (_mapRenderer) {
        const canvas = _mapRenderer.domElement;
        canvas.removeEventListener('mousemove', _onMapMouseMove);
        canvas.removeEventListener('mousedown', _onMapMouseDown);
        canvas.removeEventListener('mouseup', _onMapMouseUp);
        canvas.removeEventListener('mouseleave', _onMapMouseUp);
        canvas.removeEventListener('contextmenu', _onContextMenu);
        canvas.removeEventListener('click', _onMapClick);
        canvas.removeEventListener('wheel', _onMapWheel);
        canvas.removeEventListener('touchstart', _onMapTouchStart);
        canvas.removeEventListener('touchmove', _onMapTouchMove);
        canvas.removeEventListener('touchend', _onMapTouchEnd);
        canvas.removeEventListener('touchcancel', _onMapTouchEnd);
        canvas.parentNode?.removeChild(canvas);
        _mapRenderer.forceContextLoss(); // explicitly free GPU context since we use a 2nd renderer
        _mapRenderer.dispose();
        _mapRenderer = null;
    }

    _clearPlanetMeshes();
    _mapScene = null;
    _mapCamera = null;
    _nebulaMeshes = {} as Record<ClusterType, THREE.Group>;
    _hoveredObj = null;
    _isRightMouseDown = false;
    _isTouchDown = false;
}

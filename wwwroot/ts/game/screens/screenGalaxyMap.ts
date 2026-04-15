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
import { getStore, dispatch, transition, Screen, ScreenId } from '../stateManager.js';
import { switchScene } from '../threeScene.js';
import { GameStore, PlanetDto, ClusterDto, ClusterType, CrystalType, ClusterMeta } from '../types.js';
import { getProfile, onQualityChange, offQualityChange } from '../qualityPresets.js';

// ── Мета-данные кластеров ───────────────────────────────────────────────────

const CLUSTER_META: Record<ClusterType, ClusterMeta> = {
    programming: {
        label: 'Туманность Кибернетики',
        icon: '💻',
        color: 0x4fc3f7,
        colorHex: '#4fc3f7',
        crystalEmoji: '💎',
        position: { x: -40, y: 5, z: -10 },
    },
    medicine: {
        label: 'Туманность Целителей',
        icon: '⚕',
        color: 0xf87171,
        colorHex: '#f87171',
        crystalEmoji: '❤️',
        position: { x: 35, y: 15, z: -15 },
    },
    geology: {
        label: 'Туманность Геодезистов',
        icon: '🌍',
        color: 0x34d399,
        colorHex: '#34d399',
        crystalEmoji: '🌿',
        position: { x: 10, y: -20, z: 30 },
    },
};

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _allPlanets: PlanetDto[] = [];
let _clusters: ClusterDto[] = [];
let _discoveredIds = new Set<string>();
let _cameraState: 'overview' | 'focused' = 'overview';
let _focusedCluster: ClusterType | null = null;

// Three.js
let _mapRenderer: THREE.WebGLRenderer | null = null;
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
        _spherical.radius = 120;
        _updateZoomUI();
        // Восстанавливаем качество
        if (_mapRenderer) {
            _mapRenderer.setPixelRatio(getProfile().pixelRatio);
        }
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
        transition(Screen.PLANET_DETAIL as ScreenId, { planetId } as Parameters<typeof dispatch<'SET_SESSION'>>[1]);
    },
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    await switchScene('galaxy-map');

    _clusters = (store.sessionData?.clusters ?? []) as ClusterDto[];
    _allPlanets = (store.sessionData?.catalog ?? []) as PlanetDto[];
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);

    // Если каталог пуст, загружаем
    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/proj?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json() as PlanetDto[];
        } catch { /* офлайн */ }
    }

    _cameraState = 'overview';
    _focusedCluster = null;
    _init3DMap();

    // Подписка на изменение качества графики (полная переинициализация карты)
    _isGalaxyMapActive = true;
    onQualityChange(_onQualityChanged);
}

export function destroy(): void {
    _isGalaxyMapActive = false;
    offQualityChange(_onQualityChanged);
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
    canvas.addEventListener('contextmenu', e => e.preventDefault());
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

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const r = 8 + Math.random() * 12;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Вариация яркости
            const brightness = 0.6 + Math.random() * 0.4;
            colors[i * 3] = baseColor.r * brightness;
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
            const r = 5 + Math.random() * 8;
            const theta = Math.random() * Math.PI * 2;
            sparksPos[i * 3] = r * Math.cos(theta);
            sparksPos[i * 3 + 1] = (Math.random() - 0.5) * 3;
            sparksPos[i * 3 + 2] = r * Math.sin(theta);
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
        coreSprite.scale.set(30, 30, 1);
        coreSprite.userData = { type: 'core' };
        group.add(coreSprite);

        // ── Слой 4: Точечный свет ──
        const light = new THREE.PointLight(meta.color, 1.2, 80);
        group.add(light);

        // ── Хит-бокс (невидимая сфера для raycasting) ──
        const hitGeo = new THREE.SphereGeometry(14, 16, 12);
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

function _buildPlanetsForCluster(clusterId: ClusterType): void {
    if (!_mapScene) return;

    _clearPlanetMeshes();

    const clusterPlanets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const center = meta.position;

    clusterPlanets.forEach((planet, i) => {
        const discovered = _discoveredIds.has(planet.id) || planet.isStarterVisible;
        const baseColor = new THREE.Color(meta.color);

        const radius = 0.8 + Math.min(planet.unlockCost ?? 5, 10) * 0.08;
        const profile = getProfile();
        const geo = new THREE.SphereGeometry(radius, profile.planetSegments[0], profile.planetSegments[1]);
        const mat = new THREE.MeshStandardMaterial({
            color: discovered ? baseColor : 0x333344,
            emissive: discovered ? baseColor : new THREE.Color(0x111122),
            emissiveIntensity: discovered ? 0.35 : 0.05,
            roughness: 0.55,
            metalness: 0.3,
            transparent: !discovered,
            opacity: discovered ? 1.0 : 0.4,
        });

        const mesh = new THREE.Mesh(geo, mat);

        // Расположение вокруг центра туманности
        const angle = (i / clusterPlanets.length) * Math.PI * 2 + Math.random() * 0.3;
        const orbitR = 5 + (i % 3) * 3.5;
        const yOffset = (Math.random() - 0.5) * 4;

        mesh.position.set(
            center.x + Math.cos(angle) * orbitR,
            center.y + yOffset,
            center.z + Math.sin(angle) * orbitR
        );

        mesh.userData = {
            planetId: planet.id,
            planetName: planet.name,
            clusterId,
            discovered,
            unlockCost: planet.unlockCost,
            type: 'planet',
        };

        // Кольцо для открытых планет
        if (discovered) {
            const p = getProfile();
            const ringGeo = new THREE.RingGeometry(radius + 0.3, radius + 0.45, p.planetRingSegments);
            const ringMat = new THREE.MeshBasicMaterial({
                color: meta.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            mesh.add(ring);
        }

        _mapScene!.add(mesh);
        _planetMeshes.push(mesh);
    });
}

function _clearPlanetMeshes(): void {
    _planetMeshes.forEach(m => {
        _mapScene?.remove(m);
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
    });
    _planetMeshes = [];
    _hoveredObj = null;
}

// ── Render loop ─────────────────────────────────────────────────────────────

function _mapRenderLoop(): void {
    if (!_mapRenderer || !_mapScene || !_mapCamera) return;

    // Плавное перемещение камеры
    if (_targetDest && _targetCenter) {
        _targetCenter.lerp(_targetDest, 0.05);

        _mapCamera.position.x = _targetCenter.x + _spherical.radius * Math.sin(_spherical.phi) * Math.sin(_spherical.theta);
        _mapCamera.position.y = _targetCenter.y + _spherical.radius * Math.cos(_spherical.phi);
        _mapCamera.position.z = _targetCenter.z + _spherical.radius * Math.sin(_spherical.phi) * Math.cos(_spherical.theta);

        _mapCamera.lookAt(_targetCenter);
    }

    // Вращение и пульсация туманности
    const time = performance.now() / 1000;
    for (const group of Object.values(_nebulaMeshes)) {
        group.rotation.y += 0.001;
        
        // Пульсация только ядра (1 объект вместо 800)
        for (const child of group.children) {
            const ud = child.userData as Record<string, unknown>;
            if (ud.type === 'core') {
                const pulse = 1 + Math.sin(time * 1.5) * 0.08;
                (child as THREE.Sprite).scale.setScalar(30 * pulse);
                (child as THREE.Sprite).material.opacity = 0.35 + Math.sin(time * 1.2) * 0.1;
            } else if (ud.type === 'nebula-cloud') {
                // Лёгкое мерцание всего облака
                ((child as THREE.Points).material as THREE.PointsMaterial).opacity = 0.45 + Math.sin(time * 0.6) * 0.05;
            } else if (ud.type === 'sparks') {
                (child as THREE.Points).rotation.y += 0.003;
            }
        }
    }

    // Вращение планет
    _planetMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005;
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

    _mapRenderer.render(_mapScene, _mapCamera);
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
        mesh.scale.setScalar(1.3);
        if (mesh.material) (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
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
            const disc = userData.discovered as boolean;
            (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = disc ? 0.35 : 0.05;
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
    if (!_hoveredObj) return;

    const userData = _hoveredObj.userData as Record<string, unknown>;
    if (userData?.type === 'nebula-hitbox') {
        // Фокусировка на туманность
        const clusterId = userData.clusterId as ClusterType;
        const meta = CLUSTER_META[clusterId];
        if (!meta) return;

        _cameraState = 'focused';
        _focusedCluster = clusterId;
        _targetDest!.set(meta.position.x, meta.position.y, meta.position.z);
        _spherical.radius = 30;
        _updateZoomUI();
        _showBackButton(true);

        // Снижаем pixel ratio при приближении для производительности
        if (_mapRenderer) {
            _mapRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        }

        // Строим планеты
        _buildPlanetsForCluster(clusterId);

        // Показываем панель
        _showNebulaPanel(clusterId);
    } else if (userData?.type === 'planet') {
        // Переход на планету
        const planetId = userData.planetId as string;
        window._galaxyMap.openPlanet(planetId);
    }
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

function _renderPlanetGrid(clusterId: ClusterType): void {
    const grid = document.getElementById('nebula-planet-grid');
    if (!grid) return;

    const planets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];

    grid.innerHTML = planets.map(p => {
        const discovered = _discoveredIds.has(p.id) || p.isStarterVisible;
        return `<div class="nebula-planet-card ${discovered ? 'nebula-planet-card--open' : 'nebula-planet-card--locked'}"
                     style="--accent:${meta.colorHex};"
                     onclick="window._galaxyMap?.openPlanet('${p.id}')">
            <span class="nebula-planet-name">${discovered ? p.name : '???'}</span>
            <span class="nebula-planet-cost">${discovered ? '✅' : `🔒 ${p.unlockCost} ${meta.crystalEmoji}`}</span>
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
    if (_isRightMouseDown) {
        const deltaX = e.clientX - _lastInteractX;
        const deltaY = e.clientY - _lastInteractY;
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi -= deltaY * 0.005;
        _spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));
        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }

    const rect = _mapRenderer!.domElement.getBoundingClientRect();
    _mouse!.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse!.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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
    _updateZoomUI();
}

function _updateZoomUI(): void {
    const el = document.getElementById('galaxy-zoom-percent');
    if (el) {
        const maxR = _cameraState === 'focused' ? 80 : 200;
        const minR = _cameraState === 'focused' ? 12 : 40;
        const pct = Math.round(((maxR - _spherical.radius) / (maxR - minR)) * 100);
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
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function _cleanup3D(): void {
    if (_mapAnimId) cancelAnimationFrame(_mapAnimId);
    _mapAnimId = null;

    if (_mapResizeObs) { _mapResizeObs.disconnect(); _mapResizeObs = null; }

    if (_mapRenderer) {
        const canvas = _mapRenderer.domElement;
        canvas.removeEventListener('mousemove', _onMapMouseMove);
        canvas.removeEventListener('mousedown', _onMapMouseDown);
        canvas.removeEventListener('mouseup', _onMapMouseUp);
        canvas.removeEventListener('mouseleave', _onMapMouseUp);
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

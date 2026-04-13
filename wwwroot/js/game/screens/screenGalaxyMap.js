/**
 * screenGalaxyMap.js — Звёздная карта: 3 туманности с планетами внутри
 *
 * Два состояния камеры:
 *   - overview:  общий вид, видны 3 туманности (облака частиц)
 *   - focused:   камера приблизилась к выбранной туманности, видны планеты-сферы
 *
 * Three.js: отдельный WebGLRenderer внутри #galaxy-3d-canvas-wrap.
 */

import { getStore, dispatch, transition, Screen } from '../stateManager.js';
import { switchScene } from '../threeScene.js';

// ── Мета-данные кластеров ───────────────────────────────────────────────────

const CLUSTER_META = {
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

let _allPlanets    = [];
let _clusters      = [];
let _discoveredIds = new Set();
let _cameraState   = 'overview';  // 'overview' | 'focused'
let _focusedCluster = null;       // 'programming' | 'medicine' | 'geology'

// Three.js
let _mapRenderer   = null;
let _mapScene      = null;
let _mapCamera     = null;
let _mapAnimId     = null;
let _raycaster     = null;
let _mouse         = null;
let _nebulaMeshes  = {};   // { programming: Group, medicine: Group, geology: Group }
let _planetMeshes  = [];   // Mesh[] — планеты текущего focused-кластера
let _hoveredObj    = null;
let _isRightMouseDown = false;
let _isTouchDown   = false;
let _lastInteractX = 0;
let _lastInteractY = 0;
let _spherical     = { radius: 120, theta: 0, phi: 1.1 };
let _targetCenter  = null;
let _targetDest    = null;
let _lastPinchDist = 0;
let _mapResizeObs  = null;
let _nebulaLabels  = [];  // { element, position, clusterId }

// ── Глобальный API для HTML-onclick ─────────────────────────────────────────

window._galaxyMap = {
    backToOverview() {
        _cameraState = 'overview';
        _focusedCluster = null;
        _clearPlanetMeshes();
        _hideNebulaPanel();
        _showBackButton(false);
        _targetDest.set(0, 0, 0);
        _spherical.radius = 120;
        _updateZoomUI();
    },

    resetCamera() {
        window._galaxyMap.backToOverview();
        _spherical.theta = 0;
        _spherical.phi   = 1.1;
    },

    flyToRegion() {
        if (!_focusedCluster) return;
        transition(Screen.FLIGHT, {
            regionId:    _focusedCluster,
            crystalType: _focusedCluster,
        });
    },

    openPlanet(planetId) {
        transition(Screen.PLANET_DETAIL, { planetId });
    },
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store) {
    await switchScene('galaxy-map');

    _clusters      = store.sessionData?.clusters ?? [];
    _allPlanets    = store.sessionData?.catalog ?? [];
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);

    // Если каталог пуст, загружаем
    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/proj?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json();
        } catch { /* офлайн */ }
    }

    _cameraState = 'overview';
    _focusedCluster = null;
    _init3DMap();
}

export function destroy() {
    _cleanup3D();
}

// ═══════════════════════════════════════════════════════════════════════════
//  3D MAP
// ═══════════════════════════════════════════════════════════════════════════

function _init3DMap() {
    const THREE = window.THREE;
    if (!THREE) return;

    const wrap = document.getElementById('galaxy-3d-canvas-wrap');
    if (!wrap) return;

    const w = wrap.clientWidth || 600;
    const h = wrap.clientHeight || 400;

    // Рендерер
    _mapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    _mapRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _mapRenderer.setSize(w, h, false);
    _mapRenderer.setClearColor(0x050a1a, 1);
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
    _addMapStars(THREE);

    // 3 туманности
    _buildNebulae(THREE);

    _targetCenter = new THREE.Vector3(0, 0, 0);
    _targetDest   = new THREE.Vector3(0, 0, 0);

    // Raycaster
    _raycaster = new THREE.Raycaster();
    _mouse     = new THREE.Vector2(-999, -999);

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

    _mapResizeObs = new ResizeObserver(() => _onMapResize());
    _mapResizeObs.observe(wrap);

    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Звёзды ──────────────────────────────────────────────────────────────────

function _addMapStars(THREE) {
    const geo = new THREE.BufferGeometry();
    const n   = 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 600;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.7
    });
    _mapScene.add(new THREE.Points(geo, mat));
}

// ── Туманности (облака частиц) ──────────────────────────────────────────────

function _buildNebulae(THREE) {
    _nebulaMeshes = {};

    for (const [clusterId, meta] of Object.entries(CLUSTER_META)) {
        const group = new THREE.Group();
        group.position.set(meta.position.x, meta.position.y, meta.position.z);
        group.userData = { clusterId, type: 'nebula' };

        // Облако частиц (sphere of particles)
        const count  = 800;
        const geo    = new THREE.BufferGeometry();
        const pos    = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const color  = new THREE.Color(meta.color);

        for (let i = 0; i < count; i++) {
            // Gaussian-like распределение внутри сферы
            const r     = 8 + Math.random() * 10;
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);
            pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6; // сжатие по Y
            pos[i * 3 + 2] = r * Math.cos(phi);

            const brightness = 0.5 + Math.random() * 0.5;
            colors[i * 3]     = color.r * brightness;
            colors[i * 3 + 1] = color.g * brightness;
            colors[i * 3 + 2] = color.b * brightness;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 1.2,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.45,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const cloud = new THREE.Points(geo, mat);
        group.add(cloud);

        // Ядро (Sprite glow)
        const spriteMat = new THREE.SpriteMaterial({
            color: meta.color,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(25, 25, 1);
        group.add(sprite);

        // Точечный свет
        const light = new THREE.PointLight(meta.color, 0.8, 60);
        group.add(light);

        // Хит-бокс (невидимая сфера для raycasting)
        const hitGeo = new THREE.SphereGeometry(14, 16, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.userData = { clusterId, type: 'nebula-hitbox' };
        group.add(hitMesh);

        _mapScene.add(group);
        _nebulaMeshes[clusterId] = group;
    }
}

// ── Планеты внутри фокусированной туманности ────────────────────────────────

function _buildPlanetsForCluster(clusterId) {
    const THREE = window.THREE;
    if (!THREE || !_mapScene) return;

    _clearPlanetMeshes();

    const clusterPlanets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const center = meta.position;

    clusterPlanets.forEach((planet, i) => {
        const discovered = _discoveredIds.has(planet.id) || planet.isStarterVisible;
        const baseColor  = new THREE.Color(meta.color);

        const radius = 0.8 + Math.min(planet.unlockCost ?? 5, 10) * 0.08;
        const geo    = new THREE.SphereGeometry(radius, 24, 18);
        const mat    = new THREE.MeshStandardMaterial({
            color:            discovered ? baseColor : 0x333344,
            emissive:         discovered ? baseColor : new THREE.Color(0x111122),
            emissiveIntensity: discovered ? 0.35 : 0.05,
            roughness:        0.55,
            metalness:        0.3,
            transparent:      !discovered,
            opacity:          discovered ? 1.0 : 0.4,
        });

        const mesh = new THREE.Mesh(geo, mat);

        // Расположение вокруг центра туманности
        const angle   = (i / clusterPlanets.length) * Math.PI * 2 + Math.random() * 0.3;
        const orbitR  = 5 + (i % 3) * 3.5;
        const yOffset = (Math.random() - 0.5) * 4;

        mesh.position.set(
            center.x + Math.cos(angle) * orbitR,
            center.y + yOffset,
            center.z + Math.sin(angle) * orbitR
        );

        mesh.userData = {
            planetId:   planet.id,
            planetName: planet.name,
            clusterId:  clusterId,
            discovered: discovered,
            unlockCost: planet.unlockCost,
            type:       'planet',
        };

        // Кольцо для открытых планет
        if (discovered) {
            const ringGeo = new THREE.RingGeometry(radius + 0.3, radius + 0.45, 32);
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

        _mapScene.add(mesh);
        _planetMeshes.push(mesh);
    });
}

function _clearPlanetMeshes() {
    _planetMeshes.forEach(m => {
        _mapScene?.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
    });
    _planetMeshes = [];
    _hoveredObj = null;
}

// ── Render loop ─────────────────────────────────────────────────────────────

function _mapRenderLoop() {
    if (!_mapRenderer || !_mapScene || !_mapCamera) return;

    // Плавное перемещение камеры
    if (_targetDest && _targetCenter) {
        _targetCenter.lerp(_targetDest, 0.05);

        _mapCamera.position.x = _targetCenter.x + _spherical.radius * Math.sin(_spherical.phi) * Math.sin(_spherical.theta);
        _mapCamera.position.y = _targetCenter.y + _spherical.radius * Math.cos(_spherical.phi);
        _mapCamera.position.z = _targetCenter.z + _spherical.radius * Math.sin(_spherical.phi) * Math.cos(_spherical.theta);

        _mapCamera.lookAt(_targetCenter);
    }

    // Вращение частиц туманности
    for (const group of Object.values(_nebulaMeshes)) {
        group.rotation.y += 0.001;
    }

    // Вращение планет
    _planetMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005;
    });

    // Raycasting
    _raycaster.setFromCamera(_mouse, _mapCamera);

    // Определяем что рейкастим в зависимости от состояния
    let targets = [];
    if (_cameraState === 'overview') {
        // Рейкастим хит-боксы туманностей
        for (const group of Object.values(_nebulaMeshes)) {
            group.children.forEach(child => {
                if (child.userData?.type === 'nebula-hitbox') targets.push(child);
            });
        }
    } else {
        // Рейкастим планеты
        targets = _planetMeshes;
    }

    const intersects = _raycaster.intersectObjects(targets, false);

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

    _mapRenderer.render(_mapScene, _mapCamera);
    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Hover / Unhover ─────────────────────────────────────────────────────────

function _hover(obj) {
    if (obj.userData?.type === 'nebula-hitbox') {
        const meta = CLUSTER_META[obj.userData.clusterId];
        _showTooltip(meta?.label ?? 'Туманность', `${meta?.crystalEmoji ?? '💎'} Кристаллы`);
        if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'pointer';
    } else if (obj.userData?.type === 'planet') {
        obj.scale.setScalar(1.3);
        if (obj.material) obj.material.emissiveIntensity = 0.8;
        _showTooltip(
            obj.userData.planetName,
            obj.userData.discovered ? 'ЛКМ — открыть' : `🔒 ${obj.userData.unlockCost} 💎`
        );
        if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'pointer';
    }
}

function _unhover() {
    if (!_hoveredObj) return;
    if (_hoveredObj.userData?.type === 'planet') {
        _hoveredObj.scale.setScalar(1.0);
        if (_hoveredObj.material) {
            const disc = _hoveredObj.userData.discovered;
            _hoveredObj.material.emissiveIntensity = disc ? 0.35 : 0.05;
        }
    }
    _hoveredObj = null;
    _hideTooltip();
    if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'default';
}

function _showTooltip(name, cat) {
    const tooltip = document.getElementById('galaxy-tooltip');
    const nameEl  = document.getElementById('galaxy-tooltip-name');
    const catEl   = document.getElementById('galaxy-tooltip-cat');
    if (tooltip && nameEl && catEl) {
        nameEl.textContent = name;
        catEl.textContent  = cat;
        tooltip.classList.remove('hidden');
    }
}

function _hideTooltip() {
    const tooltip = document.getElementById('galaxy-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
}

// ── Обработка кликов ────────────────────────────────────────────────────────

function _onMapClick() {
    if (!_hoveredObj) return;

    if (_hoveredObj.userData?.type === 'nebula-hitbox') {
        // Фокусировка на туманность
        const clusterId = _hoveredObj.userData.clusterId;
        const meta      = CLUSTER_META[clusterId];
        if (!meta) return;

        _cameraState    = 'focused';
        _focusedCluster = clusterId;
        _targetDest.set(meta.position.x, meta.position.y, meta.position.z);
        _spherical.radius = 30;
        _updateZoomUI();
        _showBackButton(true);

        // Строим планеты
        _buildPlanetsForCluster(clusterId);

        // Показываем панель
        _showNebulaPanel(clusterId);
    } else if (_hoveredObj.userData?.type === 'planet') {
        // Переход на планету
        const planetId = _hoveredObj.userData.planetId;
        window._galaxyMap.openPlanet(planetId);
    }
}

// ── Панель информации о туманности ──────────────────────────────────────────

function _showNebulaPanel(clusterId) {
    const meta  = CLUSTER_META[clusterId];
    const panel = document.getElementById('nebula-info-panel');
    if (!panel || !meta) return;

    document.getElementById('nebula-info-icon').textContent = meta.icon;
    document.getElementById('nebula-info-name').textContent = meta.label;

    const cluster = _clusters.find(c => c.name === clusterId);
    document.getElementById('nebula-info-desc').textContent = cluster?.description ?? '';

    const store          = getStore();
    const playerCrystals = store.player?.crystals?.[clusterId] ?? 0;
    const planetCount    = _allPlanets.filter(p => p.clusterId === clusterId).length;

    document.getElementById('nebula-info-crystal').textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;
    document.getElementById('nebula-info-planets').textContent = `🪐 Планет: ${planetCount}`;

    // Рендерим сетку планет
    _renderPlanetGrid(clusterId);

    panel.classList.remove('hidden');
}

function _hideNebulaPanel() {
    const panel = document.getElementById('nebula-info-panel');
    if (panel) panel.classList.add('hidden');
}

function _renderPlanetGrid(clusterId) {
    const grid = document.getElementById('nebula-planet-grid');
    if (!grid) return;

    const planets = _allPlanets.filter(p => p.clusterId === clusterId);
    const meta    = CLUSTER_META[clusterId];

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

function _showBackButton(show) {
    const btn = document.getElementById('btn-galaxy-back');
    if (btn) btn.classList.toggle('hidden', !show);
}

// ── Обработка ввода ─────────────────────────────────────────────────────────

function _onMapMouseDown(e) {
    if (e.button === 2) {
        _isRightMouseDown = true;
        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }
}

function _onMapMouseUp(e) {
    if (e.button === 2 || e.type === 'mouseleave') {
        _isRightMouseDown = false;
    }
}

function _onMapMouseMove(e) {
    if (_isRightMouseDown) {
        const deltaX = e.clientX - _lastInteractX;
        const deltaY = e.clientY - _lastInteractY;
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi   -= deltaY * 0.005;
        _spherical.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));
        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }

    const rect = _mapRenderer.domElement.getBoundingClientRect();
    _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    // Тултип следует за мышью
    const tooltip = document.getElementById('galaxy-tooltip');
    if (tooltip && !tooltip.classList.contains('hidden')) {
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top  = `${e.clientY - rect.top  - 10}px`;
    }
}

function _onMapWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.05;
    _spherical.radius += Math.sign(e.deltaY) * zoomSpeed * _spherical.radius;
    const minR = _cameraState === 'focused' ? 12 : 40;
    const maxR = _cameraState === 'focused' ? 80 : 200;
    _spherical.radius = Math.max(minR, Math.min(maxR, _spherical.radius));
    _updateZoomUI();
}

function _updateZoomUI() {
    const el = document.getElementById('galaxy-zoom-percent');
    if (el) {
        const maxR = _cameraState === 'focused' ? 80 : 200;
        const minR = _cameraState === 'focused' ? 12 : 40;
        const pct  = Math.round(((maxR - _spherical.radius) / (maxR - minR)) * 100);
        el.textContent = `${pct}%`;
    }
}

function _onMapTouchStart(e) {
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
        _mouse.x =  ((t.clientX - rect.left) / rect.width)  * 2 - 1;
        _mouse.y = -((t.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}

function _onMapTouchMove(e) {
    if (e.touches.length === 1 || e.touches.length === 2) e.preventDefault();

    if (_isTouchDown && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - _lastInteractX;
        const deltaY = e.touches[0].clientY - _lastInteractY;
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi   -= deltaY * 0.005;
        _spherical.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));
        _lastInteractX = e.touches[0].clientX;
        _lastInteractY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
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
        const t    = e.touches[0];
        _mouse.x =  ((t.clientX - rect.left) / rect.width)  * 2 - 1;
        _mouse.y = -((t.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}

function _onMapTouchEnd(e) {
    if (e.touches.length === 0) {
        // Tap = click
        if (_isTouchDown) _onMapClick();
        _isTouchDown = false;
    }
}

function _onMapResize() {
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

function _cleanup3D() {
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
        _mapRenderer.dispose();
        _mapRenderer = null;
    }

    _clearPlanetMeshes();
    _mapScene      = null;
    _mapCamera     = null;
    _nebulaMeshes  = {};
    _hoveredObj    = null;
    _isRightMouseDown = false;
    _isTouchDown   = false;
}

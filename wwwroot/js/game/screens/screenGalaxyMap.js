/**
 * screenGalaxyMap.js — Звёздная карта с 3D-визуализацией планет
 *
 * Два режима просмотра:
 *   - 3D:   интерактивная звёздная карта. Планеты — сферы в пространстве.
 *            Hover → тултип с названием, клик → переход на Planet Detail.
 *   - List: Grid-карточки (как было, с фильтрами).
 *
 * Three.js объекты рендерятся в отдельный canvas внутри #galaxy-3d-canvas-wrap
 * (не общий game-canvas), чтобы иметь независимый viewport и не мешать фоновому
 * starfield.
 */

import { getStore, dispatch, transition, Screen } from '../stateManager.js';
import { switchScene } from '../threeScene.js';

// ── Цветовая схема направлений ──────────────────────────────────────────────

const DIR_META = {
    technology:   { label: '💻 IT / Технологии', color: 0x4fc3f7 },
    medicine:     { label: '⚕ Медицина',         color: 0xf87171 },
    biotech:      { label: '🧬 Биотех',           color: 0x4ade80 },
    ecology:      { label: '🌿 Экология',         color: 0x34d399 },
    design:       { label: '🎨 Дизайн',           color: 0xf472b6 },
    neuroscience: { label: '🧠 Нейронауки',       color: 0xc084fc },
    physics:      { label: '⚛ Физика',            color: 0xa78bfa },
    mathematics:  { label: '📐 Математика',        color: 0xfbbf24 },
};

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _allPlanets   = [];
let _discoveredIds = new Set();
let _view         = '3d';   // '3d' | 'list'

// Three.js 3D-карта
let _mapRenderer  = null;
let _mapScene     = null;
let _mapCamera    = null;
let _mapAnimId    = null;
let _raycaster    = null;
let _mouse        = null;
let _planetMeshes = [];
let _hoveredPlanet = null;
let _selectedPlanet = null;
let _isRightMouseDown = false;
let _isTouchDown = false;
let _lastInteractX = 0;
let _lastInteractY = 0;
let _spherical = { radius: 67, theta: 0, phi: 1.1 };
let _targetCenter = null;
let _targetDest = null;
let _lastPinchDist = 0;

// ── Глобальный API для HTML-onclick ─────────────────────────────────────────

window._galaxyMap = {
    applyFilter() {
        const cat    = document.getElementById('filter-category')?.value ?? '';
        const status = document.getElementById('filter-status')?.value ?? '';
        _renderListView(_allPlanets, cat, status);
    },
    openScan() {
        transition(Screen.NEBULA_SCAN);
    },
    selectPlanet(planetId) {
        transition(Screen.PLANET_DETAIL, { planetId });
    },
    setView(v) {
        _view = v;
        _updateViewTabs();
    },
    resetCamera() {
        if (!_targetDest) return;
        _targetDest.set(0, 0, 0);
        _spherical.radius = 67;
        _spherical.theta = 0;
        _spherical.phi = 1.1;
        _selectedPlanet = null;
        _updateZoomUI();
        _hideSelectedPanel();
    },
    openSelectedPlanet() {
        if (_selectedPlanet && _selectedPlanet.userData.discovered) {
            transition(Screen.PLANET_DETAIL, { planetId: _selectedPlanet.userData.planetId });
        }
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store) {
    // Фоновая 3D-сцена
    await switchScene('galaxy-map');

    _allPlanets    = store.sessionData?.catalog ?? [];
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);

    // Если каталог пуст — загружаем с сервера
    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/game?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json();
        } catch { /* офлайн */ }
    }

    // Список-вид
    _renderListView(_allPlanets, '', '');
    _updateStats();

    // Инициализация 3D-карты
    _init3DMap();

    // По умолчанию — 3D вид
    _view = '3d';
    _updateViewTabs();
}

export function destroy() {
    _cleanup3D();
}

// ── Переключение табов ──────────────────────────────────────────────────────

function _updateViewTabs() {
    const tab3d   = document.getElementById('tab-3d');
    const tabList = document.getElementById('tab-list');
    const cont3d  = document.getElementById('galaxy-3d-container');
    const contList = document.getElementById('galaxy-list-container');

    if (tab3d)   tab3d.classList.toggle('galaxy-tab--active', _view === '3d');
    if (tabList) tabList.classList.toggle('galaxy-tab--active', _view === 'list');
    if (cont3d)  cont3d.classList.toggle('hidden', _view !== '3d');
    if (contList) contList.classList.toggle('hidden', _view !== 'list');
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

    // Рендерер (отдельный от game-canvas)
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
    // Начальная позиция задаётся через сферические координаты в loop, 
    // но можно оставить set для подстраховки:
    _mapCamera.position.set(0, 30, 60);
    _mapCamera.lookAt(0, 0, 0);

    // Освещение
    _mapScene.add(new THREE.AmbientLight(0x334155, 0.7));
    const dirL = new THREE.DirectionalLight(0x4fc3f7, 0.8);
    dirL.position.set(20, 40, 30);
    _mapScene.add(dirL);

    // Звёздный фон
    _addMapStars(THREE);

    // Планеты — сферы
    _buildPlanetSpheres(THREE);

    _targetCenter = new THREE.Vector3(0, 0, 0);
    _targetDest = new THREE.Vector3(0, 0, 0);

    // Raycaster для hover/клик
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

    // ResizeObserver
    _mapResizeObs = new ResizeObserver(() => _onMapResize());
    _mapResizeObs.observe(wrap);

    // Запуск render loop
    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

let _mapResizeObs = null;

function _addMapStars(THREE) {
    const geo = new THREE.BufferGeometry();
    const n = 1200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 400;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.7 });
    _mapScene.add(new THREE.Points(geo, mat));
}

function _buildPlanetSpheres(THREE) {
    _planetMeshes = [];

    _allPlanets.forEach((planet, i) => {
        const discovered   = _discoveredIds.has(planet.id) || planet.isStarterVisible;
        const dirMeta      = DIR_META[planet.category] ?? { color: 0x888888 };
        const baseColor    = new THREE.Color(dirMeta.color);

        // Размер: 1.0..2.0 в зависимости от количества требований
        const reqCount = Object.values(planet.crystalRequirements ?? {}).reduce((a, b) => a + b, 0);
        const radius   = 0.8 + Math.min(reqCount, 10) * 0.12;

        const geo = new THREE.SphereGeometry(radius, 24, 18);
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

        // Расположение на орбитальных кольцах
        const ringIndex = Math.floor(i / 6);      // кольцо
        const posOnRing = i % 6;                    // позиция на кольце
        const ringR     = 12 + ringIndex * 10;      // радиус кольца
        const angle     = (posOnRing / 6) * Math.PI * 2 + ringIndex * 0.5;
        const ySpread   = (Math.random() - 0.5) * 6;

        mesh.position.set(
            Math.cos(angle) * ringR,
            ySpread,
            Math.sin(angle) * ringR
        );

        mesh.userData = { planetId: planet.id, planetName: planet.name, category: planet.category, discovered };

        // Кольцо вокруг планеты (если открыта)
        if (discovered) {
            const ringGeo = new THREE.RingGeometry(radius + 0.3, radius + 0.45, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: dirMeta.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.2,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            mesh.add(ring);
        }

        _mapScene.add(mesh);
        _planetMeshes.push(mesh);
    });

    // Орбитальные линии (для визуальной ориентации)
    const maxRings = Math.ceil(_allPlanets.length / 6);
    for (let r = 0; r < maxRings; r++) {
        const ringR = 12 + r * 10;
        const ringGeo = new THREE.RingGeometry(ringR - 0.05, ringR + 0.05, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x4fc3f7,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.06,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        _mapScene.add(ring);
    }

    // Центральная «звезда» — логический центр галактики
    const starGeo = new THREE.SphereGeometry(2, 32, 24);
    const starMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xfbbf24,
        emissiveIntensity: 1.0,
        roughness: 0.1,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    _mapScene.add(star);

    // Точечный свет от центральной звезды
    const starLight = new THREE.PointLight(0xfbbf24, 1.5, 150);
    _mapScene.add(starLight);
}

// ── Render loop ─────────────────────────────────────────────────────────────

function _mapRenderLoop() {
    if (!_mapRenderer || !_mapScene || !_mapCamera) return;

    if (_targetDest && _targetCenter) {
        _targetCenter.lerp(_targetDest, 0.05);

        _mapCamera.position.x = _targetCenter.x + _spherical.radius * Math.sin(_spherical.phi) * Math.sin(_spherical.theta);
        _mapCamera.position.y = _targetCenter.y + _spherical.radius * Math.cos(_spherical.phi);
        _mapCamera.position.z = _targetCenter.z + _spherical.radius * Math.sin(_spherical.phi) * Math.cos(_spherical.theta);
        
        _mapCamera.lookAt(_targetCenter);
    }

    // Вращение планет вокруг своей оси
    _planetMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005;
    });

    // Raycasting для hover
    _raycaster.setFromCamera(_mouse, _mapCamera);
    const intersects = _raycaster.intersectObjects(_planetMeshes, false);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (_hoveredPlanet !== hit) {
            // Снимаем выделение с предыдущей
            _unhoverPlanet();
            _hoveredPlanet = hit;
            _hoverPlanet(hit);
        }
    } else {
        _unhoverPlanet();
    }

    _mapRenderer.render(_mapScene, _mapCamera);
    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

function _hoverPlanet(mesh) {
    const THREE = window.THREE;
    if (!THREE) return;

    // Увеличиваем планету
    mesh.scale.setScalar(1.3);

    // Усиливаем свечение
    if (mesh.material) {
        mesh.material.emissiveIntensity = 0.8;
    }

    // Тултип
    const tooltip = document.getElementById('galaxy-tooltip');
    const nameEl  = document.getElementById('galaxy-tooltip-name');
    const catEl   = document.getElementById('galaxy-tooltip-cat');
    if (tooltip && nameEl && catEl) {
        nameEl.textContent = mesh.userData.planetName;
        const meta = DIR_META[mesh.userData.category];
        catEl.textContent = meta?.label ?? mesh.userData.category;
        tooltip.classList.remove('hidden');
    }

    // Стиль курсора
    if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'pointer';
}

function _unhoverPlanet() {
    if (!_hoveredPlanet) return;
    _hoveredPlanet.scale.setScalar(1.0);
    if (_hoveredPlanet.material) {
        const discovered = _hoveredPlanet.userData.discovered;
        _hoveredPlanet.material.emissiveIntensity = discovered ? 0.35 : 0.05;
    }
    _hoveredPlanet = null;

    const tooltip = document.getElementById('galaxy-tooltip');
    if (tooltip) tooltip.classList.add('hidden');

    if (_mapRenderer) _mapRenderer.domElement.style.cursor = 'default';
}

// ── Обработка ввода ─────────────────────────────────────────────────────────

function _onContextMenu(e) {
    e.preventDefault();
}

function _onMapMouseDown(e) {
    if (e.button === 2) { // Правая кнопка
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
        _spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));

        _lastInteractX = e.clientX;
        _lastInteractY = e.clientY;
    }

    const rect = _mapRenderer.domElement.getBoundingClientRect();
    _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    // Расположение тултипа
    const tooltip = document.getElementById('galaxy-tooltip');
    if (tooltip && !tooltip.classList.contains('hidden')) {
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top  = `${e.clientY - rect.top  - 10}px`;
    }
}

function _onMapClick() {
    if (_hoveredPlanet && _hoveredPlanet.userData.discovered) {
        _selectedPlanet = _hoveredPlanet;
        _targetDest.copy(_selectedPlanet.position);
        _showSelectedPanel(_selectedPlanet);
    } else {
        window._galaxyMap?.resetCamera();
    }
}

function _onMapWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.05;
    _spherical.radius += Math.sign(e.deltaY) * zoomSpeed * _spherical.radius;
    // zoom: 15 to 150
    _spherical.radius = Math.max(15, Math.min(150, _spherical.radius));
    _updateZoomUI();
}

function _updateZoomUI() {
    const el = document.getElementById('galaxy-zoom-percent');
    if (el) {
        const pct = Math.round(((150 - _spherical.radius) / 135) * 100);
        el.textContent = `${pct}%`;
    }
}

function _showSelectedPanel(mesh) {
    const panel = document.getElementById('galaxy-selected-panel');
    const title = document.getElementById('galaxy-selected-title');
    if (panel && title) {
        title.textContent = mesh.userData.planetName;
        panel.classList.remove('hidden');
    }
}

function _hideSelectedPanel() {
    const panel = document.getElementById('galaxy-selected-panel');
    if (panel) panel.classList.add('hidden');
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
        _lastPinchDist = Math.sqrt(dx*dx + dy*dy);
    }
    const rect = _mapRenderer.domElement.getBoundingClientRect();
    const t = e.touches[0];
    _mouse.x =  ((t.clientX - rect.left) / rect.width)  * 2 - 1;
    _mouse.y = -((t.clientY - rect.top)  / rect.height) * 2 + 1;
}

function _onMapTouchMove(e) {
    if (e.touches.length === 1 || e.touches.length === 2) e.preventDefault(); // Предотвращаем скролл

    if (_isTouchDown && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - _lastInteractX;
        const deltaY = e.touches[0].clientY - _lastInteractY;
        
        _spherical.theta -= deltaX * 0.005;
        _spherical.phi   -= deltaY * 0.005;
        _spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, _spherical.phi));

        _lastInteractX = e.touches[0].clientX;
        _lastInteractY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const delta = _lastPinchDist - dist;
        _spherical.radius += delta * 0.2;
        _spherical.radius = Math.max(15, Math.min(150, _spherical.radius));
        _updateZoomUI();
        _lastPinchDist = dist;
    }

    const rect = _mapRenderer.domElement.getBoundingClientRect();
    const t = e.touches[0];
    _mouse.x =  ((t.clientX - rect.left) / rect.width)  * 2 - 1;
    _mouse.y = -((t.clientY - rect.top)  / rect.height) * 2 + 1;
}

function _onMapTouchEnd(e) {
    if (e.touches.length === 0) {
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
        canvas.removeEventListener('contextmenu', _onContextMenu);
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

    _mapScene     = null;
    _mapCamera    = null;
    _planetMeshes = [];
    _hoveredPlanet = null;
    _selectedPlanet = null;
    _isRightMouseDown = false;
    _isTouchDown = false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LIST VIEW (существующая логика, улучшенная)
// ═══════════════════════════════════════════════════════════════════════════

function _renderListView(planets, catFilter, statusFilter) {
    const grid = document.getElementById('planet-grid');
    if (!grid) return;

    const filtered = planets.filter(p => {
        if (catFilter    && p.category !== catFilter)                    return false;
        if (statusFilter === 'discovered' && !_discoveredIds.has(p.id)) return false;
        if (statusFilter === 'hidden'     &&  _discoveredIds.has(p.id)) return false;
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);padding:3rem;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">🌌</div>
            <p>По выбранным фильтрам планет не найдено.</p></div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => _planetCard(p)).join('');
}

function _planetCard(planet) {
    const discovered = _discoveredIds.has(planet.id) || planet.isStarterVisible;
    const dirMeta    = DIR_META[planet.category] ?? { label: planet.category, color: 0x888888 };
    const borderColor = discovered ? `#${dirMeta.color.toString(16).padStart(6, '0')}` : 'var(--color-border)';

    const crystalBadges = discovered
        ? Object.entries(planet.crystalRequirements ?? {})
            .map(([dir, n]) => `<span class="crystal-badge">${(DIR_META[dir]?.label ?? dir).split(' ')[0]} ×${n}</span>`)
            .join('')
        : '';

    return `
        <div class="planet-list-card ${discovered ? 'planet-list-card--discovered' : 'planet-list-card--hidden'}"
             style="--card-accent:${borderColor};"
             onclick="${discovered ? `window._galaxyMap?.selectPlanet('${planet.id}')` : ''}">
            ${discovered ? '' : '<div class="planet-card-fog">🌫</div>'}
            <p class="planet-card-category">${dirMeta.label}</p>
            <h3 class="planet-card-name">${discovered ? planet.name : '???'}</h3>
            <p class="planet-card-desc">${discovered ? planet.description : 'Планета ещё не обнаружена. Сканируйте туманность!'}</p>
            <div class="planet-card-badges">${crystalBadges}</div>
        </div>`;
}

function _updateStats() {
    const total = _allPlanets.length;
    const disc  = _allPlanets.filter(p => _discoveredIds.has(p.id) || p.isStarterVisible).length;
    const elD = document.getElementById('stat-discovered');
    const elT = document.getElementById('stat-total');
    if (elD) elD.textContent = `📍 Открыто: ${disc}`;
    if (elT) elT.textContent = `🌐 Всего: ${total}`;
}

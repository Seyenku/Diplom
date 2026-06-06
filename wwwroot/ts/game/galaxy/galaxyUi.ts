/**
 * galaxyUi.ts — Управление DOM-элементами интерфейса карты галактики
 */

import { ClusterType, PlanetDto, PlayerState } from '../types.js';
import { CLUSTER_META } from '../clusterConfig.js';
import { getDevice } from '../deviceProfile.js';

// ── Nebula panel state (drag-to-resize) ────────────────────────────────────
//
//   --nebula-offset: 0 → панель полностью открыта; 1 → полностью спрятана.
//   Управляется драгом за handle: на mobile-portrait — вверх/вниз,
//   на mobile-landscape — влево/вправо.
//   Snap происходит только при подходе к краю (порог 0.05 / 0.85);
//   в средней зоне drawer остаётся на любом проценте без жёсткой фиксации.
//
// ──────────────────────────────────────────────────────────────────────────

export type NebulaPanelState = 'collapsed' | 'peek' | 'full';

const _SNAP_OPEN_THRESHOLD  = 0.10; // < 10% → snap to fully open
const _SNAP_CLOSE_THRESHOLD = 0.85; // > 85% → snap to fully closed
const _TAP_MAX_PX           = 6;    // суммарное движение, чтобы считаться тапом

/** Срабатывает ли сейчас layout side-drawer (landscape mobile). */
function _isSideDrawerLayout(): boolean {
    return window.matchMedia(
        '(orientation: landscape) and (max-height: 540px), (orientation: landscape) and (max-width: 900px)'
    ).matches;
}

function _isBottomSheetLayout(): boolean {
    return window.matchMedia('(max-width: 720px) and (orientation: portrait)').matches;
}

function _isMobileDrawerLayout(): boolean {
    return _isSideDrawerLayout() || _isBottomSheetLayout();
}

/** Применяет offset (0..1) к панели через CSS-variable. */
function _setOffset(offset: number): void {
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return;
    const clamped = Math.max(0, Math.min(1, offset));
    panel.style.setProperty('--nebula-offset', String(clamped));

    const fullyClosed = clamped >= 0.99;
    panel.classList.toggle('nebula-fully-closed', fullyClosed);

    // Backdrop виден только когда панель открыта хотя бы наполовину на мобиле
    const backdrop = document.getElementById('nebula-backdrop');
    if (backdrop) {
        const showBackdrop = _isMobileDrawerLayout() && clamped < 0.5;
        backdrop.classList.toggle('visible', showBackdrop);
        backdrop.classList.toggle('hidden', !showBackdrop);
    }

    // FAB-стек виден только когда панель полностью спрятана
    const fabStack = document.getElementById('nebula-fab-stack');
    if (fabStack) {
        const showFabs = _isMobileDrawerLayout() && fullyClosed;
        fabStack.classList.toggle('nebula-fab-stack--show', showFabs);
        fabStack.classList.toggle('hidden', !showFabs);
    }
}

function _getOffset(): number {
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return 0;
    const raw = panel.style.getPropertyValue('--nebula-offset').trim();
    return raw === '' ? 0 : Math.max(0, Math.min(1, parseFloat(raw)));
}

/** Совместимый API: ставит «полное» (offset=0), «свёрнутое» (offset=1)
 *  или «peek» (offset≈0.6 в portrait). Используется при первом открытии
 *  туманности и кнопками expand/collapse. */
export function setNebulaState(state: NebulaPanelState): void {
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return;
    panel.dataset.state = state;

    if (!_isMobileDrawerLayout()) {
        // На desktop offset не используется (панель в углу)
        _setOffset(0);
        return;
    }

    if (state === 'collapsed') _setOffset(1);
    else if (state === 'peek') _setOffset(_isSideDrawerLayout() ? 0 : 0.55);
    else                       _setOffset(0);
}

// ── Desktop collapse (узкая «вкладка» у левого края) ─────────────────────
const _COLLAPSE_STORAGE_KEY = 'stellar_vocation_nebula_collapsed';

/** Программно ставит свёрнутое/развёрнутое состояние и сохраняет в localStorage. */
export function setNebulaCollapsed(collapsed: boolean): void {
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return;
    panel.dataset.collapsed = collapsed ? 'true' : 'false';
    try { localStorage.setItem(_COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }

    // a11y: меняем aria-label на тоггле, чтобы скринридер озвучивал состояние.
    const toggle = document.getElementById('nebula-collapse-toggle');
    if (toggle) {
        toggle.setAttribute('aria-label',
            collapsed ? 'Развернуть панель туманности' : 'Свернуть панель туманности');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
}

/** Тоггл по нажатию на chevron. Вызывается из window._galaxyMap (см. galaxyScreen). */
export function toggleNebulaCollapsed(): void {
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return;
    setNebulaCollapsed(panel.dataset.collapsed !== 'true');
}

/** Восстанавливает состояние из localStorage при показе панели. */
function _restoreCollapseFromStorage(): void {
    try {
        const stored = localStorage.getItem(_COLLAPSE_STORAGE_KEY);
        setNebulaCollapsed(stored === '1');
    } catch {
        setNebulaCollapsed(false);
    }
}

/** Циклическое переключение по тапу на handle (если drag не было).
 *  Toggle между fully-open и fully-closed. */
export function cycleNebulaState(): void {
    if (!_isMobileDrawerLayout()) return;
    const offset = _getOffset();
    // Если уже близко к закрытию — открываем; иначе закрываем
    if (offset >= 0.5) setNebulaState('full');
    else               setNebulaState('collapsed');
}

// ── Drag handler ──────────────────────────────────────────────────────────

interface DragState {
    pointerId: number;
    startPos: number;     // координата pointerdown (x для landscape, y для portrait)
    startOffset: number;  // offset на момент pointerdown
    accumPx: number;      // сколько суммарно прошёл
    isPortrait: boolean;  // direction: portrait = Y, landscape = X
    extent: number;       // длина оси (height для portrait, width для landscape)
}

let _drag: DragState | null = null;

function _initDragHandler(): void {
    const handle = document.getElementById('nebula-handle');
    if (!handle) return;
    // Защита от повторной инициализации
    if (handle.dataset.dragInit === '1') return;
    handle.dataset.dragInit = '1';

    handle.addEventListener('pointerdown', _onHandlePointerDown);
    handle.addEventListener('pointermove', _onHandlePointerMove);
    handle.addEventListener('pointerup',   _onHandlePointerUp);
    handle.addEventListener('pointercancel', _onHandlePointerCancel);
}

function _onHandlePointerDown(e: PointerEvent): void {
    if (!_isMobileDrawerLayout()) return;
    const panel = document.getElementById('nebula-info-panel');
    if (!panel) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const rect = panel.getBoundingClientRect();
    const isPortrait = _isBottomSheetLayout();
    _drag = {
        pointerId: e.pointerId,
        startPos: isPortrait ? e.clientY : e.clientX,
        startOffset: _getOffset(),
        accumPx: 0,
        isPortrait,
        extent: isPortrait ? rect.height : rect.width,
    };

    panel.classList.add('nebula-dragging');
}

function _onHandlePointerMove(e: PointerEvent): void {
    if (!_drag || e.pointerId !== _drag.pointerId) return;
    const cur = _drag.isPortrait ? e.clientY : e.clientX;
    const delta = cur - _drag.startPos;
    _drag.accumPx = Math.max(_drag.accumPx, Math.abs(delta));
    // delta положительная → пользователь тянет к краю (закрывает)
    const newOffset = _drag.startOffset + delta / _drag.extent;
    _setOffset(newOffset);
}

function _onHandlePointerUp(e: PointerEvent): void {
    if (!_drag || e.pointerId !== _drag.pointerId) return;
    const wasDrag = _drag.accumPx > _TAP_MAX_PX;
    _drag = null;

    const panel = document.getElementById('nebula-info-panel');
    panel?.classList.remove('nebula-dragging');

    if (!wasDrag) {
        // Короткий тап → toggle между fully open / closed
        cycleNebulaState();
        return;
    }

    // Snap-to-edge только если близко к границе; иначе оставляем как есть
    const offset = _getOffset();
    if (offset <= _SNAP_OPEN_THRESHOLD) setNebulaState('full');
    else if (offset >= _SNAP_CLOSE_THRESHOLD) setNebulaState('collapsed');
    // средняя зона — свободное положение, ничего не делаем
}

function _onHandlePointerCancel(e: PointerEvent): void {
    if (!_drag || e.pointerId !== _drag.pointerId) return;
    _drag = null;
    document.getElementById('nebula-info-panel')?.classList.remove('nebula-dragging');
}

export function showTooltip(name: string, cat: string): void {
    const tooltipEl = document.getElementById('galaxy-tooltip');
    const nameEl = document.getElementById('galaxy-tooltip-name');
    const catEl = document.getElementById('galaxy-tooltip-cat');
    
    if (tooltipEl && nameEl && catEl) {
        nameEl.textContent = name;
        catEl.textContent = cat;
        tooltipEl.classList.remove('hidden');
    }
}

export function hideTooltip(): void {
    const tooltipEl = document.getElementById('galaxy-tooltip');
    if (tooltipEl) tooltipEl.classList.add('hidden');
}

export function showBackButton(show: boolean): void {
    const btn = document.getElementById('nav-btn-back');
    if (btn) btn.classList.toggle('hidden', !show);
    _syncNavMapButton(show);
}

/**
 * На mobile подменяет кнопку «Карта» на «Назад» когда выбрана туманность.
 * На desktop ничего не меняет — `nav-btn-back` overlay показывается отдельно.
 */
function _syncNavMapButton(clusterFocused: boolean): void {
    const map     = document.getElementById('nav-btn-map');
    const mapBack = document.getElementById('nav-btn-map-back');
    if (!map || !mapBack) return;

    const isMobileLayout = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    const showBack = isMobileLayout && clusterFocused;

    map.classList.toggle('hidden', showBack);
    mapBack.classList.toggle('hidden', !showBack);

    // Скрываем overlay-back на mobile, чтобы не дублировал кнопку в navbar
    if (isMobileLayout) {
        const overlay = document.getElementById('nav-btn-back');
        overlay?.classList.add('hidden');
    }
}

/** Сбросить кнопку «Карта» (например, при выходе из galaxy-map). */
export function resetNavMapButton(): void {
    _syncNavMapButton(false);
}

export function showNebulaPanel(
    clusterId: ClusterType,
    clusterDesc: string,
    playerCrystals: number,
    planetCount: number,
    allPlanets: PlanetDto[],
    discoveredIds: Set<string>
): void {
    const meta = CLUSTER_META[clusterId];
    const panel = document.getElementById('nebula-info-panel');
    if (!panel || !meta) return;

    document.getElementById('nebula-info-icon')!.textContent = meta.icon;
    document.getElementById('nebula-info-name')!.textContent = meta.label;
    document.getElementById('nebula-info-desc')!.textContent = clusterDesc;
    document.getElementById('nebula-info-crystal')!.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;
    document.getElementById('nebula-info-planets')!.textContent = `🪐 Планет: ${planetCount}`;

    // Бейдж в свёрнутом виде показывает только число планет.
    const collapsedCount = document.getElementById('nebula-collapsed-count');
    if (collapsedCount) collapsedCount.textContent = String(planetCount);

    // FAB-счётчик показывает кол-во планет в текущей туманности
    const fabCount = document.getElementById('nebula-fab-count');
    const fabIcon  = document.getElementById('nebula-fab-icon');
    if (fabCount) fabCount.textContent = String(planetCount);
    if (fabIcon)  fabIcon.textContent  = meta.icon;

    renderPlanetGrid(clusterId, allPlanets, playerCrystals, discoveredIds);
    panel.classList.remove('hidden');

    // Drag-handler инициализируем один раз
    _initDragHandler();

    // Изначально открываем полностью (offset = 0)
    setNebulaState('full');

    // Восстанавливаем свёрнутое/развёрнутое состояние из localStorage —
    // только для desktop layout'а. На мобиле CSS перебивает data-collapsed,
    // так что атрибут безвреден.
    _restoreCollapseFromStorage();
}

export function hideNebulaPanel(): void {
    const panel = document.getElementById('nebula-info-panel');
    if (panel) {
        panel.classList.add('hidden');
        panel.classList.remove('nebula-fully-closed');
        panel.style.removeProperty('--nebula-offset');
    }
    const backdrop = document.getElementById('nebula-backdrop');
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('visible');
    }
    const fabStack = document.getElementById('nebula-fab-stack');
    if (fabStack) {
        fabStack.classList.add('hidden');
        fabStack.classList.remove('nebula-fab-stack--show');
    }
}

export function refreshNebulaPanel(
    clusterId: ClusterType,
    playerCrystals: number,
    allPlanets: PlanetDto[],
    discoveredIds: Set<string>
): void {
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const el = document.getElementById('nebula-info-crystal');
    if (el) el.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;

    renderPlanetGrid(clusterId, allPlanets, playerCrystals, discoveredIds);
}

export function renderPlanetGrid(
    clusterId: ClusterType,
    allPlanets: PlanetDto[],
    playerCrystals: number,
    discoveredIds: Set<string>
): void {
    const grid = document.getElementById('nebula-planet-grid');
    if (!grid) return;

    const planets = allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];

    grid.innerHTML = planets.map(p => {
        const discovered = discoveredIds.has(p.id) || p.isStarterVisible;
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

        // data-action вместо inline onclick — CSP блокирует unsafe-inline.
        return `<div class="nebula-planet-card ${stateClass}"
                     style="--accent:${meta.colorHex};"
                     data-action="galaxyMap.openPlanetFromList" data-arg="${p.id}">
            <span class="nebula-planet-name">${p.name}</span>
            <span class="nebula-planet-cost">${statusText}</span>
        </div>`;
    }).join('');
}

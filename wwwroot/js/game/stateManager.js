/**
 * stateManager.js — Centralized State Machine для Stellar Vocation SPA
 *
 * Слои архитектуры:
 *  store       — единый источник истины (не пишем напрямую, только через dispatch)
 *  dispatch    — мутация store через именованные actions
 *  transition  — смена экрана: fetch partial → init module → render
 *  ScreenModules — реестр модулей экранов (init/destroy)
 */

import { showSkeleton } from './skeletonLoader.js';

// ─── Константы состояний ────────────────────────────────────────────────────

export const Screen = Object.freeze({
    MAIN_MENU:        'main-menu',
    CHAR_CREATION:    'char-creation',
    ONBOARDING:       'onboarding',
    HUD:              'hud',
    PAUSE:            'pause',
    FLIGHT:           'flight',
    GALAXY_MAP:       'galaxy-map',

    PLANET_DETAIL:    'planet-detail',
    MINIGAME:         'minigame',
    SHIP_UPGRADE:     'ship-upgrade',
    VOCATION_CONST:   'vocation-constellation',
    ACHIEVEMENTS:     'achievements',
    SETTINGS:         'settings',
    GUIDE:            'guide',
    OFFLINE_ERROR:    'offline-error',
});

// ─── Структура store ────────────────────────────────────────────────────────

/** @type {GameStore} */
const _store = {
    currentScreen:  null,
    previousScreen: null,
    player: null,     // { name, avatarId, crystals: {it:0, bio:0,...}, shipStats: {...} }
    catalog: [],      // PlanetDto[] — загружен один раз при старте
    upgrades: [],     // UpgradeDto[]
    settings: null,   // GameSettingsDto
    sessionData: {},  // volatile: текущая планета, результат сканирования и др.
};

// ─── Ридонли доступ к store ─────────────────────────────────────────────────

export function getStore() {
    return Object.freeze({ ..._store });
}

// ─── Actions / dispatch ──────────────────────────────────────────────────────

/** @type {Map<string, Set<Function>>} */
const _handlers = new Map();

/** Регистрация обработчика action (поддерживает несколько на один action) */
export function on(action, handler) {
    if (!_handlers.has(action)) _handlers.set(action, new Set());
    _handlers.get(action).add(handler);
}

/** Мутация store через action */
export function dispatch(action, payload = {}) {
    const handlers = _handlers.get(action);
    if (handlers && handlers.size > 0) {
        handlers.forEach(h => { try { h(_store, payload); } catch (e) { console.error(e); } });
    } else if (!['SCREEN_CHANGED'].includes(action)) {
        console.warn(`[StateManager] No handlers for: "${action}"`);
    }
    _persistPlayer();
}

// Встроенные actions
on('SET_PLAYER',   (s, p) => { s.player = { ...s.player, ...p }; });
on('ADD_CRYSTALS', (s, { dir, amount }) => {
    if (!s.player) return;
    s.player.crystals[dir] = (s.player.crystals[dir] ?? 0) + amount;
});
on('SPEND_CRYSTALS', (s, { spent }) => {
    if (!s.player) return;
    for (const [dir, amt] of Object.entries(spent)) {
        s.player.crystals[dir] = Math.max(0, (s.player.crystals[dir] ?? 0) - amt);
    }
});
on('DISCOVER_PLANET', (s, { planetId }) => {
    s.player.discoveredPlanets ??= [];
    if (!s.player.discoveredPlanets.includes(planetId))
        s.player.discoveredPlanets.push(planetId);
});
on('APPLY_UPGRADE', (s, { upgradeId }) => {
    s.player.appliedUpgrades ??= [];
    if (!s.player.appliedUpgrades.includes(upgradeId))
        s.player.appliedUpgrades.push(upgradeId);
});
on('EARN_CRYSTALS', (s, { earned }) => {
    if (!s.player) return;
    s.player.crystals ??= {};
    for (const [dir, amt] of Object.entries(earned)) {
        s.player.crystals[dir] = (s.player.crystals[dir] ?? 0) + amt;
    }
    // Трекинг общего количества
    s.player.stats ??= {};
    s.player.stats.totalCrystalsEarned = (s.player.stats.totalCrystalsEarned ?? 0)
        + Object.values(earned).reduce((a, b) => a + b, 0);
});
on('SET_SESSION',    (s, p) => { Object.assign(s.sessionData, p); });
on('CLEAR_SESSION',  (s)    => { s.sessionData = {}; });
on('SET_SETTINGS',   (s, p) => { s.settings = { ...s.settings, ...p }; });
on('INCREMENT_STAT', (s, { key }) => {
    if (!s.player) return;
    s.player.stats ??= {};
    s.player.stats[key] = (s.player.stats[key] ?? 0) + 1;
});
on('ADD_BADGE', (s, { badge }) => {
    if (!s.player) return;
    s.player.badges ??= [];
    if (!s.player.badges.includes(badge)) s.player.badges.push(badge);
});

// Navbar: подсветка активного экрана
on('SCREEN_CHANGED', () => {
    const btns = document.querySelectorAll('.nav-btn[data-screen]');
    btns.forEach(btn => {
        const isActive = btn.dataset.screen === _store.currentScreen;
        btn.classList.toggle('nav-btn--active', isActive);
    });
});

// ─── Реестр модулей экранов ──────────────────────────────────────────────────

/** @type {Record<string, { init?: (store) => Promise<void>, destroy?: () => void }>} */
const ScreenModules = {};

/** Регистрация модуля экрана */
export function registerScreen(screenId, module) {
    ScreenModules[screenId] = module;
}

// ─── Переход между экранами ──────────────────────────────────────────────────

let _activeModule = null;

/**
 * Выполняет переход на новый экран.
 * @param {string} screenId — один из Screen.*
 * @param {object} payload  — произвольные данные для нового экрана (попадут в sessionData)
 */
export async function transition(screenId, payload = {}) {
    if (screenId === _store.currentScreen && Object.keys(payload).length === 0) return;

    // Уничтожаем текущий модуль
    try { _activeModule?.destroy?.(); } catch (e) { console.error(e); }
    _activeModule = null;

    // Анимация перехода
    const overlay = document.getElementById('screen-transition-overlay');
    overlay?.classList.add('fade-out');

    // Обновляем store
    _store.previousScreen = _store.currentScreen;
    _store.currentScreen  = screenId;
    if (Object.keys(payload).length) dispatch('SET_SESSION', payload);

    // Deep-link: обновляем URL-хэш
    history.pushState({ screen: screenId }, '', `#${screenId}`);

    try {
        // Показываем skeleton-плейсхолдер пока загружается Partial
        const container = document.getElementById('screen-dynamic-content');
        if (container) showSkeleton(container);

        // Получаем HTML экрана с сервера
        const html = await _fetchPartial(screenId);
        if (container) {
            container.innerHTML = html;
            container.classList.remove('screen-enter');
            // Force reflow для рестарта анимации
            void container.offsetWidth;
            container.classList.add('screen-enter');
            container.focus();
        }

        // HUD видим только во время игры
        _updateHudVisibility(screenId);

        // Инициализируем модуль экрана
        const mod = ScreenModules[screenId];
        if (mod) {
            _activeModule = mod;
            await mod.init?.(getStore());
        }

        // Уведомляем подписчиков о смене экрана
        dispatch('SCREEN_CHANGED', { screenId, previousScreen: _store.previousScreen });
    } catch (err) {
        console.error('[StateManager] transition error:', err);
        await _renderOfflineError(err);
    } finally {
        overlay?.classList.remove('fade-out');
    }
}

/** Возврат на предыдущий экран */
export function goBack() {
    const prev = _store.previousScreen;
    if (prev) transition(prev);
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

async function _fetchPartial(screenId) {
    const resp = await fetch(`/game?handler=Partial&screenId=${encodeURIComponent(screenId)}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!resp.ok) throw new Error(`Partial fetch failed: ${resp.status} for "${screenId}"`);
    return resp.text();
}

function _updateHudVisibility(screenId) {
    const hud = document.getElementById('hud-overlay');
    if (!hud) return;
    const showHud = screenId === Screen.HUD;
    hud.classList.toggle('hidden', !showHud);
}

async function _renderOfflineError(err) {
    const container = document.getElementById('screen-dynamic-content');
    if (container) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;padding:2rem;">
                <h2 class="game-title" style="color:#f87171;">Ошибка соединения</h2>
                <p style="color:var(--color-text-muted);text-align:center;">${err?.message ?? 'Неизвестная ошибка'}</p>
                <button class="btn-game btn-secondary" onclick="location.reload()">Попробовать снова</button>
            </div>`;
    }
}

// ─── Персистентность (localStorage) ─────────────────────────────────────────

const SAVE_KEY = 'stellar_vocation_save';

function _persistPlayer() {
    if (_store.player) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(_store.player));
        } catch { /* quota exceeded — игнорируем */ }
    }
}

export function loadSavedPlayer() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            _store.player = JSON.parse(raw);
            return true;
        }
    } catch { /* corrupted save */ }
    return false;
}

export function clearSave() {
    localStorage.removeItem(SAVE_KEY);
    _store.player = null;
}

// ─── History API (кнопка «Назад» браузера) ──────────────────────────────────

window.addEventListener('popstate', (e) => {
    const screenId = e.state?.screen ?? Screen.MAIN_MENU;
    // Переходим без pushState (уже сделан браузером)
    _store.previousScreen = _store.currentScreen;
    _store.currentScreen  = screenId;
    _fetchPartial(screenId).then(html => {
        const c = document.getElementById('screen-dynamic-content');
        if (c) { c.innerHTML = html; c.focus(); }
        ScreenModules[screenId]?.init?.(getStore()).then(() => {
            dispatch('SCREEN_CHANGED', { screenId, previousScreen: _store.previousScreen });
        });
    });
});

// ─── Автосейв ────────────────────────────────────────────────────────────────

const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000; // каждые 3 минуты
setInterval(_persistPlayer, AUTOSAVE_INTERVAL_MS);

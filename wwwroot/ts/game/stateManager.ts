/**
 * stateManager.ts — Centralized State Machine для Stellar Vocation SPA
 *
 * Слои архитектуры:
 *  store       — единый источник истины (не пишем напрямую, только через dispatch)
 *  dispatch    — мутация store через именованные actions
 *  transition  — смена экрана: fetch partial → init module → render
 *  ScreenModules — реестр модулей экранов (init/destroy)
 */

import { showSkeleton } from './skeletonLoader.js';
import {
    Screen, ScreenId,
    GameStore, ActionType, ActionPayload,
    ScreenModule, PlanetDto, UpgradeDto,
    GameSettingsDto, SessionData, PlayerState,
} from './types.js';

export { Screen, ScreenId };

// ─── Структура store ────────────────────────────────────────────────────────

const _store: GameStore = {
    currentScreen:  null,
    previousScreen: null,
    player: null,
    catalog: [],
    upgrades: [],
    settings: null,
    sessionData: {} as SessionData,
};

// ─── Readonly-доступ к store ─────────────────────────────────────────────────

export function getStore(): Readonly<GameStore> {
    return _store;
}

// ─── Actions / dispatch ──────────────────────────────────────────────────────

const _handlers = new Map<ActionType, Set<(store: GameStore, payload: unknown) => void>>();

/** Регистрация обработчика action */
export function on<T extends ActionType>(
    action: T,
    handler: (store: GameStore, payload: ActionPayload[T]) => void
): void {
    if (!_handlers.has(action)) _handlers.set(action, new Set());
    _handlers.get(action)!.add(handler as (store: GameStore, payload: unknown) => void);
}

/** Actions, при которых нужно сохранять player */
const _PLAYER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
    'SET_PLAYER', 'ADD_CRYSTALS', 'SPEND_CRYSTALS', 'EARN_CRYSTALS',
    'DISCOVER_PLANET', 'APPLY_UPGRADE', 'INCREMENT_STAT', 'ADD_BADGE',
]);

let _persistTimeout: ReturnType<typeof setTimeout> | null = null;

/** Мутация store через action */
export function dispatch<T extends ActionType>(action: T, payload: ActionPayload[T] = {} as ActionPayload[T]): void {
    const handlers = _handlers.get(action);
    if (handlers && handlers.size > 0) {
        handlers.forEach(h => {
            try { h(_store, payload); } catch (e) { console.error(e); }
        });
    } else if (action !== 'SCREEN_CHANGED') {
        console.warn(`[StateManager] No handlers for: "${action}"`);
    }
    // Debounced persist — только для player-мутирующих actions
    if (_PLAYER_ACTIONS.has(action)) {
        if (_persistTimeout) clearTimeout(_persistTimeout);
        _persistTimeout = setTimeout(_persistPlayer, 300);
    }
}

// Встроенные actions
on('SET_PLAYER', (s, p) => {
    s.player = { ...s.player, ...p } as PlayerState;
});

on('ADD_CRYSTALS', (s, { dir, amount }) => {
    if (!s.player) return;
    s.player.crystals[dir] = (s.player.crystals[dir] ?? 0) + amount;
});

on('SPEND_CRYSTALS', (s, { spent }) => {
    if (!s.player) return;
    for (const [dir, amt] of Object.entries(spent)) {
        s.player.crystals[dir as keyof typeof s.player.crystals] =
            Math.max(0, (s.player.crystals[dir as keyof typeof s.player.crystals] ?? 0) - (amt as number));
    }
});

on('DISCOVER_PLANET', (s, { planetId }) => {
    s.player!.discoveredPlanets ??= [];
    if (!s.player!.discoveredPlanets.includes(planetId))
        s.player!.discoveredPlanets.push(planetId);
});

on('APPLY_UPGRADE', (s, { upgradeId }) => {
    s.player!.appliedUpgrades ??= [];
    if (!s.player!.appliedUpgrades.includes(upgradeId))
        s.player!.appliedUpgrades.push(upgradeId);
});

on('EARN_CRYSTALS', (s, { earned }) => {
    if (!s.player) return;
    s.player.crystals ??= {} as typeof s.player.crystals;
    for (const [dir, amt] of Object.entries(earned)) {
        s.player.crystals[dir as keyof typeof s.player.crystals] =
            (s.player.crystals[dir as keyof typeof s.player.crystals] ?? 0) + (amt as number);
    }
    s.player.stats ??= {} as typeof s.player.stats;
    s.player.stats.totalCrystalsEarned = (s.player.stats.totalCrystalsEarned ?? 0)
        + Object.values(earned).reduce((a, b) => a + (b as number), 0);
});

on('SET_SESSION', (s, p) => {
    Object.assign(s.sessionData, p);
});

on('CLEAR_SESSION', (s) => {
    s.sessionData = {} as SessionData;
});

on('SET_SETTINGS', (s, p) => {
    s.settings = { ...s.settings, ...p } as GameSettingsDto;
});

on('INCREMENT_STAT', (s, { key }) => {
    if (!s.player) return;
    s.player.stats ??= {} as typeof s.player.stats;
    (s.player.stats as Record<string, number>)[key] =
        ((s.player.stats as Record<string, number>)[key] ?? 0) + 1;
});

on('ADD_BADGE', (s, { badge }) => {
    if (!s.player) return;
    s.player.badges ??= [];
    if (!s.player.badges.includes(badge)) s.player.badges.push(badge);
});

// Navbar: подсветка активного экрана
on('SCREEN_CHANGED', () => {
    const btns = document.querySelectorAll<HTMLElement>('.nav-btn[data-screen]');
    btns.forEach(btn => {
        const isActive = btn.dataset.screen === _store.currentScreen;
        btn.classList.toggle('nav-btn--active', isActive);
    });
});

// ─── Реестр модулей экранов ──────────────────────────────────────────────────

const ScreenModules: Record<string, ScreenModule> = {};

/** Регистрация модуля экрана */
export function registerScreen(screenId: ScreenId, module: ScreenModule): void {
    ScreenModules[screenId] = module;
}

// ─── Переход между экранами ──────────────────────────────────────────────────

let _activeModule: ScreenModule | null = null;

/**
 * Выполняет переход на новый экран.
 * @param screenId — один из Screen.*
 * @param payload  — произвольные данные для нового экрана (попадут в sessionData)
 */
export async function transition(screenId: ScreenId, payload: Partial<SessionData> = {}): Promise<void> {
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
    if (Object.keys(payload).length) dispatch('SET_SESSION', payload as ActionPayload['SET_SESSION']);

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
export function goBack(): void {
    const prev = _store.previousScreen;
    if (prev) transition(prev);
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

async function _fetchPartial(screenId: string): Promise<string> {
    const resp = await fetch(`/game?handler=Partial&screenId=${encodeURIComponent(screenId)}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!resp.ok) throw new Error(`Partial fetch failed: ${resp.status} for "${screenId}"`);
    return resp.text();
}

function _updateHudVisibility(screenId: ScreenId): void {
    const hud = document.getElementById('hud-overlay');
    if (!hud) return;
    const showHud = screenId === Screen.HUD;
    hud.classList.toggle('hidden', !showHud);
}

async function _renderOfflineError(err: unknown): Promise<void> {
    const container = document.getElementById('screen-dynamic-content');
    if (container) {
        const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;padding:2rem;">
                <h2 class="game-title" style="color:#f87171;">Ошибка соединения</h2>
                <p style="color:var(--color-text-muted);text-align:center;">${message}</p>
                <button class="btn-game btn-secondary" onclick="location.reload()">Попробовать снова</button>
            </div>`;
    }
}

// ─── Персистентность (localStorage) ─────────────────────────────────────────

const SAVE_KEY = 'stellar_vocation_save';

function _persistPlayer(): void {
    if (_store.player) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(_store.player));
        } catch { /* quota exceeded — игнорируем */ }
    }
}

export function loadSavedPlayer(): boolean {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            _store.player = JSON.parse(raw) as PlayerState;
            return true;
        }
    } catch { /* corrupted save */ }
    return false;
}

export function clearSave(): void {
    localStorage.removeItem(SAVE_KEY);
    _store.player = null;
}

// ─── History API (кнопка «Назад» браузера) ──────────────────────────────────

window.addEventListener('popstate', (e: PopStateEvent) => {
    const screenId: ScreenId = e.state?.screen ?? Screen.MAIN_MENU;
    // Переходим без pushState (уже сделан браузером)
    _store.previousScreen = _store.currentScreen;
    _store.currentScreen  = screenId;
    _fetchPartial(screenId).then(async html => {
        const c = document.getElementById('screen-dynamic-content');
        if (c) { c.innerHTML = html; c.focus(); }
        const mod = ScreenModules[screenId];
        if (mod?.init) {
            await mod.init(getStore());
        }
        dispatch('SCREEN_CHANGED', { screenId, previousScreen: _store.previousScreen });
    });
});

// ─── Автосейв через beforeunload (flush debounced persist) ──────────────────

window.addEventListener('beforeunload', () => {
    if (_persistTimeout) { clearTimeout(_persistTimeout); _persistTimeout = null; }
    _persistPlayer();
});

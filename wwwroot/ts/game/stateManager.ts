import { showSkeleton } from './skeletonLoader.js';
import {
    Screen, ScreenId,
    GameStore, ActionType, ActionPayload,
    ScreenModule, PlanetDto, UpgradeDto,
    GameSettingsDto, SessionData, PlayerState,
} from './types.js';
import { playSfx } from './audioManager.js';
import { switchScene as _switchThreeScene } from './threeScene.js';

export { Screen, ScreenId };

// в”Ђв”Ђв”Ђ РЎС‚СЂСѓРєС‚СѓСЂР° store в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const _store: GameStore = {
    currentScreen:  null,
    previousScreen: null,
    history: [],
    player: null,
    catalog: [],
    upgrades: [],
    settings: null,
    sessionData: {} as SessionData,
};

export function getStore(): Readonly<GameStore> {
    return _store;
}

const _handlers = new Map<ActionType, Set<(store: GameStore, payload: unknown) => void>>();

export function on<T extends ActionType>(
    action: T,
    handler: (store: GameStore, payload: ActionPayload[T]) => void
): void {
    if (!_handlers.has(action)) _handlers.set(action, new Set());
    _handlers.get(action)!.add(handler as (store: GameStore, payload: unknown) => void);
}

export function off<T extends ActionType>(
    action: T,
    handler: (store: GameStore, payload: ActionPayload[T]) => void
): void {
    const handlers = _handlers.get(action);
    if (handlers) handlers.delete(handler as (store: GameStore, payload: unknown) => void);
}

const _PLAYER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
    'SET_PLAYER', 'ADD_CRYSTALS', 'SPEND_CRYSTALS', 'EARN_CRYSTALS',
    'DISCOVER_PLANET', 'APPLY_UPGRADE', 'INCREMENT_STAT', 'ADD_BADGE',
]);

let _persistTimeout: ReturnType<typeof setTimeout> | null = null;

export function dispatch<T extends ActionType>(action: T, payload: ActionPayload[T] = {} as ActionPayload[T]): void {
    const handlers = _handlers.get(action);
    if (handlers && handlers.size > 0) {
        handlers.forEach(h => {
            try { h(_store, payload); } catch (e) { console.error(e); }
        });
    } else if (action !== 'SCREEN_CHANGED') {
        console.warn(`[StateManager] No handlers for: "${action}"`);
    }

    if (_PLAYER_ACTIONS.has(action)) {
        _schedulePersist();
    }
}

// requestIdleCallback с fallback на setTimeout. ric пишет в idle-окне браузера,
// не конкурируя с рендером игры.
type IdleId = number;
const _ric: (cb: () => void, options?: { timeout: number }) => IdleId =
    (typeof window !== 'undefined' && 'requestIdleCallback' in window)
        ? ((window as unknown as { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback.bind(window))
        : ((cb: () => void) => window.setTimeout(cb, 1) as unknown as IdleId);

function _schedulePersist(): void {
    if (_persistTimeout) clearTimeout(_persistTimeout);
    // 300ms debounce + idle-окно: между «всплеском» событий и фактической записью
    // в localStorage всегда проходит хотя бы один idle slot.
    _persistTimeout = setTimeout(() => {
        _persistTimeout = null;
        _ric(_persistPlayer, { timeout: 1000 });
    }, 300);
}

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
    if (!s.player!.appliedUpgrades.includes(upgradeId)) {
        s.player!.appliedUpgrades.push(upgradeId);
    }
    s.player!.shipStats = computeShipStats(s.player!.appliedUpgrades, s.sessionData?.upgrades ?? []);
});

const BASE_SHIP_STATS = { speedBonus: 0, shieldBonus: 0, scanRange: 1, capacity: 20 };

export function computeShipStats(
    appliedUpgrades: readonly string[],
    upgrades: readonly UpgradeDto[]
): { speedBonus: number; shieldBonus: number; scanRange: number; capacity: number } {
    const applied = new Set(appliedUpgrades);
    const stats = { ...BASE_SHIP_STATS };
    for (const u of upgrades) {
        if (!applied.has(u.id)) continue;
        const e = u.effect ?? {};
        stats.speedBonus  += e.speedBonus  ?? 0;
        stats.shieldBonus += e.shieldBonus ?? 0;
        stats.scanRange   += e.scanRange   ?? 0;
        stats.capacity    += e.capacity    ?? 0;
    }
    return stats;
}

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
    playSfx('crystal_collect');
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

const NAVBAR_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
    Screen.HUD, Screen.GALAXY_MAP, Screen.PLANET_DETAIL,
    Screen.SHIP_UPGRADE, Screen.ACHIEVEMENTS, Screen.SETTINGS,
    Screen.VOCATION_CONST,
]);

const SYS_MENU_HIDDEN_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
    Screen.MINIGAME_MEDICINE, Screen.MINIGAME_PROGRAMMING, Screen.MINIGAME_GEOLOGY,
    Screen.FLIGHT, Screen.CHAR_CREATION, Screen.ONBOARDING,
]);

// Экраны, чьи init() сами вызывают switchScene и владеют WebGL-сценой.
// Для остальных при переходе сцена сбрасывается на 'starfield'.
const WEBGL_OWNING_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
    Screen.MAIN_MENU, Screen.FLIGHT, Screen.GALAXY_MAP, Screen.PLANET_DETAIL,
]);

on('SCREEN_CHANGED', () => {
    const btns = document.querySelectorAll<HTMLElement>('.nav-btn[data-screen]');
    btns.forEach(btn => {
        const isActive = btn.dataset.screen === _store.currentScreen;
        btn.classList.toggle('nav-btn--active', isActive);
    });

    const gameNavbar = document.getElementById('game-navbar');
    const navbarVisible = !!_store.currentScreen && NAVBAR_SCREENS.has(_store.currentScreen);
    if (gameNavbar) gameNavbar.classList.toggle('hidden', !navbarVisible);
    document.body.classList.toggle('has-navbar', navbarVisible);

    // Динамическая высота navbar — учитывает UI scale, безопасные зоны и шрифт.
    if (navbarVisible) _syncNavbarOverlaySpace();

    // Кнопка «Назад» в навбаре актуальна только на карте галактики;
    // на остальных экранах принудительно прячем и возвращаем кнопку «Карта»
    if (_store.currentScreen !== Screen.GALAXY_MAP) {
        document.getElementById('nav-btn-back')?.classList.add('hidden');
        document.getElementById('nav-btn-map-back')?.classList.add('hidden');
        document.getElementById('nav-btn-map')?.classList.remove('hidden');
    }

    const sysMenu = document.getElementById('game-sys-menu');
    if (sysMenu && _store.currentScreen) {
        sysMenu.classList.toggle('hidden', SYS_MENU_HIDDEN_SCREENS.has(_store.currentScreen));
        // Сбрасываем раскрытое состояние при смене экрана
        sysMenu.dataset.collapsed = 'true';
        document.getElementById('btn-sys-toggle')?.setAttribute('aria-expanded', 'false');
    }

    // Звук перехода (кроме первой загрузки)
    if (_store.previousScreen) {
        playSfx('screen_transition');
    }
});

// ── Высота navbar → CSS variable ────────────────────────────────────────────
// Реальная высота navbar зависит от UI scale, safe-area-inset и контента.
// Устанавливаем --navbar-overlay-space как (top + height + buffer) в пикселях.

export function _syncNavbarOverlaySpace(): void {
    const navbar = document.getElementById('game-navbar');
    if (!navbar || navbar.classList.contains('hidden')) return;
    // offsetTop учитывает безопасные отступы и абсолютное позиционирование родителя.
    const top = navbar.offsetTop;
    const h   = navbar.offsetHeight;
    if (h <= 0) return;
    // Буфер 12px — небольшое визуальное «дыхание» между навбаром и заголовком.
    const space = top + h + 12;
    document.documentElement.style.setProperty('--navbar-overlay-space', `${space}px`);
}

let _navbarResizeObs: ResizeObserver | null = null;

function _setupNavbarObservers(): void {
    if (_navbarResizeObs) return;
    const navbar = document.getElementById('game-navbar');
    if (!navbar) return;
    _navbarResizeObs = new ResizeObserver(() => _syncNavbarOverlaySpace());
    _navbarResizeObs.observe(navbar);
    window.addEventListener('resize', _syncNavbarOverlaySpace);
}

// Подписки запускаем после DOM ready.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _setupNavbarObservers);
    } else {
        _setupNavbarObservers();
    }
}

/**
 * Регистрация экранов поддерживает два режима:
 *  - готовый ScreenModule (нужен сразу, eager-import)
 *  - loader-функция, возвращающая Promise<ScreenModule> (lazy, через dynamic import)
 * Результат загрузки кэшируется в _screenCache, чтобы повторных fetch'ей не было.
 */
type ScreenLoader = ScreenModule | (() => Promise<ScreenModule>);
const _screenLoaders: Record<string, ScreenLoader> = {};
const _screenCache: Record<string, ScreenModule> = {};

export function registerScreen(screenId: ScreenId, loader: ScreenLoader): void {
    _screenLoaders[screenId] = loader;
}

async function _resolveScreen(screenId: ScreenId): Promise<ScreenModule | undefined> {
    const cached = _screenCache[screenId];
    if (cached) return cached;
    const loader = _screenLoaders[screenId];
    if (!loader) return undefined;
    const mod = typeof loader === 'function' ? await loader() : loader;
    _screenCache[screenId] = mod;
    return mod;
}

let _activeModule: ScreenModule | null = null;

export async function transition(screenId: ScreenId, payload: Partial<SessionData> = {}, skipPushState = false, isBack = false): Promise<void> {
    if (screenId === _store.currentScreen && Object.keys(payload).length === 0) return;

    // Если переходим к настройкам без сохраненной сессии (нет игрока) -> перенаправляем на создание персонажа
    if (screenId === Screen.SETTINGS && !_store.player) {
        screenId = Screen.CHAR_CREATION;
    }

    // Уничтожаем текущий модуль
    try { _activeModule?.destroy?.(); } catch (e) { console.error(e); }
    _activeModule = null;

    // Анимация перехода
    const overlay = document.getElementById('screen-transition-overlay');
    overlay?.classList.add('fade-out');

    // Управление стеком истории
    if (!isBack && _store.currentScreen) {
        _store.history.push(_store.currentScreen);
    }

    // Корневые экраны сбрасывают стек
    if (screenId === Screen.MAIN_MENU || screenId === Screen.CHAR_CREATION) {
        _store.history = [];
    }

    _store.previousScreen = _store.currentScreen;
    _store.currentScreen = screenId;
    if (Object.keys(payload).length) dispatch('SET_SESSION', payload as ActionPayload['SET_SESSION']);

    if (!skipPushState) {
        history.pushState({ screen: screenId }, '', `#${screenId}`);
    }

    try {
        const container = document.getElementById('screen-dynamic-content');
        if (container) showSkeleton(container);

        const html = await _fetchPartial(screenId);
        if (container) {
            container.innerHTML = html;
            container.classList.remove('screen-enter');
            void container.offsetWidth;
            container.classList.add('screen-enter');
            container.focus();
        }

        // HUD видим только во время игры
        _updateHudVisibility(screenId);

        // Для DOM-экранов сбрасываем WebGL-фон на звёздное поле,
        // чтобы не оставался последний кадр предыдущей 3D-сцены (flight/galaxy/planet).
        // Экраны из WEBGL_OWNING_SCREENS вызывают switchScene самостоятельно в своих init().
        if (!WEBGL_OWNING_SCREENS.has(screenId)) {
            try { await _switchThreeScene('starfield'); } catch (e) { console.error(e); }
        }

        // Инициализируем модуль экрана (lazy-загрузка для редких экранов)
        const mod = await _resolveScreen(screenId);
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



export function goBack(): void {
    const prev = _store.history.pop();
    if (prev) transition(prev, {}, false, true);
}

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
        // Без inline onclick — data-action="reload" обрабатывается делегированным
        // listener'ом в main.ts (совместимо с CSP без 'unsafe-inline').
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;padding:2rem;">
                <h2 class="game-title" style="color:#f87171;">Error</h2>
                <p style="color:var(--color-text-muted);text-align:center;">${message}</p>
                <button class="btn-game btn-secondary" data-action="reload">Retry</button>
            </div>`;
    }
}

const SAVE_KEY = 'stellar_vocation_save';

// Поля, которые не сохраняем — они либо derived (восстанавливаются), либо
// относятся к session-state и в localStorage им не место.
const _DERIVED_FIELDS = new Set<string>(['shipStats']);

function _serializePlayer(player: PlayerState): string {
    // Один проход: копируем ключи, кроме derived. Дешевле, чем clone + delete.
    const src = player as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) {
        if (_DERIVED_FIELDS.has(key)) continue;
        out[key] = src[key];
    }
    return JSON.stringify(out);
}

function _persistPlayer(): void {
    if (!_store.player) return;
    try {
        localStorage.setItem(SAVE_KEY, _serializePlayer(_store.player));
    } catch { }
}
export function savePlayerNow(): boolean {
    if (_persistTimeout) {
        clearTimeout(_persistTimeout);
        _persistTimeout = null;
    }
    _persistPlayer();
    return _store.player !== null;
}

const SETTINGS_SAVE_KEY = 'stellar_vocation_settings';

export function saveSettingsNow(): void {
    if (_store.settings) {
        try {
            localStorage.setItem(SETTINGS_SAVE_KEY, JSON.stringify(_store.settings));
        } catch { }
    }
}

export function loadSavedSettings(): boolean {
    try {
        const raw = localStorage.getItem(SETTINGS_SAVE_KEY);
        if (raw) {
            _store.settings = JSON.parse(raw) as import('./types.js').GameSettingsDto;
            return true;
        }
    } catch { }
    return false;
}
export function loadSavedPlayer(): boolean {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            _store.player = JSON.parse(raw) as PlayerState;
            if (!_store.player.shipColor) {
                _store.player.shipColor = '#4fc3f7';
            }
            // Пересчитываем shipStats: миграция старых сохранений + защита от рассинхронизации
            _store.player.shipStats = computeShipStats(
                _store.player.appliedUpgrades ?? [],
                _store.sessionData?.upgrades ?? []
            );
            return true;
        }
    } catch { }
    return false;
}

export function clearSave(): void {
    localStorage.removeItem(SAVE_KEY);
    _store.player = null;
}

window.addEventListener('popstate', (e: PopStateEvent) => {
    const screenId: ScreenId = e.state?.screen ?? Screen.MAIN_MENU;
    transition(screenId, {}, true, true);
});

window.addEventListener('beforeunload', () => {
    if (_persistTimeout) { clearTimeout(_persistTimeout); _persistTimeout = null; }
    _persistPlayer();
});

// ── Custom In-Game Notifications (Toasts) ────────────────────────────────────

const _TOAST_ICONS: Record<'info' | 'success' | 'warning' | 'error', string> = {
    info:    'ℹ️',
    success: '✅',
    warning: '⚠️',
    error:   '🚨',
};

export function showNotification(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
): void {
    let container = document.getElementById('game-notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'game-notifications-container';
        document.getElementById('game-root')?.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `game-toast game-toast--${type}`;

    const icon = document.createElement('span');
    icon.className = 'game-toast__icon';
    icon.textContent = _TOAST_ICONS[type] ?? _TOAST_ICONS.info;

    const msg = document.createElement('span');
    msg.className = 'game-toast__msg';
    msg.textContent = message;

    toast.append(icon, msg);
    container.appendChild(toast);

    // Force reflow + класс-триггер для CSS-перехода
    void toast.offsetWidth;
    toast.classList.add('game-toast--visible');

    import('./audioManager.js').then(({ playSfx }) => {
        if (type === 'error' || type === 'warning') playSfx('ui_error');
        else if (type === 'success') playSfx('ui_success');
        else playSfx('ui_click');
    }).catch(() => {});

    setTimeout(() => {
        toast.classList.remove('game-toast--visible');
        toast.classList.add('game-toast--leaving');
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

(window as any).showNotification = showNotification;


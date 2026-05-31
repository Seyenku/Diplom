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
        if (_persistTimeout) clearTimeout(_persistTimeout);
        _persistTimeout = setTimeout(_persistPlayer, 300);
    }
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
    Screen.VOCATION_CONST, Screen.GUIDE,
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

    // Кнопка «Назад» в навбаре актуальна только на карте галактики;
    // на остальных экранах принудительно прячем
    if (_store.currentScreen !== Screen.GALAXY_MAP) {
        document.getElementById('nav-btn-back')?.classList.add('hidden');
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

const ScreenModules: Record<string, ScreenModule> = {};

export function registerScreen(screenId: ScreenId, module: ScreenModule): void {
    ScreenModules[screenId] = module;
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
        const message = err instanceof Error ? err.message : 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°';
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;padding:2rem;">
                <h2 class="game-title" style="color:#f87171;">Error</h2>
                <p style="color:var(--color-text-muted);text-align:center;">${message}</p>
                <button class="btn-game btn-secondary" onclick="location.reload()">Retry</button>
            </div>`;
    }
}

const SAVE_KEY = 'stellar_vocation_save';

function _persistPlayer(): void {
    if (_store.player) {
        try {
            const payload = JSON.stringify(_store.player);
            localStorage.setItem(SAVE_KEY, payload);
        } catch { }
    }
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

export function showNotification(
    message: string, 
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
): void {
    let container = document.getElementById('game-notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'game-notifications-container';
        container.style.cssText = `
            position: absolute;
            top: 5rem;
            right: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            z-index: 10000;
            pointer-events: none;
            width: min(340px, 90vw);
        `;
        document.getElementById('game-root')?.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'game-toast';
    
    const colors = {
        info: { bg: 'rgba(15, 23, 42, 0.95)', border: 'rgba(79, 195, 247, 0.4)', text: '#e2e8f0', icon: 'ℹ️', glow: 'rgba(79, 195, 247, 0.2)' },
        success: { bg: 'rgba(10, 30, 20, 0.95)', border: 'rgba(74, 222, 128, 0.4)', text: '#4ade80', icon: '✅', glow: 'rgba(74, 222, 128, 0.2)' },
        warning: { bg: 'rgba(30, 30, 10, 0.95)', border: 'rgba(250, 204, 21, 0.4)', text: '#facc15', icon: '⚠️', glow: 'rgba(250, 204, 21, 0.2)' },
        error: { bg: 'rgba(30, 10, 10, 0.95)', border: 'rgba(248, 113, 113, 0.4)', text: '#f87171', icon: '🚨', glow: 'rgba(248, 113, 113, 0.2)' }
    };
    const c = colors[type] || colors.info;

    toast.style.cssText = `
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1.2rem;
        background: ${c.bg};
        border: 1px solid ${c.border};
        border-radius: var(--radius-sm);
        color: ${c.text};
        font-family: var(--font-body);
        font-size: 0.9rem;
        box-shadow: 0 10px 24px rgba(0,0,0,0.4), 0 0 12px ${c.glow};
        backdrop-filter: blur(8px);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
        transition: opacity 250ms ease, transform 250ms ease;
    `;
    
    toast.innerHTML = `
        <span style="font-size: 1.1rem; line-height: 1;">${c.icon}</span>
        <span style="line-height: 1.35; white-space: pre-line;">${message}</span>
    `;

    container.appendChild(toast);

    void toast.offsetWidth;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';

    import('./audioManager.js').then(({ playSfx }) => {
        if (type === 'error' || type === 'warning') {
            playSfx('ui_error');
        } else if (type === 'success') {
            playSfx('ui_success');
        } else {
            playSfx('ui_click');
        }
    }).catch(() => {});

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.98)';
        setTimeout(() => {
            toast.remove();
        }, 250);
    }, 4000);
}

(window as any).showNotification = showNotification;


import { showSkeleton } from './skeletonLoader.js';
import {
    Screen, ScreenId,
    GameStore, ActionType, ActionPayload,
    ScreenModule, PlanetDto, UpgradeDto,
    GameSettingsDto, SessionData, PlayerState,
} from './types.js';

export { Screen, ScreenId };

// в”Ђв”Ђв”Ђ РЎС‚СЂСѓРєС‚СѓСЂР° store в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const _store: GameStore = {
    currentScreen:  null,
    previousScreen: null,
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

on('SCREEN_CHANGED', () => {
    const btns = document.querySelectorAll<HTMLElement>('.nav-btn[data-screen]');
    btns.forEach(btn => {
        const isActive = btn.dataset.screen === _store.currentScreen;
        btn.classList.toggle('nav-btn--active', isActive);
    });
});

const ScreenModules: Record<string, ScreenModule> = {};

export function registerScreen(screenId: ScreenId, module: ScreenModule): void {
    ScreenModules[screenId] = module;
}

let _activeModule: ScreenModule | null = null;

export async function transition(screenId: ScreenId, payload: Partial<SessionData> = {}, skipPushState = false): Promise<void> {
    if (screenId === _store.currentScreen && Object.keys(payload).length === 0) return;

    // РЈРЅРёС‡С‚РѕР¶Р°РµРј С‚РµРєСѓС‰РёР№ РјРѕРґСѓР»СЊ
    try { _activeModule?.destroy?.(); } catch (e) { console.error(e); }
    _activeModule = null;

    // РђРЅРёРјР°С†РёСЏ РїРµСЂРµС…РѕРґР°
    const overlay = document.getElementById('screen-transition-overlay');
    overlay?.classList.add('fade-out');

    _store.previousScreen = _store.currentScreen;
    _store.currentScreen  = screenId;
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

        // HUD РІРёРґРёРј С‚РѕР»СЊРєРѕ РІРѕ РІСЂРµРјСЏ РёРіСЂС‹
        _updateHudVisibility(screenId);

        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј РјРѕРґСѓР»СЊ СЌРєСЂР°РЅР°
        const mod = ScreenModules[screenId];
        if (mod) {
            _activeModule = mod;
            await mod.init?.(getStore());
        }

        // РЈРІРµРґРѕРјР»СЏРµРј РїРѕРґРїРёСЃС‡РёРєРѕРІ Рѕ СЃРјРµРЅРµ СЌРєСЂР°РЅР°
        dispatch('SCREEN_CHANGED', { screenId, previousScreen: _store.previousScreen });
    } catch (err) {
        console.error('[StateManager] transition error:', err);
        await _renderOfflineError(err);
    } finally {
        overlay?.classList.remove('fade-out');
    }
}



export function goBack(): void {
    const prev = _store.previousScreen;
    if (prev) transition(prev);
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
export function loadSavedPlayer(): boolean {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            _store.player = JSON.parse(raw) as PlayerState;
            if (!_store.player.shipColor) {
                _store.player.shipColor = '#4fc3f7';
            }
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
    transition(screenId, {}, true);
});

window.addEventListener('beforeunload', () => {
    if (_persistTimeout) { clearTimeout(_persistTimeout); _persistTimeout = null; }
    _persistPlayer();
});


/**
 * stateManager.ts вЂ” Centralized State Machine РґР»СЏ Stellar Vocation SPA
 *
 * РЎР»РѕРё Р°СЂС…РёС‚РµРєС‚СѓСЂС‹:
 *  store       вЂ” РµРґРёРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє РёСЃС‚РёРЅС‹ (РЅРµ РїРёС€РµРј РЅР°РїСЂСЏРјСѓСЋ, С‚РѕР»СЊРєРѕ С‡РµСЂРµР· dispatch)
 *  dispatch    вЂ” РјСѓС‚Р°С†РёСЏ store С‡РµСЂРµР· РёРјРµРЅРѕРІР°РЅРЅС‹Рµ actions
 *  transition  вЂ” СЃРјРµРЅР° СЌРєСЂР°РЅР°: fetch partial в†’ init module в†’ render
 *  ScreenModules вЂ” СЂРµРµСЃС‚СЂ РјРѕРґСѓР»РµР№ СЌРєСЂР°РЅРѕРІ (init/destroy)
 */

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

// в”Ђв”Ђв”Ђ Readonly-РґРѕСЃС‚СѓРї Рє store в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export function getStore(): Readonly<GameStore> {
    return _store;
}

// в”Ђв”Ђв”Ђ Actions / dispatch в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const _handlers = new Map<ActionType, Set<(store: GameStore, payload: unknown) => void>>();

/** Р РµРіРёСЃС‚СЂР°С†РёСЏ РѕР±СЂР°Р±РѕС‚С‡РёРєР° action */
export function on<T extends ActionType>(
    action: T,
    handler: (store: GameStore, payload: ActionPayload[T]) => void
): void {
    if (!_handlers.has(action)) _handlers.set(action, new Set());
    _handlers.get(action)!.add(handler as (store: GameStore, payload: unknown) => void);
}

/** Actions, РїСЂРё РєРѕС‚РѕСЂС‹С… РЅСѓР¶РЅРѕ СЃРѕС…СЂР°РЅСЏС‚СЊ player */
const _PLAYER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
    'SET_PLAYER', 'ADD_CRYSTALS', 'SPEND_CRYSTALS', 'EARN_CRYSTALS',
    'DISCOVER_PLANET', 'APPLY_UPGRADE', 'INCREMENT_STAT', 'ADD_BADGE',
]);

let _persistTimeout: ReturnType<typeof setTimeout> | null = null;

/** РњСѓС‚Р°С†РёСЏ store С‡РµСЂРµР· action */
export function dispatch<T extends ActionType>(action: T, payload: ActionPayload[T] = {} as ActionPayload[T]): void {
    const handlers = _handlers.get(action);
    if (handlers && handlers.size > 0) {
        handlers.forEach(h => {
            try { h(_store, payload); } catch (e) { console.error(e); }
        });
    } else if (action !== 'SCREEN_CHANGED') {
        console.warn(`[StateManager] No handlers for: "${action}"`);
    }
    // Debounced persist вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ player-РјСѓС‚РёСЂСѓСЋС‰РёС… actions
    if (_PLAYER_ACTIONS.has(action)) {
        if (_persistTimeout) clearTimeout(_persistTimeout);
        _persistTimeout = setTimeout(_persistPlayer, 300);
    }
}

// Р’СЃС‚СЂРѕРµРЅРЅС‹Рµ actions
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

// Navbar: РїРѕРґСЃРІРµС‚РєР° Р°РєС‚РёРІРЅРѕРіРѕ СЌРєСЂР°РЅР°
on('SCREEN_CHANGED', () => {
    const btns = document.querySelectorAll<HTMLElement>('.nav-btn[data-screen]');
    btns.forEach(btn => {
        const isActive = btn.dataset.screen === _store.currentScreen;
        btn.classList.toggle('nav-btn--active', isActive);
    });
});

// в”Ђв”Ђв”Ђ Р РµРµСЃС‚СЂ РјРѕРґСѓР»РµР№ СЌРєСЂР°РЅРѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const ScreenModules: Record<string, ScreenModule> = {};

/** Р РµРіРёСЃС‚СЂР°С†РёСЏ РјРѕРґСѓР»СЏ СЌРєСЂР°РЅР° */
export function registerScreen(screenId: ScreenId, module: ScreenModule): void {
    ScreenModules[screenId] = module;
}

// в”Ђв”Ђв”Ђ РџРµСЂРµС…РѕРґ РјРµР¶РґСѓ СЌРєСЂР°РЅР°РјРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

let _activeModule: ScreenModule | null = null;

/**
 * Р’С‹РїРѕР»РЅСЏРµС‚ РїРµСЂРµС…РѕРґ РЅР° РЅРѕРІС‹Р№ СЌРєСЂР°РЅ.
 * @param screenId вЂ” РѕРґРёРЅ РёР· Screen.*
 * @param payload  вЂ” РїСЂРѕРёР·РІРѕР»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ РґР»СЏ РЅРѕРІРѕРіРѕ СЌРєСЂР°РЅР° (РїРѕРїР°РґСѓС‚ РІ sessionData)
 */
export async function transition(screenId: ScreenId, payload: Partial<SessionData> = {}): Promise<void> {
    if (screenId === _store.currentScreen && Object.keys(payload).length === 0) return;

    // РЈРЅРёС‡С‚РѕР¶Р°РµРј С‚РµРєСѓС‰РёР№ РјРѕРґСѓР»СЊ
    try { _activeModule?.destroy?.(); } catch (e) { console.error(e); }
    _activeModule = null;

    // РђРЅРёРјР°С†РёСЏ РїРµСЂРµС…РѕРґР°
    const overlay = document.getElementById('screen-transition-overlay');
    overlay?.classList.add('fade-out');

    // РћР±РЅРѕРІР»СЏРµРј store
    _store.previousScreen = _store.currentScreen;
    _store.currentScreen  = screenId;
    if (Object.keys(payload).length) dispatch('SET_SESSION', payload as ActionPayload['SET_SESSION']);

    // Deep-link: РѕР±РЅРѕРІР»СЏРµРј URL-С…СЌС€
    history.pushState({ screen: screenId }, '', `#${screenId}`);

    try {
        // РџРѕРєР°Р·С‹РІР°РµРј skeleton-РїР»РµР№СЃС…РѕР»РґРµСЂ РїРѕРєР° Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ Partial
        const container = document.getElementById('screen-dynamic-content');
        if (container) showSkeleton(container);

        // РџРѕР»СѓС‡Р°РµРј HTML СЌРєСЂР°РЅР° СЃ СЃРµСЂРІРµСЂР°
        const html = await _fetchPartial(screenId);
        if (container) {
            container.innerHTML = html;
            container.classList.remove('screen-enter');
            // Force reflow РґР»СЏ СЂРµСЃС‚Р°СЂС‚Р° Р°РЅРёРјР°С†РёРё
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

/** Р’РѕР·РІСЂР°С‚ РЅР° РїСЂРµРґС‹РґСѓС‰РёР№ СЌРєСЂР°РЅ */
export function goBack(): void {
    const prev = _store.previousScreen;
    if (prev) transition(prev);
}

// в”Ђв”Ђв”Ђ Р’СЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Рµ С„СѓРЅРєС†РёРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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
                <h2 class="game-title" style="color:#f87171;">РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏ</h2>
                <p style="color:var(--color-text-muted);text-align:center;">${message}</p>
                <button class="btn-game btn-secondary" onclick="location.reload()">РџРѕРїСЂРѕР±РѕРІР°С‚СЊ СЃРЅРѕРІР°</button>
            </div>`;
    }
}

// в”Ђв”Ђв”Ђ РџРµСЂСЃРёСЃС‚РµРЅС‚РЅРѕСЃС‚СЊ (localStorage) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const SAVE_KEY = 'stellar_vocation_save';
const DEVICE_KEY = 'stellar_vocation_device_id';

function _getOrCreateDeviceId(): string {
    try {
        const existing = localStorage.getItem(DEVICE_KEY);
        if (existing) return existing;

        const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

        localStorage.setItem(DEVICE_KEY, next);
        return next;
    } catch {
        return `fallback-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }
}

async function _syncSaveToServer(playerJson: string): Promise<void> {
    try {
        await fetch('/api/player-save/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: _getOrCreateDeviceId(),
                saveJson: playerJson,
            }),
        });
    } catch (err) {
        console.warn('[StateManager] player save sync failed', err);
    }
}

function _persistPlayer(): void {
    if (_store.player) {
        try {
            const payload = JSON.stringify(_store.player);
            localStorage.setItem(SAVE_KEY, payload);
            void _syncSaveToServer(payload);
        } catch { /* quota exceeded вЂ” РёРіРЅРѕСЂРёСЂСѓРµРј */ }
    }
}
/** Force-save player immediately without waiting debounce timeout. */
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
    } catch { /* corrupted save */ }
    return false;
}

export function clearSave(): void {
    localStorage.removeItem(SAVE_KEY);
    _store.player = null;
}

// в”Ђв”Ђв”Ђ History API (РєРЅРѕРїРєР° В«РќР°Р·Р°РґВ» Р±СЂР°СѓР·РµСЂР°) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

window.addEventListener('popstate', (e: PopStateEvent) => {
    const screenId: ScreenId = e.state?.screen ?? Screen.MAIN_MENU;
    // РџРµСЂРµС…РѕРґРёРј Р±РµР· pushState (СѓР¶Рµ СЃРґРµР»Р°РЅ Р±СЂР°СѓР·РµСЂРѕРј)
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

// в”Ђв”Ђв”Ђ РђРІС‚РѕСЃРµР№РІ С‡РµСЂРµР· beforeunload (flush debounced persist) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

window.addEventListener('beforeunload', () => {
    if (_persistTimeout) { clearTimeout(_persistTimeout); _persistTimeout = null; }
    _persistPlayer();
});


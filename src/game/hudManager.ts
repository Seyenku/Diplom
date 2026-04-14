/**
 * hudManager.ts — Глобальный менеджер игрового HUD
 *
 * HUD (#hud-overlay) всегда в DOM, показывается только при экране HUD.
 * hudManager инициализируется один раз при старте, периодически читает
 * состояние store и обновляет индикаторы без перерисовки всего DOM.
 */

import { getStore, on } from './stateManager.js';
import { PlayerState, UpgradeDto, CrystalType } from './types.js';
import { addMessage } from './guideManager.js';

let _updateInterval: ReturnType<typeof setInterval> | null = null;

// ── Инициализация ────────────────────────────────────────────────────────────

/**
 * Загружает HTML HUD-оверлея и запускает цикл обновления.
 * Вызывается один раз в main.ts при старте.
 */
export async function initHud(): Promise<void> {
    const overlay = document.getElementById('hud-overlay');
    if (!overlay) return;

    // Загружаем Partial
    try {
        const resp = await fetch('/game?handler=Partial&screenId=hud', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (resp.ok) overlay.innerHTML = await resp.text();
    } catch {
        // Offline fallback
        overlay.innerHTML = `<div style="position:absolute;top:8px;right:8px;color:rgba(255,255,255,0.4);font-size:0.75rem;">HUD offline</div>`;
    }

    // Запускаем обновление HUD каждые 2 секунды
    _updateInterval = setInterval(_tick, 2000);

    // Также обновляем немедленно при действиях над кристаллами/апгрейдами
    on('ADD_CRYSTALS',    () => _tick());
    on('SPEND_CRYSTALS',  () => _tick());
    on('APPLY_UPGRADE',   () => _tick());
    on('SET_PLAYER',      () => _tick());
}

export function destroyHud(): void {
    if (_updateInterval) {
        clearInterval(_updateInterval);
        _updateInterval = null;
    }
}

// ── Обновление состояния ──────────────────────────────────────────────────────

function _tick(): void {
    const store = getStore();
    const player = store.player;
    if (!player) return;

    // ── Кристаллы ─────────────────────────────────────────────────────────────
    _updateCrystals(player.crystals ?? {});

    // ── Характеристики корабля ─────────────────────────────────────────────────
    const stats = _calcShipStats(player);
    _setBar('hud-shield-bar', stats.shieldPct);
    _setBar('hud-energy-bar', stats.energyPct);
    _setText('hud-speed', `${stats.speedPct}%`);
}

interface ShipStats {
    speedPct: number;
    shieldPct: number;
    energyPct: number;
}

function _calcShipStats(player: PlayerState): ShipStats {
    const applied = new Set(player.appliedUpgrades ?? []);
    const store = getStore();
    const upgrades = (store.sessionData?.upgrades ?? []) as UpgradeDto[];

    let speedBonus = 0;
    let shieldBonus = 0;

    upgrades
        .filter(u => applied.has(u.id))
        .forEach(u => {
            speedBonus += (u.effect?.speedBonus ?? 0);
            shieldBonus += (u.effect?.shieldBonus ?? 0);
        });

    return {
        speedPct: Math.min(200, 100 + speedBonus),
        shieldPct: Math.min(100, Math.round((100 + shieldBonus) / 1.6)),
        energyPct: 100,
    };
}

function _updateCrystals(crystals: Partial<Record<CrystalType, number>>): void {
    const container = document.getElementById('hud-crystals');
    if (!container) return;

    const DIR_ICONS: Record<string, string> = {
        it: '💻', bio: '🧬', math: '📐', eco: '🌿',
        design: '🎨', med: '⚕', neuro: '🧠', physics: '⚛',
        programming: '💎', medicine: '❤️', geology: '🌿',
    };

    const html = Object.entries(crystals)
        .filter(([, n]) => (n as number) > 0)
        .map(([dir, n]) => `<span class="crystal-badge" style="font-size:0.72rem;">${DIR_ICONS[dir] ?? '💎'} ${n}</span>`)
        .join('');

    container.innerHTML = html || `<span style="color:rgba(255,255,255,0.3);font-size:0.75rem;">Нет кристаллов</span>`;
}

// ── Индикатор синхронизации ───────────────────────────────────────────────────

type SyncStatus = 'saved' | 'syncing' | 'error';

/**
 * Обновляет индикатор синхронизации в HUD.
 */
export function setSyncStatus(status: SyncStatus): void {
    const dot = document.getElementById('hud-sync-dot');
    const text = document.getElementById('hud-sync-text');
    if (!dot || !text) return;

    const map: Record<SyncStatus, { color: string; label: string }> = {
        saved:   { color: '#39ff14', label: 'Сохранено' },
        syncing: { color: '#fb923c', label: 'Сохранение…' },
        error:   { color: '#f87171', label: 'Ошибка!' },
    };
    const s = map[status] ?? map.saved;
    (dot as HTMLElement).style.background = s.color;
    text.textContent = s.label;
}

// ── Хелперы ───────────────────────────────────────────────────────────────────

function _setBar(id: string, pct: number): void {
    const el = document.getElementById(id);
    if (el) (el as HTMLElement).style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function _setText(id: string, val: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

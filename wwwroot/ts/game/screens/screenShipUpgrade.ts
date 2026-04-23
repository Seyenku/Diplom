/**
 * screenShipUpgrade.ts — Модуль экрана апгрейдов корабля
 *
 * Стоимость апгрейдов — комбинации кристаллов:
 *   Двигатель: programming + geology
 *   Щиты:     medicine    + geology
 *   Сканер:   programming + medicine
 *   Трюм:     все 3 типа
 */

import { getStore, dispatch } from '../stateManager.js';
import { GameStore, CrystalType, UpgradeDto } from '../types.js';
import { playSfx } from '../audioManager.js';

const CRYSTAL_META: Record<string, { emoji: string; label: string; color: string }> = {
    programming: { emoji: '💎', label: 'Программирование', color: '#4fc3f7' },
    medicine:    { emoji: '❤️', label: 'Медицина',         color: '#f87171' },
    geology:     { emoji: '🌿', label: 'Геология',         color: '#34d399' },
};

interface UpgradeCost {
    [key: string]: number;
}

window._shipUpgrade = {
    buyUpgrade(upgradeId: string) {
        const store = getStore();
        const upgrade = ((store.sessionData?.upgrades ?? []) as UpgradeDto[]).find(u => u.id === upgradeId);
        if (!upgrade) return;

        // Проверяем, не куплен ли уже
        if ((store.player?.appliedUpgrades ?? []).includes(upgradeId)) return;

        // Стоимость — объект { programming: N, medicine: N, ... }
        const cost: UpgradeCost = (upgrade as unknown as { cost: UpgradeCost }).cost ?? {};
        const crystals = store.player?.crystals ?? {};

        // Проверяем каждый тип кристаллов
        for (const [type, needed] of Object.entries(cost)) {
            const have = (crystals as Record<string, number>)[type] ?? 0;
            if (have < (needed as number)) {
                const meta = CRYSTAL_META[type];
                playSfx('ui_error');
                alert(`Недостаточно кристаллов ${meta?.label ?? type}. Нужно: ${needed}, есть: ${have}.`);
                return;
            }
        }

        // Списываем кристаллы по типам
        dispatch('SPEND_CRYSTALS', { spent: cost as Record<CrystalType, number> });
        dispatch('APPLY_UPGRADE', { upgradeId });

        // Обновляем кнопку
        const btn = document.getElementById(`upgrade-btn-${upgradeId}`) as HTMLButtonElement | null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '✓ Установлен';
            btn.style.opacity = '0.5';
        }

        playSfx('upgrade_buy');
        _updateStats();
    }
};

export async function init(store: Readonly<GameStore>): Promise<void> {
    const upgrades = (store.sessionData?.upgrades ?? []) as UpgradeDto[];
    const installed = new Set(store.player?.appliedUpgrades ?? []);

    _renderUpgrades(upgrades, installed, store.player?.crystals ?? {});
    _updateStats();
}

export function destroy(): void {}

function _renderUpgrades(
    upgrades: UpgradeDto[],
    installed: Set<string>,
    crystals: Partial<Record<CrystalType, number>>
): void {
    const tree = document.getElementById('upgrade-tree');
    if (!tree || upgrades.length === 0) return;

    // Группируем по категории
    const groups: Record<string, UpgradeDto[]> = {};
    upgrades.forEach(u => { (groups[u.category] ??= []).push(u); });

    const catTitles: Record<string, string> = {
        engine: '🚀 Двигатель',
        shield: '🛡 Щиты',
        scanner: '🔭 Сканер',
        capacity: '💎 Трюм'
    };

    tree.innerHTML = Object.entries(groups).map(([cat, items]) => `
        <div class="game-card" style="display:flex;flex-direction:column;gap:0.75rem;">
            <h3 style="font-family:var(--font-display);font-size:0.85rem;letter-spacing:0.05em;color:var(--color-text-muted);">${catTitles[cat] ?? cat.toUpperCase()}</h3>
            ${items.map(u => _upgradeCard(u, installed.has(u.id), crystals)).join('')}
        </div>`
    ).join('');
}

function _upgradeCard(
    u: UpgradeDto,
    isInstalled: boolean,
    crystals: Partial<Record<CrystalType, number>>
): string {
    const eff = u.effect ?? {};
    const effText = [
        eff.speedBonus  ? `⚡ Скорость +${eff.speedBonus}%` : '',
        eff.shieldBonus ? `🛡 Щиты +${eff.shieldBonus}%`   : '',
        eff.scanRange   ? `🔭 Дальность +${eff.scanRange}`  : '',
        eff.capacity    ? `💎 Вместимость +${eff.capacity}` : '',
    ].filter(Boolean).join(', ');

    // Стоимость — несколько типов кристаллов
    const cost = (u as unknown as { cost: Record<string, number> }).cost ?? {};
    const costBadges = Object.entries(cost).map(([type, needed]) => {
        const meta = CRYSTAL_META[type] ?? { emoji: '💎', label: type, color: '#888' };
        const have = (crystals as Record<string, number>)[type] ?? 0;
        const sufficient = have >= (needed as number);
        return `<span class="crystal-badge" style="border-color:${meta.color};${sufficient ? '' : 'opacity:0.5;'}">
            ${meta.emoji} ${needed}
        </span>`;
    }).join('');

    // Есть ли все кристаллы?
    const canAfford = Object.entries(cost).every(([type, needed]) => ((crystals as Record<string, number>)[type] ?? 0) >= (needed as number));

    return `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.75rem;background:rgba(5,10,26,0.5);border-radius:var(--radius-sm);border:1px solid var(--color-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.9rem;font-weight:500;">${u.name}</span>
                <div style="display:flex;gap:0.25rem;">${costBadges}</div>
            </div>
            <p style="font-size:0.8rem;color:var(--color-text-muted);">${u.description}</p>
            <p style="font-size:0.75rem;color:var(--color-primary);">${effText}</p>
            <button id="upgrade-btn-${u.id}"
                    class="btn-game ${isInstalled ? 'btn-secondary' : canAfford ? 'btn-primary' : 'btn-secondary'}"
                    style="padding:6px 14px;font-size:0.75rem;${isInstalled || !canAfford ? 'opacity:0.5;' : ''}"
                    ${isInstalled || !canAfford ? 'disabled' : `onclick="window._shipUpgrade?.buyUpgrade('${u.id}')"`}>
                ${isInstalled ? '✓ Установлен' : canAfford ? 'Купить' : '🔒 Недостаточно кристаллов'}
            </button>
        </div>`;
}

function _updateStats(): void {
    const store = getStore();
    const apps = new Set(store.player?.appliedUpgrades ?? []);
    const all = (store.sessionData?.upgrades ?? []) as UpgradeDto[];

    let speed = 100, shield = 100, scan = 1, cap = 50;
    all.filter(u => apps.has(u.id)).forEach(u => {
        const e = u.effect ?? {};
        speed += e.speedBonus ?? 0;
        shield += e.shieldBonus ?? 0;
        scan += e.scanRange ?? 0;
        cap += e.capacity ?? 0;
    });

    _set('ship-stat-speed', `${speed}%`);
    _set('ship-stat-shield', `${shield}%`);
    _set('ship-stat-scanner', String(scan));
    _set('ship-stat-capacity', String(cap));
}

function _set(id: string, v: string): void {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
}

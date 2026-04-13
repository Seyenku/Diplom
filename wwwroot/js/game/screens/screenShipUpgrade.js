/**
 * screenShipUpgrade.js — Модуль экрана апгрейдов корабля
 */

import { getStore, dispatch, transition, Screen } from '../stateManager.js';

window._shipUpgrade = {
    buyUpgrade(upgradeId) {
        const store   = getStore();
        const upgrade = (store.sessionData?.upgrades ?? []).find(u => u.id === upgradeId);
        if (!upgrade) return;

        // Проверяем, не куплен ли уже
        if ((store.player?.appliedUpgrades ?? []).includes(upgradeId)) return;

        // Проверяем кристаллы
        const crystals = store.player?.crystals ?? {};
        const total    = Object.values(crystals).reduce((a, b) => a + b, 0);
        if (total < upgrade.cost) {
            alert(`Недостаточно кристаллов. Нужно ещё ${upgrade.cost - total}.`);
            return;
        }

        // Списываем кристаллы (равномерно из всех типов)
        const spent = {};
        let remaining = upgrade.cost;
        for (const [dir, n] of Object.entries(crystals)) {
            if (remaining <= 0) break;
            const take = Math.min(n, remaining);
            if (take > 0) { spent[dir] = take; remaining -= take; }
        }
        dispatch('SPEND_CRYSTALS', { spent });
        dispatch('APPLY_UPGRADE', { upgradeId });

        // Обновляем кнопку
        const btn = document.getElementById(`upgrade-btn-${upgradeId}`);
        if (btn) {
            btn.disabled       = true;
            btn.textContent    = '✓ Установлен';
            btn.style.opacity  = '0.5';
        }

        _updateStats();
    }
};

export async function init(store) {
    const upgrades   = store.sessionData?.upgrades ?? [];
    const installed  = new Set(store.player?.appliedUpgrades ?? []);
    const shipStats  = store.player?.shipStats ?? {};

    _renderUpgrades(upgrades, installed);
    _updateStats();
}

export function destroy() {}

function _renderUpgrades(upgrades, installed) {
    const tree = document.getElementById('upgrade-tree');
    if (!tree || upgrades.length === 0) return;

    // Группируем по категории
    const groups = {};
    upgrades.forEach(u => { (groups[u.category] ??= []).push(u); });

    const catTitles = { engine: '🚀 Двигатель', shield: '🛡 Щиты', scanner: '🔭 Сканер', capacity: '💎 Трюм' };

    tree.innerHTML = Object.entries(groups).map(([cat, items]) => `
        <div class="game-card" style="display:flex;flex-direction:column;gap:0.75rem;">
            <h3 style="font-family:var(--font-display);font-size:0.85rem;letter-spacing:0.05em;color:var(--color-text-muted);">${catTitles[cat] ?? cat.toUpperCase()}</h3>
            ${items.map(u => _upgradeCard(u, installed.has(u.id))).join('')}
        </div>`
    ).join('');
}

function _upgradeCard(u, isInstalled) {
    const eff = u.effect ?? {};
    const effText = [
        eff.speedBonus  ? `⚡ Скорость +${eff.speedBonus}%`  : '',
        eff.shieldBonus ? `🛡 Щиты +${eff.shieldBonus}%`    : '',
        eff.scanRange   ? `🔭 Дальность +${eff.scanRange}`   : '',
        eff.capacity    ? `💎 Вместимость +${eff.capacity}`  : '',
    ].filter(Boolean).join(', ');

    return `
        <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.75rem;background:rgba(5,10,26,0.5);border-radius:var(--radius-sm);border:1px solid var(--color-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.9rem;font-weight:500;">${u.name}</span>
                <span class="crystal-badge" style="font-size:0.75rem;">💎 ${u.cost}</span>
            </div>
            <p style="font-size:0.8rem;color:var(--color-text-muted);">${u.description}</p>
            <p style="font-size:0.75rem;color:var(--color-primary);">${effText}</p>
            <button id="upgrade-btn-${u.id}"
                    class="btn-game ${isInstalled ? 'btn-secondary' : 'btn-primary'}"
                    style="padding:6px 14px;font-size:0.75rem;${isInstalled ? 'opacity:0.5;' : ''}"
                    ${isInstalled ? 'disabled' : `onclick="window._shipUpgrade?.buyUpgrade('${u.id}')"`}>
                ${isInstalled ? '✓ Установлен' : 'Купить'}
            </button>
        </div>`;
}

function _updateStats() {
    const store = getStore();
    const apps  = new Set(store.player?.appliedUpgrades ?? []);
    const all   = store.sessionData?.upgrades ?? [];

    let speed = 100, shield = 100, scan = 1, cap = 50;
    all.filter(u => apps.has(u.id)).forEach(u => {
        const e = u.effect ?? {};
        speed  += e.speedBonus  ?? 0;
        shield += e.shieldBonus ?? 0;
        scan   += e.scanRange   ?? 0;
        cap    += e.capacity    ?? 0;
    });

    _set('ship-stat-speed',    `${speed}%`);
    _set('ship-stat-shield',   `${shield}%`);
    _set('ship-stat-scanner',  String(scan));
    _set('ship-stat-capacity', String(cap));
}

function _set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

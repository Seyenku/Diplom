/**
 * screenGalaxyMap.js — Модуль звёздной карты галактики
 */

import { getStore, transition, Screen } from '../stateManager.js';
import { switchScene } from '../threeScene.js';

const DIR_LABELS = {
    it:     '💻 IT',
    bio:    '🧬 Биотех',
    math:   '📐 Математика',
    eco:    '🌿 Экология',
    design: '🎨 Дизайн',
    med:    '⚕ Медицина',
    neuro:  '🧠 Нейронауки',
    physics:'⚛ Физика',
};

let _allPlanets = [];
let _discoveredIds = new Set();

window._galaxyMap = {
    applyFilter() {
        const cat    = document.getElementById('filter-category')?.value ?? '';
        const status = document.getElementById('filter-status')?.value ?? '';
        _renderPlanets(_allPlanets, cat, status);
    },
    openScan() {
        transition(Screen.NEBULA_SCAN);
    },
    selectPlanet(planetId) {
        transition(Screen.PLANET_DETAIL, { planetId });
    }
};

export async function init(store) {
    await switchScene('asteroid-belt');

    _allPlanets     = store.sessionData?.catalog ?? [];
    _discoveredIds  = new Set(store.player?.discoveredPlanets ?? []);

    // Если каталог пустой — загружаем с сервера
    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/game?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json();
        } catch { /* офлайн */ }
    }

    _renderPlanets(_allPlanets, '', '');
    _updateStats();
}

export function destroy() {
    delete window._galaxyMap;
}

// ── Рендеринг ────────────────────────────────────────────────────────────────

function _renderPlanets(planets, catFilter, statusFilter) {
    const grid = document.getElementById('planet-grid');
    if (!grid) return;

    const filtered = planets.filter(p => {
        if (catFilter    && p.category !== catFilter)                           return false;
        if (statusFilter === 'discovered' && !_discoveredIds.has(p.id))        return false;
        if (statusFilter === 'hidden'     &&  _discoveredIds.has(p.id))        return false;
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);padding:3rem;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">🌌</div>
            <p>По выбранным фильтрам планет не найдено.</p></div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => _planetCard(p)).join('');
}

function _planetCard(planet) {
    const discovered = _discoveredIds.has(planet.id) || planet.isStarterVisible;
    const opacity    = discovered ? '1' : '0.45';
    const cursor     = discovered ? 'pointer' : 'default';
    const overlay    = discovered ? '' : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🌫</div>`;

    const crystalBadges = discovered
        ? Object.entries(planet.crystalRequirements ?? {})
            .map(([dir, n]) => `<span class="crystal-badge" style="font-size:0.7rem;">${DIR_LABELS[dir] ?? dir} ×${n}</span>`)
            .join('')
        : '';

    return `
        <div onclick="${discovered ? `window._galaxyMap?.selectPlanet('${planet.id}')` : ''}"
             style="position:relative;background:rgba(15,23,42,0.7);border:1px solid var(--color-border);border-radius:var(--radius);padding:1rem;
                    opacity:${opacity};cursor:${cursor};transition:border-color var(--transition-ui),box-shadow var(--transition-ui);"
             onmouseenter="this.style.borderColor='rgba(99,102,241,0.6)';this.style.boxShadow='0 0 20px rgba(99,102,241,0.12)'"
             onmouseleave="this.style.borderColor='var(--color-border)';this.style.boxShadow='none'">
            ${overlay}
            <p style="font-size:0.7rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;">${planet.category}</p>
            <h3 style="font-family:var(--font-display);font-size:0.9rem;margin:0.25rem 0 0.5rem;color:var(--color-text);">${planet.name}</h3>
            <p style="font-size:0.8rem;color:var(--color-text-muted);line-height:1.5;margin-bottom:0.75rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${planet.description}</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${crystalBadges}</div>
        </div>`;
}

function _updateStats() {
    const total = _allPlanets.length;
    const disc  = _allPlanets.filter(p => _discoveredIds.has(p.id) || p.isStarterVisible).length;
    const elD = document.getElementById('stat-discovered');
    const elT = document.getElementById('stat-total');
    if (elD) elD.textContent = `📍 Открыто: ${disc}`;
    if (elT) elT.textContent = `🌐 Всего: ${total}`;
}

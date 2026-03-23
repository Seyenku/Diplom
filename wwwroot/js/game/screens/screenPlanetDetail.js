/**
 * screenPlanetDetail.js — Модуль экрана описания планеты / профессии
 */

import { getStore, transition, Screen } from '../stateManager.js';

window._planetDetail = {
    startMiniGame() {
        transition(Screen.MINIGAME);
    }
};

export async function init(store) {
    const planetId = store.sessionData?.planetId;
    const catalog  = store.sessionData?.catalog ?? [];
    const planet   = catalog.find(p => p.id === planetId);

    if (!planet) {
        document.getElementById('planet-name')?.textContent && (document.getElementById('planet-name').textContent = 'Планета не найдена');
        return;
    }

    _set('planet-category',    planet.category?.toUpperCase() ?? '');
    _set('planet-name',        planet.name);
    _set('planet-description', planet.description);

    // Hard skills
    _renderList('hard-skills-list', planet.hardSkills ?? [], '🔧');
    // Soft skills
    _renderList('soft-skills-list', planet.softSkills ?? [], '✨');
    // Риски
    _renderList('risks-list', planet.risks ?? [], '⚠');

    // Требования кристаллов
    const reqEl = document.getElementById('crystal-requirements');
    if (reqEl) {
        reqEl.innerHTML = Object.entries(planet.crystalRequirements ?? {})
            .map(([dir, n]) => `<span class="crystal-badge">${dir} ×${n}</span>`)
            .join('');
    }
}

export function destroy() { delete window._planetDetail; }

function _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _renderList(listId, items, icon) {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = items.length
        ? items.map(s => `<li style="font-size:0.9rem;color:var(--color-text-muted);">${icon} ${s}</li>`).join('')
        : `<li style="color:var(--color-text-muted);font-size:0.85rem;">—</li>`;
}

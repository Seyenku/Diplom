/**
 * galaxyUi.ts — Управление DOM-элементами интерфейса карты галактики
 */

import { ClusterType, PlanetDto, PlayerState } from '../types.js';
import { CLUSTER_META } from '../clusterConfig.js';

export function showTooltip(name: string, cat: string): void {
    const tooltipEl = document.getElementById('galaxy-tooltip');
    const nameEl = document.getElementById('galaxy-tooltip-name');
    const catEl = document.getElementById('galaxy-tooltip-cat');
    
    if (tooltipEl && nameEl && catEl) {
        nameEl.textContent = name;
        catEl.textContent = cat;
        tooltipEl.classList.remove('hidden');
    }
}

export function hideTooltip(): void {
    const tooltipEl = document.getElementById('galaxy-tooltip');
    if (tooltipEl) tooltipEl.classList.add('hidden');
}

export function showBackButton(show: boolean): void {
    const btn = document.getElementById('btn-galaxy-back');
    if (btn) btn.classList.toggle('hidden', !show);
}

export function showNebulaPanel(
    clusterId: ClusterType,
    clusterDesc: string,
    playerCrystals: number,
    planetCount: number,
    allPlanets: PlanetDto[],
    discoveredIds: Set<string>
): void {
    const meta = CLUSTER_META[clusterId];
    const panel = document.getElementById('nebula-info-panel');
    if (!panel || !meta) return;

    document.getElementById('nebula-info-icon')!.textContent = meta.icon;
    document.getElementById('nebula-info-name')!.textContent = meta.label;
    document.getElementById('nebula-info-desc')!.textContent = clusterDesc;
    document.getElementById('nebula-info-crystal')!.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;
    document.getElementById('nebula-info-planets')!.textContent = `🪐 Планет: ${planetCount}`;

    renderPlanetGrid(clusterId, allPlanets, playerCrystals, discoveredIds);
    panel.classList.remove('hidden');
}

export function hideNebulaPanel(): void {
    const panel = document.getElementById('nebula-info-panel');
    if (panel) panel.classList.add('hidden');
}

export function refreshNebulaPanel(
    clusterId: ClusterType,
    playerCrystals: number,
    allPlanets: PlanetDto[],
    discoveredIds: Set<string>
): void {
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const el = document.getElementById('nebula-info-crystal');
    if (el) el.textContent = `${meta.crystalEmoji} Кристаллы: ${playerCrystals}`;

    renderPlanetGrid(clusterId, allPlanets, playerCrystals, discoveredIds);
}

export function renderPlanetGrid(
    clusterId: ClusterType,
    allPlanets: PlanetDto[],
    playerCrystals: number,
    discoveredIds: Set<string>
): void {
    const grid = document.getElementById('nebula-planet-grid');
    if (!grid) return;

    const planets = allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];

    grid.innerHTML = planets.map(p => {
        const discovered = discoveredIds.has(p.id) || p.isStarterVisible;
        const canUnlock = !discovered && playerCrystals >= (p.unlockCost ?? 0);

        const stateClass = discovered
            ? 'nebula-planet-card--open'
            : canUnlock
                ? 'nebula-planet-card--can-unlock'
                : 'nebula-planet-card--locked';

        const statusText = discovered
            ? '✅'
            : canUnlock
                ? `🔓 ${p.unlockCost} ${meta.crystalEmoji}`
                : `🔒 ${p.unlockCost} ${meta.crystalEmoji}`;

        return `<div class="nebula-planet-card ${stateClass}"
                     style="--accent:${meta.colorHex};"
                     onclick="window._galaxyMap?.openPlanet('${p.id}')">
            <span class="nebula-planet-name">${p.name}</span>
            <span class="nebula-planet-cost">${statusText}</span>
        </div>`;
    }).join('');
}

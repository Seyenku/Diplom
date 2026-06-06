/**
 * screenVocationConstellation.ts — Созвездие Призвания
 */

import { getStore, transition, Screen } from '../stateManager.js';
import { GameStore, PlanetDto } from '../types.js';

window._vocationConst = {
    exportPdf() { (window as any).showNotification('Экспорт PDF будет доступен в следующей версии.', 'info'); },
    showPath()  { (window as any).showNotification('Отображение пути развития — в разработке.', 'info'); },
    openPlanet(planetId: string) {
        const catalog = (getStore().sessionData?.catalog ?? []) as PlanetDto[];
        const planet = catalog.find(p => p.id === planetId);
        transition(Screen.PLANET_DETAIL, {
            planetId,
            regionId: planet?.clusterId,
            crystalType: planet?.crystalType,
        });
    },
};

interface RankedPlanet {
    planet: PlanetDto;
    score: number;
}

export async function init(store: Readonly<GameStore>): Promise<void> {
    const discovered = new Set(store.player?.discoveredPlanets ?? []);
    const catalog    = store.sessionData?.catalog as PlanetDto[] ?? [];

    // Для матчинга берём весь каталог: даже неоткрытые планеты могут попасть в рекомендации.
    if (catalog.length === 0) return;

    const crystals = (store.player?.crystals ?? {}) as Record<string, number>;
    const ranked: RankedPlanet[] = catalog
        .map(p => ({ planet: p, score: _matchScore(crystals, p, discovered.has(p.id)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    _renderSvg(ranked);
    _renderList(ranked);

    const placeholder = document.getElementById('constellation-placeholder');
    if (placeholder) (placeholder as HTMLElement).style.display = 'none';
}

export function destroy(): void {}

/**
 * Однокластерное совпадение: доля собранных кристаллов нужного типа
 * относительно стоимости открытия планеты.
 * Уже открытым планетам +0.2 — отражает реальный «прохождённый интерес».
 */
function _matchScore(crystals: Record<string, number>, planet: PlanetDto, isDiscovered: boolean): number {
    const need = planet.unlockCost ?? 0;
    let s: number;
    if (need <= 0) {
        s = 0.5;
    } else {
        const have = crystals[planet.crystalType] ?? 0;
        s = Math.min(1, have / need);
    }
    if (isDiscovered) s = Math.min(1, s + 0.2);
    return s;
}

interface Point {
    x: number;
    y: number;
}

function _renderSvg(ranked: RankedPlanet[]): void {
    const svg = document.getElementById('constellation-svg');
    if (!svg || ranked.length === 0) return;
    const cx = 350, cy = 262, r = 180;
    let html = '';
    const pts: Point[] = ranked.map((_, i) => {
        const a = (i / ranked.length) * 2 * Math.PI - Math.PI / 2;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    // Линии между звёздами
    for (let i = 0; i < pts.length - 1; i++) {
        html += `<line x1="${pts[i].x}" y1="${pts[i].y}" x2="${pts[i+1].x}" y2="${pts[i+1].y}" stroke="rgba(99,102,241,0.35)" stroke-width="1.5"/>`;
    }
    // Звёзды
    pts.forEach((p, i) => {
        const pct = Math.round(ranked[i].score * 100);
        html += `<circle cx="${p.x}" cy="${p.y}" r="8" fill="#4fc3f7" opacity="0.9"/>
                 <text x="${p.x}" y="${p.y + 22}" text-anchor="middle" font-size="11" fill="#cbd5e1" font-family="Inter,sans-serif">${ranked[i].planet.name}</text>
                 <text x="${p.x}" y="${p.y - 14}" text-anchor="middle" font-size="10" fill="#818cf8">${pct}%</text>`;
    });
    svg.innerHTML = html;
}

function _renderList(ranked: RankedPlanet[]): void {
    const el = document.getElementById('recommendations-list');
    if (!el) return;
    el.innerHTML = ranked.map(({ planet, score }, i) => `
        <div class="game-card" style="display:flex;align-items:center;gap:1rem;">
            <div style="font-family:var(--font-display);font-size:1.2rem;color:var(--color-primary);min-width:28px;">#${i + 1}</div>
            <div style="flex:1;">
                <p style="font-weight:600;">${_escapeHtml(planet.name)}</p>
                <p style="font-size:0.8rem;color:var(--color-text-muted);">Совпадение: ${Math.round(score * 100)}%</p>
            </div>
            <button class="btn-game btn-secondary" style="padding:6px 14px;font-size:0.8rem;"
                    data-action="vocationConst.openPlanet" data-arg="${_escapeHtml(planet.id)}">Подробнее</button>
        </div>`
    ).join('');
}

function _escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch] ?? ch));
}

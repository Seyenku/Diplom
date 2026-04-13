/**
 * screenVocationConstellation.js — Созвездие Призвания
 */
import { getStore, transition, Screen } from '../stateManager.js';

window._vocationConst = {
    exportPdf() { alert('Экспорт PDF будет доступен в следующей версии.'); },
    showPath()  { alert('Отображение пути развития — в разработке.'); }
};

export async function init(store) {
    const discovered = new Set(store.player?.discoveredPlanets ?? []);
    const catalog    = store.sessionData?.catalog ?? [];
    const planets    = catalog.filter(p => discovered.has(p.id) || p.isStarterVisible);

    if (planets.length === 0) return;

    // Строим рекомендации: топ-5 по кристаллам
    const crystals  = store.player?.crystals ?? {};
    const ranked    = planets
        .map(p => ({ planet: p, score: _matchScore(crystals, p.crystalRequirements) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    _renderSvg(ranked);
    _renderList(ranked);

    const placeholder = document.getElementById('constellation-placeholder');
    if (placeholder) placeholder.style.display = 'none';
}

export function destroy() {}

function _matchScore(crystals, req) {
    if (!req || Object.keys(req).length === 0) return 0;
    let s = 0;
    for (const [d, n] of Object.entries(req)) s += Math.min(1, (crystals[d] ?? 0) / n);
    return s / Object.keys(req).length;
}

function _renderSvg(ranked) {
    const svg = document.getElementById('constellation-svg');
    if (!svg || ranked.length === 0) return;
    const cx = 350, cy = 262, r = 180;
    let html = '';
    const pts = ranked.map((_, i) => {
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

function _renderList(ranked) {
    const el = document.getElementById('recommendations-list');
    if (!el) return;
    el.innerHTML = ranked.map(({ planet, score }, i) => `
        <div class="game-card" style="display:flex;align-items:center;gap:1rem;">
            <div style="font-family:var(--font-display);font-size:1.2rem;color:var(--color-primary);min-width:28px;">#${i + 1}</div>
            <div style="flex:1;">
                <p style="font-weight:600;">${planet.name}</p>
                <p style="font-size:0.8rem;color:var(--color-text-muted);">Совпадение: ${Math.round(score * 100)}%</p>
            </div>
            <button class="btn-game btn-secondary" style="padding:6px 14px;font-size:0.8rem;"
                    onclick="window._spa?.goto('planet-detail')">Подробнее</button>
        </div>`
    ).join('');
}

/**
 * screenAchievements.js — Достижения и аналитика прогресса
 */
import { getStore } from '../stateManager.js';

const ACHIEVEMENTS_DEF = [
    { id: 'first-scan',   icon: '🔭', title: 'Первый сканер',     desc: 'Запустил первое сканирование туманности.' },
    { id: 'first-planet', icon: '🌍', title: 'Первое открытие',   desc: 'Открыл свою первую профессию-планету.' },
    { id: 'minigame-3',   icon: '🎮', title: 'Мини-игрок',        desc: 'Прошёл 3 мини-игры.' },
    { id: 'crystals-100', icon: '💎', title: 'Коллекционер',      desc: 'Собрал 100 кристаллов суммарно.' },
    { id: 'perfect-run',  icon: '⭐', title: 'Идеальная посадка', desc: 'Набрал максимум очков в мини-игре.' },
    { id: 'speed-master', icon: '⚡', title: 'Мастер скорости',   desc: 'Прошёл мини-игру быстро с высоким счётом.' },
    { id: 'all-cats',     icon: '🌌', title: 'Ренессансный ум',   desc: 'Собирал кристаллы во всех 8 направлениях.' },
    { id: 'upgrade-1',    icon: '🚀', title: 'Прокачка',          desc: 'Установил первый апгрейд корабля.' },
];

export async function init(store) {
    const player  = store.player ?? {};
    const badges  = new Set(player.badges ?? []);
    const cats    = new Set(Object.keys(player.crystals ?? {}).filter(k => (player.crystals ?? {})[k] > 0));
    const planets = (player.discoveredPlanets ?? []).length;
    const stats   = player.stats ?? {};

    _set('stat-planets',         String(planets));
    _set('stat-scans',           String(stats.scans ?? 0));
    _set('stat-minigames',       String(stats.miniGamesPlayed ?? 0));
    const totalCr = Object.values(player.crystals ?? {}).reduce((a, b) => a + b, 0);
    _set('stat-total-crystals', String(stats.totalCrystalsEarned ?? totalCr));

    _renderActivityChart(player.crystals ?? {});
    _renderAchievements(badges);
}

export function destroy() {}

function _set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

function _renderActivityChart(crystals) {
    const svg = document.getElementById('activity-chart');
    if (!svg) return;
    const dirs = Object.keys(crystals);
    if (dirs.length === 0) return;
    const max = Math.max(...Object.values(crystals), 1);
    const w = 600, h = 120, padding = 10;
    const barW = Math.floor((w - padding * 2) / dirs.length) - 4;
    const html = dirs.map((d, i) => {
        const val = crystals[d] ?? 0;
        const bh  = Math.max(4, Math.round(((h - 30 - padding) * val) / max));
        const x   = padding + i * (barW + 4);
        const y   = h - 20 - bh;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="url(#barGrad)"/>
                <text x="${x + barW / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="#64748b">${d}</text>
                <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#94a3b8">${val}</text>`;
    }).join('');
    svg.innerHTML = `<defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#4fc3f7"/>
            <stop offset="100%" stop-color="#818cf8"/>
        </linearGradient></defs>${html}`;
}

function _renderAchievements(earnedBadges) {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;
    grid.innerHTML = ACHIEVEMENTS_DEF.map(a => {
        const earned = earnedBadges.has(a.id);
        return `<div class="game-card" style="display:flex;align-items:center;gap:0.75rem;opacity:${earned ? 1 : 0.4};">
            <div style="font-size:1.75rem;">${a.icon}</div>
            <div><p style="font-weight:600;font-size:0.9rem;">${a.title}</p>
                 <p style="font-size:0.75rem;color:var(--color-text-muted);">${a.desc}</p></div>
        </div>`;
    }).join('');
}

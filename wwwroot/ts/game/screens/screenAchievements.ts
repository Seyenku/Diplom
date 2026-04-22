/**
 * screenAchievements.ts — Достижения, Radar Chart и аналитика прогресса
 *
 * Перестроено на 3-кластерную систему (programming / medicine / geology).
 */

import { getStore } from '../stateManager.js';
import { GameStore, CrystalType } from '../types.js';
import { CLUSTERS } from '../clusterConfig.js';

// ── Определения достижений ──────────────────────────────────────────────────

interface AchievementDef {
    id: string;
    icon: string;
    title: string;
    desc: string;
}

const ACHIEVEMENTS_DEF: AchievementDef[] = [
    { id: 'first-scan',       icon: '🔭', title: 'Первый сканер',      desc: 'Запустил первое сканирование туманности.' },
    { id: 'first-planet',     icon: '🌍', title: 'Первое открытие',    desc: 'Открыл свою первую профессию-планету.' },
    { id: 'minigame-3',       icon: '🎮', title: 'Мини-игрок',         desc: 'Прошёл 3 мини-игры.' },
    { id: 'crystals-100',     icon: '💎', title: 'Коллекционер',       desc: 'Собрал 100 кристаллов суммарно.' },
    { id: 'perfect-run',      icon: '⭐', title: 'Идеальная посадка',  desc: 'Набрал максимум очков в мини-игре.' },
    { id: 'speed-master',     icon: '⚡', title: 'Мастер скорости',    desc: 'Прошёл мини-игру быстро с высоким счётом.' },
    { id: 'all-clusters',     icon: '🌌', title: 'Космический учёный', desc: 'Собирал кристаллы во всех 3 туманностях.' },
    { id: 'upgrade-1',        icon: '🚀', title: 'Прокачка',           desc: 'Установил первый апгрейд корабля.' },
    { id: 'flight-10',        icon: '🛸', title: 'Пилот-ас',           desc: 'Совершил 10 полётов.' },
    { id: 'explorer-5',       icon: '🗺', title: 'Исследователь',      desc: 'Открыл 5 планет.' },
];

window._achievements = {
    exportStats() {
        const store = getStore();
        const data = {
            player: store.player,
            exportDate: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stellar-vocation-stats-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
};

export async function init(store: Readonly<GameStore>): Promise<void> {
    const player  = store.player ?? {} as NonNullable<typeof store.player>;
    const badges  = new Set(player.badges ?? []);
    const crystals = player.crystals ?? {};
    const stats   = player.stats ?? {};
    const planets = (player.discoveredPlanets ?? []).length;

    // Статистика
    _set('stat-planets',         String(planets));
    _set('stat-scans',           String(stats.scans ?? 0));
    _set('stat-minigames',       String(stats.miniGamesPlayed ?? 0));
    _set('stat-flights',         String(stats.flights ?? 0));

    const totalCr = Object.values(crystals).reduce((a, b) => a + (b as number), 0);
    _set('stat-total-crystals', String(stats.totalCrystalsEarned ?? totalCr));

    // Авто-выдача достижений на основе прогресса
    _autoCheckAchievements(player, badges);

    // Рендер
    _renderRadarChart(crystals);
    _renderActivityChart(crystals);
    _renderAchievements(badges);
}

export function destroy(): void {}

// ── Авто-проверка достижений ────────────────────────────────────────────────

function _autoCheckAchievements(
    player: NonNullable<Parameters<typeof init>[0]['player']>,
    badges: Set<string>
): void {
    const stats   = player!.stats ?? {};
    const crystals = player!.crystals ?? {};
    const planets = (player!.discoveredPlanets ?? []).length;
    const totalCr = Object.values(crystals).reduce((a, b) => a + (b as number), 0);
    const clustersWithCrystals = CLUSTERS.filter(c =>
        (crystals[c.crystalType as keyof typeof crystals] as number) > 0
    ).length;

    if ((stats as Record<string, number>).scans > 0)           badges.add('first-scan');
    if (planets > 0)               badges.add('first-planet');
    if (planets >= 5)              badges.add('explorer-5');
    if (((stats as Record<string, number>).miniGamesPlayed ?? 0) >= 3) badges.add('minigame-3');
    if (totalCr >= 100)            badges.add('crystals-100');
    if (clustersWithCrystals >= CLUSTERS.length) badges.add('all-clusters');
    if (((stats as Record<string, number>).flights ?? 0) >= 10) badges.add('flight-10');
    if ((player!.appliedUpgrades ?? []).length > 0) badges.add('upgrade-1');
}

// ── Radar Chart (SVG) — 3 кластера ──────────────────────────────────────────

function _renderRadarChart(crystals: Partial<Record<CrystalType, number>>): void {
    const svg = document.getElementById('radar-chart');
    if (!svg) return;

    const cx = 200, cy = 200, maxR = 150;
    const n = CLUSTERS.length;
    const angleStep = (Math.PI * 2) / n;

    // Максимальное значение для нормализации
    const values = CLUSTERS.map(c => (crystals as Record<string, number>)[c.crystalType] ?? 0);
    const max = Math.max(...values, 1);

    let html = '';

    // Концентрические кольца (фон)
    for (let ring = 1; ring <= 4; ring++) {
        const r = (ring / 4) * maxR;
        const pts: string[] = [];
        for (let i = 0; i < n; i++) {
            const angle = i * angleStep - Math.PI / 2;
            pts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
        }
        html += `<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(79,195,247,0.08)" stroke-width="1"/>`;
    }

    // Оси
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const ex = cx + Math.cos(angle) * maxR;
        const ey = cy + Math.sin(angle) * maxR;
        html += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="rgba(79,195,247,0.1)" stroke-width="1"/>`;

        // Подписи
        const lx = cx + Math.cos(angle) * (maxR + 28);
        const ly = cy + Math.sin(angle) * (maxR + 28);
        html += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                       font-size="12" fill="${CLUSTERS[i].colorHex}" font-family="var(--font-display)">${CLUSTERS[i].icon} ${CLUSTERS[i].shortLabel}</text>`;
    }

    // Полигон данных
    const dataPts: string[] = [];
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const v = values[i] / max;
        const r = v * maxR;
        dataPts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
    }

    // Градиент
    html += `<defs>
        <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4fc3f7" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#818cf8" stop-opacity="0.3"/>
        </linearGradient>
    </defs>`;

    html += `<polygon points="${dataPts.join(' ')}" fill="url(#radarGrad)" stroke="#4fc3f7" stroke-width="2" stroke-linejoin="round"/>`;

    // Точки на вершинах
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const v = values[i] / max;
        const r = v * maxR;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        html += `<circle cx="${px}" cy="${py}" r="5" fill="${CLUSTERS[i].colorHex}" stroke="#020612" stroke-width="2"/>`;

        // Значения
        if (values[i] > 0) {
            const vx = cx + Math.cos(angle) * (r + 16);
            const vy = cy + Math.sin(angle) * (r + 16);
            html += `<text x="${vx}" y="${vy}" text-anchor="middle" dominant-baseline="middle"
                           font-size="11" fill="#94a3b8" font-family="var(--font-display)">${values[i]}</text>`;
        }
    }

    svg.innerHTML = html;
}

// ── Bar Chart — 3 кластера ──────────────────────────────────────────────────

function _renderActivityChart(crystals: Partial<Record<CrystalType, number>>): void {
    const svg = document.getElementById('activity-chart');
    if (!svg) return;

    const entries = CLUSTERS.map(c => ({
        ...c,
        value: (crystals as Record<string, number>)[c.crystalType] ?? 0,
    }));
    const max = Math.max(...entries.map(e => e.value), 1);
    const w = 600, h = 140, padding = 24;
    const barW = Math.floor((w - padding * 2) / entries.length) - 12;

    let html = '';

    entries.forEach((e, i) => {
        const barH = Math.max(4, Math.round(((h - 40 - padding) * e.value) / max));
        const x = padding + i * (barW + 12);
        const y = h - 28 - barH;

        // Бар с цветом кластера
        html += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${e.colorHex}" opacity="0.85"/>`;
        // Подпись кластера
        html += `<text x="${x + barW / 2}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#64748b" font-family="var(--font-body)">${e.icon} ${e.shortLabel}</text>`;
        // Значение
        html += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#94a3b8" font-family="var(--font-display)">${e.value}</text>`;
    });

    svg.innerHTML = html;
}

// ── Achievements Grid ───────────────────────────────────────────────────────

function _renderAchievements(earnedBadges: Set<string>): void {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;

    grid.innerHTML = ACHIEVEMENTS_DEF.map(a => {
        const earned = earnedBadges.has(a.id);
        return `<div class="achievement-badge ${earned ? 'achievement-badge--earned' : ''}">
            <div class="achievement-badge-icon">${a.icon}</div>
            <div class="achievement-badge-info">
                <div class="achievement-badge-title">${a.title}</div>
                <div class="achievement-badge-desc">${a.desc}</div>
            </div>
            ${earned ? '<div class="achievement-badge-check">✓</div>' : ''}
        </div>`;
    }).join('');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _set(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

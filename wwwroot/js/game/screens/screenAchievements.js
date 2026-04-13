/**
 * screenAchievements.js — Достижения, Radar Chart и аналитика прогресса
 */
import { getStore } from '../stateManager.js';

// ── Определения направлений ─────────────────────────────────────────────────

const DIRS = [
    { key: 'it',      label: 'IT',          color: '#4fc3f7', emoji: '💻' },
    { key: 'bio',     label: 'Биотех',      color: '#4ade80', emoji: '🧬' },
    { key: 'math',    label: 'Математика',  color: '#fbbf24', emoji: '📐' },
    { key: 'design',  label: 'Дизайн',      color: '#f472b6', emoji: '🎨' },
    { key: 'eco',     label: 'Экология',    color: '#34d399', emoji: '🌿' },
    { key: 'med',     label: 'Медицина',    color: '#f87171', emoji: '⚕' },
    { key: 'physics', label: 'Физика',      color: '#a78bfa', emoji: '⚛' },
    { key: 'neuro',   label: 'Нейронауки',  color: '#c084fc', emoji: '🧠' },
];

// ── Определения достижений ──────────────────────────────────────────────────

const ACHIEVEMENTS_DEF = [
    { id: 'first-scan',       icon: '🔭', title: 'Первый сканер',      desc: 'Запустил первое сканирование туманности.' },
    { id: 'first-planet',     icon: '🌍', title: 'Первое открытие',    desc: 'Открыл свою первую профессию-планету.' },
    { id: 'minigame-3',       icon: '🎮', title: 'Мини-игрок',         desc: 'Прошёл 3 мини-игры.' },
    { id: 'crystals-100',     icon: '💎', title: 'Коллекционер',       desc: 'Собрал 100 кристаллов суммарно.' },
    { id: 'perfect-run',      icon: '⭐', title: 'Идеальная посадка',  desc: 'Набрал максимум очков в мини-игре.' },
    { id: 'speed-master',     icon: '⚡', title: 'Мастер скорости',    desc: 'Прошёл мини-игру быстро с высоким счётом.' },
    { id: 'all-cats',         icon: '🌌', title: 'Ренессансный ум',    desc: 'Собирал кристаллы во всех 8 направлениях.' },
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

export async function init(store) {
    const player  = store.player ?? {};
    const badges  = new Set(player.badges ?? []);
    const crystals = player.crystals ?? {};
    const stats   = player.stats ?? {};
    const planets = (player.discoveredPlanets ?? []).length;

    // Статистика
    _set('stat-planets',         String(planets));
    _set('stat-scans',           String(stats.scans ?? 0));
    _set('stat-minigames',       String(stats.miniGamesPlayed ?? 0));
    _set('stat-flights',         String(stats.flights ?? 0));

    const totalCr = Object.values(crystals).reduce((a, b) => a + b, 0);
    _set('stat-total-crystals', String(stats.totalCrystalsEarned ?? totalCr));

    // Авто-выдача достижений на основе прогресса
    _autoCheckAchievements(player, badges);

    // Рендер
    _renderRadarChart(crystals);
    _renderActivityChart(crystals);
    _renderAchievements(badges);
}

export function destroy() {
}

// ── Авто-проверка достижений ────────────────────────────────────────────────

function _autoCheckAchievements(player, badges) {
    const stats   = player.stats ?? {};
    const crystals = player.crystals ?? {};
    const planets = (player.discoveredPlanets ?? []).length;
    const totalCr = Object.values(crystals).reduce((a, b) => a + b, 0);
    const catsWithCrystals = Object.keys(crystals).filter(k => crystals[k] > 0).length;

    if (stats.scans > 0)           badges.add('first-scan');
    if (planets > 0)               badges.add('first-planet');
    if (planets >= 5)              badges.add('explorer-5');
    if ((stats.miniGamesPlayed ?? 0) >= 3) badges.add('minigame-3');
    if (totalCr >= 100)            badges.add('crystals-100');
    if (catsWithCrystals >= 8)     badges.add('all-cats');
    if ((stats.flights ?? 0) >= 10) badges.add('flight-10');
    if ((player.appliedUpgrades ?? []).length > 0) badges.add('upgrade-1');
}

// ── Radar Chart (SVG) ───────────────────────────────────────────────────────

function _renderRadarChart(crystals) {
    const svg = document.getElementById('radar-chart');
    if (!svg) return;

    const cx = 200, cy = 200, maxR = 150;
    const n = DIRS.length;
    const angleStep = (Math.PI * 2) / n;

    // Максимальное значение для нормализации
    const values = DIRS.map(d => crystals[d.key] ?? 0);
    const max = Math.max(...values, 1);

    let html = '';

    // Концентрические кольца (фон)
    for (let ring = 1; ring <= 4; ring++) {
        const r = (ring / 4) * maxR;
        const pts = [];
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
        const lx = cx + Math.cos(angle) * (maxR + 22);
        const ly = cy + Math.sin(angle) * (maxR + 22);
        html += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" 
                       font-size="11" fill="${DIRS[i].color}" font-family="var(--font-display)">${DIRS[i].emoji} ${DIRS[i].label}</text>`;
    }

    // Полигон данных
    const dataPts = [];
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
        html += `<circle cx="${px}" cy="${py}" r="4" fill="${DIRS[i].color}" stroke="#020612" stroke-width="2"/>`;

        // Значения
        if (values[i] > 0) {
            const vx = cx + Math.cos(angle) * (r + 14);
            const vy = cy + Math.sin(angle) * (r + 14);
            html += `<text x="${vx}" y="${vy}" text-anchor="middle" dominant-baseline="middle" 
                           font-size="10" fill="#94a3b8" font-family="var(--font-display)">${values[i]}</text>`;
        }
    }

    svg.innerHTML = html;
}

// ── Bar Chart ───────────────────────────────────────────────────────────────

function _renderActivityChart(crystals) {
    const svg = document.getElementById('activity-chart');
    if (!svg) return;

    const entries = DIRS.map(d => ({ ...d, value: crystals[d.key] ?? 0 }));
    const max = Math.max(...entries.map(e => e.value), 1);
    const w = 600, h = 140, padding = 12;
    const barW = Math.floor((w - padding * 2) / entries.length) - 6;

    let html = '';

    entries.forEach((e, i) => {
        const barH = Math.max(4, Math.round(((h - 40 - padding) * e.value) / max));
        const x = padding + i * (barW + 6);
        const y = h - 28 - barH;

        // Бар с градиентом
        html += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${e.color}" opacity="0.8"/>`;
        // Подпись направления
        html += `<text x="${x + barW / 2}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#64748b" font-family="var(--font-body)">${e.emoji}</text>`;
        // Значение
        html += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="var(--font-display)">${e.value}</text>`;
    });

    svg.innerHTML = html;
}

// ── Achievements Grid ───────────────────────────────────────────────────────

function _renderAchievements(earnedBadges) {
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

function _set(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

/**
 * screenAchievements.ts — Прогресс навигатора
 *
 * Radar Chart + Crystal Progress Bars + Achievement Badges + Rank System
 */

import { getStore, dispatch } from '../stateManager.js';
import { GameStore, CrystalType, PlayerState } from '../types.js';
import { CLUSTERS } from '../clusterConfig.js';

// ── Определения достижений ──────────────────────────────────────────────────

interface AchievementDef {
    id: string;
    icon: string;
    title: string;
    desc: string;
}

const ACHIEVEMENTS_DEF: readonly AchievementDef[] = [
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

// ── Ранги ────────────────────────────────────────────────────────────────────

interface Rank {
    key: string;
    label: string;
    minCrystals: number;
}

// Отсортирован по убыванию minCrystals — find() возвращает наивысший достигнутый ранг
const RANKS: readonly Rank[] = [
    { key: 'admiral',   label: 'Адмирал',    minCrystals: 300 },
    { key: 'captain',   label: 'Капитан',    minCrystals: 150 },
    { key: 'navigator', label: 'Навигатор',  minCrystals: 50  },
    { key: 'cadet',     label: 'Кадет',      minCrystals: 0   },
].slice().sort((a, b) => b.minCrystals - a.minCrystals);

function _getRank(totalCrystals: number): Rank {
    return RANKS.find(r => totalCrystals >= r.minCrystals) ?? RANKS[RANKS.length - 1];
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function _escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _set(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

interface PlayerStats {
    miniGamesPlayed?: number;
    flights?: number;
    totalCrystalsEarned?: number;
    scans?: number;
    [key: string]: number | undefined;
}

interface PlayerSnapshot {
    name?: string;
    badges?: string[];
    crystals?: Partial<Record<CrystalType, number>>;
    stats?: PlayerStats;
    discoveredPlanets?: string[];
    appliedUpgrades?: string[];
}

interface AggregatedTotals {
    totalCr: number;
    clustersWithCrystals: number;
    planetsCount: number;
}

function _aggregate(player: PlayerSnapshot): AggregatedTotals {
    const crystals = player.crystals ?? {};
    const totalCr = (Object.values(crystals) as number[]).reduce((a, b) => a + (b ?? 0), 0);
    const clustersWithCrystals = CLUSTERS.filter(c => (crystals[c.crystalType] ?? 0) > 0).length;
    const planetsCount = (player.discoveredPlanets ?? []).length;
    return { totalCr, clustersWithCrystals, planetsCount };
}

// ── Жизненный цикл ──────────────────────────────────────────────────────────

let _previousTitle: string | null = null;
let _cleanupListeners: Array<() => void> = [];
let _hasMounted = false;

export async function init(store: Readonly<GameStore>): Promise<void> {
    _previousTitle = document.title;
    document.title = 'Прогресс — Stellar Vocation';

    const player = (store.player ?? {}) as PlayerSnapshot;
    const badges = new Set(player.badges ?? []);
    const crystals = player.crystals ?? {};
    const stats = player.stats ?? {};
    const totals = _aggregate(player);

    // Статы
    _set('stat-planets',        String(totals.planetsCount));
    _set('stat-minigames',      String(stats.miniGamesPlayed ?? 0));
    _set('stat-flights',        String(stats.flights ?? 0));
    _set('stat-total-crystals', String(stats.totalCrystalsEarned ?? totals.totalCr));

    // Имя и ранг
    _set('ach-player-name', player.name || 'Навигатор');
    const rank = _getRank(stats.totalCrystalsEarned ?? totals.totalCr);
    const rankEl = document.getElementById('ach-rank');
    if (rankEl) {
        rankEl.textContent = rank.label;
        rankEl.setAttribute('data-rank', rank.key);
    }

    // Авто-проверка достижений с persist в стор
    _autoCheckAchievements(player, badges, totals);

    // Render
    _renderCrystalBars(crystals);
    _renderRadarChart(crystals);
    _renderAchievements(badges);

    // Счётчик
    const earned = ACHIEVEMENTS_DEF.filter(a => badges.has(a.id)).length;
    _set('ach-counter', `${earned} / ${ACHIEVEMENTS_DEF.length}`);

    // Stagger анимация — только при первом монтировании за сессию
    if (_hasMounted) {
        document.querySelectorAll('.ach-stat-appear').forEach(el => el.classList.add('ach-no-stagger'));
    }
    _hasMounted = true;

    // Обработчики
    _bindActions();
}

export function destroy(): void {
    if (_previousTitle !== null) {
        document.title = _previousTitle;
        _previousTitle = null;
    }
    _cleanupListeners.forEach(fn => fn());
    _cleanupListeners = [];

    const grid = document.getElementById('achievements-grid');
    if (grid) grid.innerHTML = '';
    const bars = document.getElementById('ach-crystal-bars');
    if (bars) bars.innerHTML = '';
    const svg = document.getElementById('radar-chart');
    if (svg) {
        // Сохраняем title/desc внутри svg
        svg.querySelectorAll(':scope > :not(title):not(desc)').forEach(n => n.remove());
    }
}

// ── Обработчики через делегирование ─────────────────────────────────────────

function _bindActions(): void {
    const exportBtn = document.querySelector<HTMLButtonElement>('[data-action="export-stats"]');
    if (exportBtn) {
        const handler = (): void => _exportStats();
        exportBtn.addEventListener('click', handler);
        _cleanupListeners.push(() => exportBtn.removeEventListener('click', handler));
    }
}

function _exportStats(): void {
    const store = getStore();
    const data = {
        player: store.player,
        exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stellar-vocation-stats-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Откладываем revoke, чтобы браузер успел инициировать загрузку
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ── Авто-проверка достижений (с persist) ────────────────────────────────────

function _autoCheckAchievements(
    player: PlayerSnapshot,
    badges: Set<string>,
    totals: AggregatedTotals
): void {
    const stats = player.stats ?? {};
    const newBadges: string[] = [];

    const tryAdd = (id: string, condition: boolean): void => {
        if (condition && !badges.has(id)) {
            badges.add(id);
            newBadges.push(id);
        }
    };

    tryAdd('first-scan',   (stats.scans ?? 0) > 0);
    tryAdd('first-planet', totals.planetsCount > 0);
    tryAdd('explorer-5',   totals.planetsCount >= 5);
    tryAdd('minigame-3',   (stats.miniGamesPlayed ?? 0) >= 3);
    tryAdd('crystals-100', totals.totalCr >= 100);
    tryAdd('all-clusters', totals.clustersWithCrystals >= CLUSTERS.length);
    tryAdd('flight-10',    (stats.flights ?? 0) >= 10);
    tryAdd('upgrade-1',    (player.appliedUpgrades ?? []).length > 0);

    // Персистим новые ачивки в стор
    for (const badge of newBadges) {
        dispatch('ADD_BADGE', { badge });
    }
}

// ── Crystal Progress Bars ───────────────────────────────────────────────────

function _renderCrystalBars(crystals: Partial<Record<CrystalType, number>>): void {
    const container = document.getElementById('ach-crystal-bars');
    if (!container) return;

    const entries = CLUSTERS.map(c => ({
        colorHex: c.colorHex,
        icon: c.icon,
        shortLabel: c.shortLabel,
        value: crystals[c.crystalType] ?? 0,
    }));
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;

    container.innerHTML = entries.map(e => {
        const pct = Math.round((e.value / total) * 100);
        const label = _escapeHtml(`${e.icon} ${e.shortLabel}`);
        const color = _escapeHtml(e.colorHex);
        return `<div class="ach-crystal-row">
            <div class="ach-crystal-header">
                <span class="ach-crystal-name" style="color:${color};">${label}</span>
                <span>
                    <span class="ach-crystal-count">${e.value}</span>
                    <span class="ach-crystal-pct">(${pct}%)</span>
                </span>
            </div>
            <div class="ach-crystal-track"
                 role="progressbar"
                 aria-label="${_escapeHtml(e.shortLabel)}: ${pct}%"
                 aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                <div class="ach-crystal-fill"
                     style="--bar-color:${color}; --target-width:${pct}%; background:linear-gradient(90deg, ${color}, ${color}cc);"></div>
            </div>
        </div>`;
    }).join('');
}

// ── Radar Chart (SVG) ───────────────────────────────────────────────────────

function _renderRadarChart(crystals: Partial<Record<CrystalType, number>>): void {
    const svg = document.getElementById('radar-chart');
    if (!svg) return;

    const cx = 200, cy = 200, maxR = 150;
    const n = CLUSTERS.length;
    const angleStep = (Math.PI * 2) / n;

    const values = CLUSTERS.map(c => crystals[c.crystalType] ?? 0);
    const max = Math.max(...values, 1);

    let html = '';

    // Концентрические кольца
    for (let ring = 1; ring <= 4; ring++) {
        const r = (ring / 4) * maxR;
        const pts: string[] = [];
        for (let i = 0; i < n; i++) {
            const angle = i * angleStep - Math.PI / 2;
            pts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
        }
        html += `<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(79,195,247,0.08)" stroke-width="1"/>`;
    }

    // Оси + подписи
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const ex = cx + Math.cos(angle) * maxR;
        const ey = cy + Math.sin(angle) * maxR;
        html += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="rgba(79,195,247,0.1)" stroke-width="1"/>`;

        const lx = cx + Math.cos(angle) * (maxR + 28);
        const ly = cy + Math.sin(angle) * (maxR + 28);
        const label = _escapeHtml(`${CLUSTERS[i].icon} ${CLUSTERS[i].shortLabel}`);
        const color = _escapeHtml(CLUSTERS[i].colorHex);
        html += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                       font-size="12" fill="${color}" font-family="var(--font-display)">${label}</text>`;
    }

    // Полигон данных
    const dataPts: string[] = [];
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const v = values[i] / max;
        const r = v * maxR;
        dataPts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
    }

    html += `<defs>
        <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4fc3f7" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#818cf8" stop-opacity="0.3"/>
        </linearGradient>
    </defs>`;

    html += `<polygon points="${dataPts.join(' ')}" fill="url(#radarGrad)" stroke="#4fc3f7" stroke-width="2" stroke-linejoin="round"/>`;

    // Точки + значения
    for (let i = 0; i < n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const v = values[i] / max;
        const r = v * maxR;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        const color = _escapeHtml(CLUSTERS[i].colorHex);
        html += `<circle cx="${px}" cy="${py}" r="5" fill="${color}" stroke="#020612" stroke-width="2"/>`;

        if (values[i] > 0) {
            const vx = cx + Math.cos(angle) * (r + 16);
            const vy = cy + Math.sin(angle) * (r + 16);
            html += `<text x="${vx}" y="${vy}" text-anchor="middle" dominant-baseline="middle"
                           font-size="11" fill="#94a3b8" font-family="var(--font-display)">${values[i]}</text>`;
        }
    }

    // Сохраняем существующие title/desc, заменяем только графику
    const existingMeta = svg.querySelectorAll(':scope > title, :scope > desc');
    svg.innerHTML = html;
    existingMeta.forEach(node => svg.insertBefore(node, svg.firstChild));
}

// ── Achievements Grid ───────────────────────────────────────────────────────

function _renderAchievements(earnedBadges: Set<string>): void {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;

    grid.innerHTML = ACHIEVEMENTS_DEF.map(a => {
        const earned = earnedBadges.has(a.id);
        const stateClass = earned ? 'ach-badge--earned' : 'ach-badge--locked';
        const statusText = earned ? 'Получено' : 'Не получено';
        const statusIcon = earned
            ? '<span class="ach-badge-check" aria-hidden="true">✓</span>'
            : '<span class="ach-badge-lock" aria-hidden="true">🔒</span>';
        return `<li class="col">
            <article class="ach-badge ${stateClass}"
                     aria-label="${_escapeHtml(a.title)}. ${_escapeHtml(a.desc)} ${statusText}.">
                <div class="ach-badge-icon" aria-hidden="true">${_escapeHtml(a.icon)}</div>
                <div class="ach-badge-info">
                    <div class="ach-badge-title">${_escapeHtml(a.title)}</div>
                    <div class="ach-badge-desc">${_escapeHtml(a.desc)}</div>
                </div>
                <div class="ach-badge-status">
                    ${statusIcon}
                    <span class="visually-hidden">${statusText}</span>
                </div>
            </article>
        </li>`;
    }).join('');
}

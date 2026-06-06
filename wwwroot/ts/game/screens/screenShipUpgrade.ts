/**
 * screenShipUpgrade.ts — Мастерская корабля (modern shipyard)
 *
 * Категории апгрейдов: engine / shield / scanner / capacity.
 * Каждая категория рендерится как «трек» — горизонтальная сетка карточек по уровням.
 */

import { getStore, dispatch, computeShipStats } from '../stateManager.js';
import { GameStore, CrystalType, UpgradeDto } from '../types.js';
import { playSfx } from '../audioManager.js';

// ── Метаданные ──────────────────────────────────────────────────────────────

const CRYSTAL_META: Record<string, { emoji: string; label: string; color: string }> = {
    programming: { emoji: '💎', label: 'Программирование', color: '#4fc3f7' },
    medicine:    { emoji: '❤️', label: 'Медицина',         color: '#f87171' },
    geology:     { emoji: '🌿', label: 'Геология',         color: '#34d399' },
};

interface CategoryMeta {
    title: string;
    sub: string;
    icon: string;
    color: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
    engine:   { title: 'Двигатель', sub: 'Маневренность и скорость пролёта',  icon: '🚀', color: '#4fc3f7' },
    shield:   { title: 'Щиты',      sub: 'Запас прочности при столкновениях', icon: '🛡', color: '#a78bfa' },
    scanner:  { title: 'Сканер',    sub: 'Радиус притяжения кристаллов',      icon: '🔭', color: '#5eead4' },
    capacity: { title: 'Трюм',      sub: 'Ёмкость кристаллов за полёт',       icon: '💎', color: '#fb923c' },
};

const TIER_ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// Базовые значения для расчёта прогресс-баров (соответствуют BASE_SHIP_STATS в stateManager)
const BASE_STATS = { speedBonus: 0, shieldBonus: 0, scanRange: 1, capacity: 20 } as const;

// ── Глобальный API ──────────────────────────────────────────────────────────

interface UpgradeCost { [key: string]: number; }

window._shipUpgrade = {
    buyUpgrade(upgradeId: string) {
        const store = getStore();
        const upgrade = ((store.sessionData?.upgrades ?? []) as UpgradeDto[]).find(u => u.id === upgradeId);
        if (!upgrade) return;

        if ((store.player?.appliedUpgrades ?? []).includes(upgradeId)) return;

        const cost: UpgradeCost = (upgrade as unknown as { cost: UpgradeCost }).cost ?? {};
        const crystals = store.player?.crystals ?? {};

        for (const [type, needed] of Object.entries(cost)) {
            const have = (crystals as Record<string, number>)[type] ?? 0;
            if (have < (needed as number)) {
                const meta = CRYSTAL_META[type];
                (window as any).showNotification(`Недостаточно кристаллов ${meta?.label ?? type}. Нужно: ${needed}, есть: ${have}.`, 'error');
                return;
            }
        }

        dispatch('SPEND_CRYSTALS', { spent: cost as Record<CrystalType, number> });
        dispatch('APPLY_UPGRADE', { upgradeId });

        playSfx('upgrade_buy');

        // Полный перерендер карточек — состояния могут поменяться у соседних
        const updatedStore = getStore();
        _renderUpgrades(
            (updatedStore.sessionData?.upgrades ?? []) as UpgradeDto[],
            new Set(updatedStore.player?.appliedUpgrades ?? []),
            updatedStore.player?.crystals ?? {}
        );
        _updateStats();
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    const upgrades = (store.sessionData?.upgrades ?? []) as UpgradeDto[];
    const installed = new Set(store.player?.appliedUpgrades ?? []);

    _renderUpgrades(upgrades, installed, store.player?.crystals ?? {});
    _updateStats();
}

let _carouselObserver: IntersectionObserver | null = null;
let _carouselDotHandlers: Array<{ el: HTMLElement; fn: EventListener }> = [];
let _activeTrackCategory = 'engine';

export function destroy(): void {
    if (_carouselObserver) {
        _carouselObserver.disconnect();
        _carouselObserver = null;
    }
    _carouselDotHandlers.forEach(h => h.el.removeEventListener('click', h.fn));
    _carouselDotHandlers = [];
}

/** Настраивает поведение карусели на мобиле: клик по точке → плавный скролл к
 *  соответствующему треку; IntersectionObserver → активная точка отражает,
 *  какой трек сейчас в кадре. На десктопе скролл не активен (треки stacked),
 *  но обработчики безвредны и облегчают возможный resize. */
function _setActiveTrack(index: number, shouldScroll = false): void {
    const strip = document.querySelector('.ship-tracks-strip') as HTMLElement | null;
    if (!strip) return;

    const tracks = Array.from(strip.querySelectorAll<HTMLElement>('.ship-track'));
    const dots = Array.from(document.querySelectorAll<HTMLElement>('.ship-tracks-dot'));
    const target = tracks[index];
    if (!target) return;

    const category = target.dataset.trackCategory;
    if (category) _activeTrackCategory = category;

    tracks.forEach((track, i) => {
        if (i === index) track.dataset.active = 'true';
        else delete track.dataset.active;
    });
    dots.forEach((dot, i) => {
        dot.setAttribute('aria-pressed', i === index ? 'true' : 'false');
        if (i === index) dot.dataset.active = 'true';
        else delete dot.dataset.active;
    });

    if (shouldScroll) {
        target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
}

function _setupCarousel(): void {
    // Отписываемся от предыдущей итерации (если render вызвался повторно)
    if (_carouselObserver) { _carouselObserver.disconnect(); _carouselObserver = null; }
    _carouselDotHandlers.forEach(h => h.el.removeEventListener('click', h.fn));
    _carouselDotHandlers = [];

    const strip = document.querySelector('.ship-tracks-strip') as HTMLElement | null;
    const dots  = Array.from(document.querySelectorAll<HTMLElement>('.ship-tracks-dot'));
    if (!strip || dots.length === 0) return;

    const tracks = Array.from(strip.querySelectorAll<HTMLElement>('.ship-track'));
    const activeIndex = Math.max(0, tracks.findIndex(t => t.dataset.trackCategory === _activeTrackCategory));
    _setActiveTrack(activeIndex, false);

    // Клик по точке — скролл к треку
    dots.forEach((dot, i) => {
        const fn: EventListener = () => _setActiveTrack(i, true);
        dot.addEventListener('click', fn);
        _carouselDotHandlers.push({ el: dot, fn });
    });

    // Активная точка по тому, какой трек сейчас более чем наполовину в кадре strip'а.
    _carouselObserver = new IntersectionObserver(entries => {
        // Берём самую «видимую» секцию из всех пересечений в этом батче.
        let bestIdx = -1, bestRatio = 0;
        entries.forEach(e => {
            if (e.intersectionRatio > bestRatio) {
                bestRatio = e.intersectionRatio;
                bestIdx = tracks.indexOf(e.target as HTMLElement);
            }
        });
        if (bestIdx >= 0 && bestRatio >= 0.5) {
            dots.forEach((d, i) => {
                if (i === bestIdx) d.dataset.active = 'true';
                else delete d.dataset.active;
            });
        }
    }, { root: strip, threshold: [0.5, 0.75] });

    tracks.forEach(t => _carouselObserver!.observe(t));
}

// ── Рендер треков и карточек ────────────────────────────────────────────────

function _renderUpgrades(
    upgrades: UpgradeDto[],
    installed: Set<string>,
    crystals: Partial<Record<CrystalType, number>>
): void {
    const tree = document.getElementById('upgrade-tree');
    if (!tree || upgrades.length === 0) return;

    // Группируем по категории и сортируем внутри по суммарной стоимости (= уровень)
    const groups: Record<string, UpgradeDto[]> = {};
    upgrades.forEach(u => { (groups[u.category] ??= []).push(u); });
    Object.values(groups).forEach(arr => arr.sort((a, b) => _totalCost(a) - _totalCost(b)));

    // Порядок треков: engine → shield → scanner → capacity
    const order = ['engine', 'shield', 'scanner', 'capacity'];
    const cats = order.filter(c => groups[c]?.length);
    if (!cats.includes(_activeTrackCategory)) {
        _activeTrackCategory = cats[0] ?? 'engine';
    }

    const stripHtml = cats.map((cat, i) => _renderTrack(cat, groups[cat], installed, crystals, i)).join('');
    const dotsHtml = cats.map((cat, i) => {
        const meta = CATEGORY_META[cat] ?? { title: cat, sub: '', icon: '⚙', color: '#4fc3f7' } as CategoryMeta;
        const active = cat === _activeTrackCategory;
        return `<button type="button" class="ship-tracks-dot"
                        data-track-dot="${i}"
                        data-track-category="${_escape(cat)}"
                        ${active ? 'data-active="true"' : ''}
                        style="--dot-color:${meta.color};"
                        aria-pressed="${active ? 'true' : 'false'}"
                        aria-label="${_escape(meta.title)}"
                        title="${_escape(meta.title)}">
                    <span class="ship-tracks-dot-icon" aria-hidden="true">${meta.icon}</span>
                    <span class="ship-tracks-dot-label">${_escape(meta.title)}</span>
                </button>`;
    }).join('');

    tree.innerHTML = `
        <div class="ship-tracks-strip">${stripHtml}</div>
        <div class="ship-tracks-dots" role="tablist" aria-label="Категории апгрейдов">${dotsHtml}</div>
    `;

    // Общий счётчик апгрейдов
    const counter = document.getElementById('ship-progress-counter');
    if (counter) {
        const total = upgrades.length;
        counter.textContent = `${installed.size} / ${total}`;
    }

    _setupCarousel();
}

function _renderTrack(
    cat: string,
    items: UpgradeDto[],
    installed: Set<string>,
    crystals: Partial<Record<CrystalType, number>>,
    index: number
): string {
    const meta = CATEGORY_META[cat] ?? { title: cat.toUpperCase(), sub: '', icon: '⚙', color: '#4fc3f7' };
    const installedInCat = items.filter(u => installed.has(u.id)).length;
    const total = items.length;

    const dots = items.map((_, i) =>
        `<span class="ship-track-dot${i < installedInCat ? ' ship-track-dot--filled' : ''}"></span>`
    ).join('');

    const cards = items.map((u, i) => _upgradeCard(u, i, cat, installed.has(u.id), crystals)).join('');

    return `
        <section class="ship-track"
                 data-track-category="${_escape(cat)}"
                 data-track-index="${index}"
                 ${cat === _activeTrackCategory ? 'data-active="true"' : ''}
                 style="--cat-color:${meta.color};">
            <header class="ship-track-head">
                <div class="ship-track-head-info">
                    <span class="ship-track-icon" aria-hidden="true">${meta.icon}</span>
                    <div>
                        <h2 class="ship-track-title">${_escape(meta.title)}</h2>
                        <p class="ship-track-sub">${_escape(meta.sub)}</p>
                    </div>
                </div>
                <div class="ship-track-progress">
                    <span class="ship-track-progress-dots" aria-hidden="true">${dots}</span>
                    <span>${installedInCat} / ${total}</span>
                </div>
            </header>
            <div class="ship-track-cards">${cards}</div>
        </section>
    `;
}

function _upgradeCard(
    u: UpgradeDto,
    tierIndex: number,
    cat: string,
    isInstalled: boolean,
    crystals: Partial<Record<CrystalType, number>>
): string {
    const meta = CATEGORY_META[cat] ?? { color: '#4fc3f7' } as CategoryMeta;
    const tier = TIER_ROMAN[tierIndex] ?? String(tierIndex + 1);

    const eff = u.effect ?? {};
    const effChips = [
        eff.speedBonus  ? `⚡ +${eff.speedBonus}%`         : '',
        eff.shieldBonus ? `🛡 +${eff.shieldBonus}%`        : '',
        eff.scanRange   ? `🔭 +${eff.scanRange}`           : '',
        eff.capacity    ? `💎 +${eff.capacity} к ёмкости`  : '',
    ].filter(Boolean);
    const effHtml = effChips.length
        ? `<span class="ship-up-effect">${_escape(effChips.join(' • '))}</span>`
        : '';

    // Стоимость
    const cost = (u as unknown as { cost: Record<string, number> }).cost ?? {};
    const costChips = Object.entries(cost).map(([type, needed]) => {
        const cm = CRYSTAL_META[type] ?? { emoji: '💎', label: type, color: '#888' };
        const have = (crystals as Record<string, number>)[type] ?? 0;
        const ok = have >= (needed as number);
        return `<span class="ship-cost-chip" data-ok="${ok}" style="--chip-color:${cm.color};" title="${_escape(cm.label)}: ${have} / ${needed}">${cm.emoji} ${needed}</span>`;
    }).join('');

    const canAfford = Object.entries(cost).every(([type, needed]) =>
        ((crystals as Record<string, number>)[type] ?? 0) >= (needed as number));

    // Состояние карточки
    let cardState: string;
    let btnState: 'buy' | 'locked' | 'installed';
    let btnText: string;
    let btnDisabled = false;
    if (isInstalled) {
        cardState = 'ship-up--installed';
        btnState = 'installed';
        btnText = '✓ Установлен';
        btnDisabled = true;
    } else if (canAfford) {
        cardState = 'ship-up--available';
        btnState = 'buy';
        btnText = 'Купить';
    } else {
        cardState = 'ship-up--locked';
        btnState = 'locked';
        btnText = '🔒 Недостаточно';
        btnDisabled = true;
    }

    return `
        <article class="ship-up ${cardState}" style="--cat-color:${meta.color};">
            <div class="ship-up-head">
                <div class="ship-up-title-wrap">
                    <span class="ship-up-tier">Уровень ${tier}</span>
                    <span class="ship-up-name">${_escape(u.name)}</span>
                </div>
                <span class="ship-up-badge" aria-hidden="true">${tier}</span>
            </div>
            <p class="ship-up-desc">${_escape(u.description)}</p>
            ${effHtml}
            <div class="ship-up-cost">${costChips}</div>
            <button id="upgrade-btn-${_escape(u.id)}"
                    type="button"
                    class="ship-up-btn"
                    data-state="${btnState}"
                    ${btnDisabled ? 'disabled' : `data-action="shipUpgrade.buyUpgrade" data-arg="${_escape(u.id)}"`}>
                ${btnText}
            </button>
        </article>
    `;
}

// ── Обновление статов ───────────────────────────────────────────────────────

function _updateStats(): void {
    const store = getStore();
    const all = (store.sessionData?.upgrades ?? []) as UpgradeDto[];
    const stats = computeShipStats(store.player?.appliedUpgrades ?? [], all);

    // Максимально достижимые значения (если установить ВСЕ апгрейды категории)
    const max = _computeMaxStats(all);

    _set('ship-stat-speed', `${100 + stats.speedBonus}%`);
    _set('ship-stat-shield', `${100 + stats.shieldBonus}%`);
    _set('ship-stat-scanner', String(stats.scanRange));
    _set('ship-stat-capacity', String(stats.capacity));

    _set('ship-stat-speed-cap',    `/ ${100 + max.speedBonus}%`);
    _set('ship-stat-shield-cap',   `/ ${100 + max.shieldBonus}%`);
    _set('ship-stat-scanner-cap',  `/ ${max.scanRange}`);
    _set('ship-stat-capacity-cap', `/ ${max.capacity}`);

    // Прогресс-бары: текущий бонус / максимально возможный бонус (исключая базу)
    _setFill('ship-stat-speed-fill',    _pctOfMax(stats.speedBonus,  max.speedBonus));
    _setFill('ship-stat-shield-fill',   _pctOfMax(stats.shieldBonus, max.shieldBonus));
    _setFill('ship-stat-scanner-fill',  _pctOfMax(stats.scanRange - BASE_STATS.scanRange, max.scanRange - BASE_STATS.scanRange));
    _setFill('ship-stat-capacity-fill', _pctOfMax(stats.capacity - BASE_STATS.capacity, max.capacity - BASE_STATS.capacity));
}

function _computeMaxStats(upgrades: UpgradeDto[]): { speedBonus: number; shieldBonus: number; scanRange: number; capacity: number } {
    const m = { ...BASE_STATS };
    for (const u of upgrades) {
        const e = u.effect ?? {};
        m.speedBonus  += e.speedBonus  ?? 0;
        m.shieldBonus += e.shieldBonus ?? 0;
        m.scanRange   += e.scanRange   ?? 0;
        m.capacity    += e.capacity    ?? 0;
    }
    return m;
}

function _pctOfMax(current: number, max: number): number {
    if (max <= 0) return 0;
    return Math.max(0, Math.min(100, (current / max) * 100));
}

function _totalCost(u: UpgradeDto): number {
    const cost = (u as unknown as { cost: Record<string, number> }).cost ?? {};
    return Object.values(cost).reduce((s, n) => s + (n ?? 0), 0);
}

// ── Утилиты ─────────────────────────────────────────────────────────────────

function _set(id: string, v: string): void {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
}

function _setFill(id: string, pct: number): void {
    const e = document.getElementById(id);
    if (e) (e as HTMLElement).style.width = `${pct}%`;
}

function _escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

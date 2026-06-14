/**
 * flightUi.ts — Обновление пользовательского интерфейса экрана полёта
 */

import { CRYSTAL_COLORS } from '../clusterConfig.js';
import { CrystalType, GameSettingsDto } from '../types.js';
import { getDevice } from '../deviceProfile.js';

// ── Control hints ──────────────────────────────────────────────────────────

/** Преобразует KeyboardEvent.code в читаемую метку клавиши. */
function _formatKey(code: string): string {
    if (!code) return '?';
    if (code === 'Space') return 'Space';
    if (code.startsWith('Key'))   return code.substring(3);
    if (code.startsWith('Digit')) return code.substring(5);
    if (code.startsWith('Arrow')) return ({
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    } as Record<string, string>)[code] ?? code;
    return code;
}

/**
 * Рендерит блок подсказок управления исходя из схемы и горячих клавиш.
 * Динамически подстраивается под controlScheme и keybindings.
 */
export function renderControlHints(settings: Partial<GameSettingsDto> | null): void {
    const host = document.getElementById('flight-hints');
    if (!host) return;

    const dev    = getDevice();
    const scheme = settings?.controlScheme ?? (dev.isTouch ? 'mouse' : 'keyboard');
    const kb     = settings?.keybindings ?? {
        up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'Space',
    };

    let html: string;
    if (dev.isTouch && scheme !== 'keyboard') {
        // Тач / мышь
        html = `
            <div class="flight-hint-row"><kbd>↑↓←→</kbd><span>Свайп — манёвр</span></div>
            <div class="flight-hint-row"><kbd>TAP</kbd><span>Тап — ускорение</span></div>
        `;
    } else if (scheme === 'mouse') {
        // Десктоп с мышью
        html = `
            <div class="flight-hint-row"><kbd>🖱</kbd><span>Курсор — манёвр</span></div>
            <div class="flight-hint-row"><kbd>${_formatKey(kb.boost)}</kbd><span>Ускорение</span></div>
        `;
    } else {
        // Клавиатура — фактические биндинги
        const up    = _formatKey(kb.up);
        const left  = _formatKey(kb.left);
        const down  = _formatKey(kb.down);
        const right = _formatKey(kb.right);
        const boost = _formatKey(kb.boost);
        html = `
            <div class="flight-hint-row">
                <kbd>${up}</kbd><kbd>${left}</kbd><kbd>${down}</kbd><kbd>${right}</kbd>
                <span>Манёвр</span>
            </div>
            <div class="flight-hint-row"><kbd>${boost}</kbd><span>Ускорение</span></div>
        `;
    }

    host.innerHTML = html;
}

/** Показать/скрыть hints (с плавной анимацией через .flight-hints--visible) */
export function setControlHintsVisible(visible: boolean): void {
    const host = document.getElementById('flight-hints');
    if (host) host.classList.toggle('flight-hints--visible', visible);
}

export interface FlightUiState {
    collected: number;
    capacity: number;
    shield: number;
    maxShield: number;
    energy: number;
    maxEnergy: number;
    currentWave: number;
    waveCount: number;
    elapsed: number;
    waveDurationS: number;
    combo: number;
    maxCombo: number;
    dodged: number;
    crystalType: CrystalType;
    /** LiveOps-множитель награды (crystal_flight_bonus); 1 = без бонуса. */
    bonusMult?: number;
    /** Итог с учётом бонуса — попадает в стор и на экран результатов. */
    totalEarned?: number;
    /** Потеряно кристаллов из-за переполнения трюма. */
    lost?: number;
}

export function updateHud(state: FlightUiState): void {
    _setText('flight-crystals-count', String(state.collected));
    const cap = document.getElementById('flight-capacity-label');
    if (cap) {
        cap.textContent = `/ ${state.capacity}`;
        cap.style.color = state.collected >= state.capacity ? '#f87171' : 'var(--color-text-muted)';
    }
    updateShieldBar(state.shield, state.maxShield);
    updateEnergyBar(state.energy, state.maxEnergy);
    updateWaveProgress(state.currentWave, state.waveCount, state.elapsed, state.waveDurationS);
}

const _ENERGY_CLASSES = ['flight-bar--energy-full', 'flight-bar--energy-mid', 'flight-bar--energy-low'];
const _SHIELD_CLASSES = ['flight-bar--healthy', 'flight-bar--warning', 'flight-bar--critical'];

function _applyState(bar: HTMLElement, classes: readonly string[], idx: number): void {
    for (let i = 0; i < classes.length; i++) {
        bar.classList.toggle(classes[i], i === idx);
    }
}

export function updateEnergyBar(energy: number, maxEnergy: number): void {
    const bar = document.getElementById('flight-energy-bar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (energy / maxEnergy) * 100));
    bar.style.width = `${pct}%`;
    _applyState(bar, _ENERGY_CLASSES, pct > 50 ? 0 : pct > 20 ? 1 : 2);
}

export function updateShieldBar(shield: number, maxShield: number): void {
    const bar = document.getElementById('flight-shield-bar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (shield / maxShield) * 100));
    bar.style.width = `${pct}%`;
    _applyState(bar, _SHIELD_CLASSES, pct > 60 ? 0 : pct > 30 ? 1 : 2);
}

export function updateWaveProgress(
    currentWave: number, 
    waveCount: number, 
    elapsed: number, 
    waveDurationS: number
): void {
    const bar = document.getElementById('flight-wave-bar');
    const label = document.getElementById('flight-wave-label');
    if (!bar) return;

    const waveElapsed = elapsed - currentWave * waveDurationS;
    const pct = Math.min(100, (waveElapsed / waveDurationS) * 100);
    bar.style.width = `${pct}%`;
    
    const colors = ['#4ade80', '#fbbf24', '#f87171'];
    bar.style.background = colors[currentWave] ?? colors[2];
    
    if (label) label.textContent = `Волна ${currentWave + 1}/${waveCount}`;
}

// ── Мини-радар и скорость ──────────────────────────────────────────────────

/** Структурный тип вместо THREE.Object3D — UI-модулю three не нужен. */
interface RadarObj { position: { x: number; y: number; z: number } }

const RADAR_RANGE_X = 30;  // мировых единиц на радиус радара по X
const RADAR_RANGE_Z = 80;  // и по Z (вперёд = вверх на радаре)

/** Рисует точки объектов вокруг корабля (вид сверху, корабль в центре). */
export function updateRadar(
    shipX: number,
    asteroids: readonly RadarObj[],
    crystals: readonly RadarObj[],
    bonuses: readonly RadarObj[],
    crystalCssColor: string
): void {
    const canvas = document.getElementById('flight-radar') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,10,26,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const plot = (objs: readonly RadarObj[], color: string, size: number): void => {
        ctx.fillStyle = color;
        for (let i = 0; i < objs.length; i++) {
            const p = objs[i].position;
            const px = cx + ((p.x - shipX) / RADAR_RANGE_X) * cx;
            const py = cy + (p.z / RADAR_RANGE_Z) * cy; // z<0 (впереди) → выше центра
            if (px < 2 || px > w - 2 || py < 2 || py > h - 2) continue;
            ctx.fillRect(px - size / 2, py - size / 2, size, size);
        }
    };
    plot(asteroids, '#94a3b8', 4);
    plot(crystals, crystalCssColor, 4);
    plot(bonuses, '#fbbf24', 5);

    // Корабль — в центре
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
}

/** Скорость в % от максимальной (с бустом может быть > 100%). */
export function updateSpeedIndicator(pct: number): void {
    const el = document.getElementById('flight-speed');
    if (!el) return;
    el.textContent = `${Math.round(pct)}%`;
    el.style.color = pct > 105 ? '#39ff14' : '';
}

export function updateComboDisplay(combo: number): void {
    const el = document.getElementById('flight-combo');
    if (!el) return;
    if (combo > 1) {
        el.textContent = `×${combo}`;
        el.classList.remove('hidden');
        el.style.transform = 'scale(1.3)';
        setTimeout(() => el.style.transform = 'scale(1)', 150);
    } else {
        el.classList.add('hidden');
    }
}

// Текстовые метки для каждого ранга — соответствуют data-rating CSS-переменным
const RATING_LABELS: Record<'S' | 'A' | 'B' | 'C', string> = {
    S: 'Превосходно',
    A: 'Отлично',
    B: 'Хорошо',
    C: 'Дебют',
};

function _computeRating(collected: number, shieldPct: number): 'S' | 'A' | 'B' | 'C' {
    if (collected >= 30 && shieldPct > 60) return 'S';
    if (collected >= 20 && shieldPct > 40) return 'A';
    if (collected >= 10) return 'B';
    return 'C';
}

function _setText(id: string, value: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

export function showResults(state: FlightUiState): void {
    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    const shieldPct = Math.round((state.shield / state.maxShield) * 100);
    const rating = _computeRating(state.collected, shieldPct);

    const ct = CRYSTAL_COLORS[state.crystalType] ?? CRYSTAL_COLORS.programming;

    // Hero rating: буква + лейбл + цвет (через data-rating)
    const card = document.querySelector<HTMLElement>('.flight-results-card');
    if (card) card.dataset.rating = rating;
    _setText('result-rating', rating);
    _setText('result-rating-label', RATING_LABELS[rating]);

    // Stats — 4 значения в подготовленных слотах.
    // В награде показываем итог с LiveOps-бонусом — ровно то, что ушло в стор.
    const earned = state.totalEarned ?? state.collected;
    _setText('result-crystals',
        earned > 0 ? `+${earned}` : '0');
    _setText('result-crystals-label',
        earned > 0 ? `${ct.label} ${ct.emoji}` : 'Кристаллов');
    _setText('result-shield',  `${shieldPct}%`);
    _setText('result-combo',   `×${state.maxCombo}`);
    _setText('result-dodged',  String(state.dodged));

    // Строка событийного бонуса (видна только при множителе ≠ 1)
    const bonusEl = document.getElementById('result-bonus');
    if (bonusEl) {
        const mult = state.bonusMult ?? 1;
        const showBonus = mult !== 1 && state.collected > 0;
        bonusEl.classList.toggle('hidden', !showBonus);
        if (showBonus) bonusEl.textContent = `×${mult} — событийный бонус кристаллов`;
    }

    // Потери при переполнении трюма (видны только если что-то потеряно)
    const lostEl = document.getElementById('result-lost');
    if (lostEl) {
        const lost = state.lost ?? 0;
        lostEl.classList.toggle('hidden', lost <= 0);
        if (lost > 0) lostEl.textContent = `Потеряно при переполнении трюма: ${lost} 💎`;
    }
}

export function updateAccelIndicator(throttle: number): void {
    const bar = document.getElementById('flight-accel-bar');
    if (bar) {
        const pct = Math.min(100, throttle * 100);
        bar.style.width = `${pct}%`;
    }

    const label = document.getElementById('flight-accel-label');
    if (label) {
        const pctText = Math.round(throttle * 100);
        label.textContent = pctText < 100 ? `УСКОРЕНИЕ ${pctText}%` : 'ПОЛНАЯ ТЯГА';
    }
}


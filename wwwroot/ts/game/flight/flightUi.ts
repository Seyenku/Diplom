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

export function updateEnergyBar(energy: number, maxEnergy: number): void {
    const bar = document.getElementById('flight-energy-bar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (energy / maxEnergy) * 100));
    bar.style.width = `${pct}%`;

    if (pct > 50) {
        bar.style.background = 'linear-gradient(90deg, #39ff14, #a3e635)';
    } else if (pct > 20) {
        bar.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #f87171, #ef4444)';
    }
}

export function updateShieldBar(shield: number, maxShield: number): void {
    const bar = document.getElementById('flight-shield-bar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, (shield / maxShield) * 100));
    bar.style.width = `${pct}%`;
    
    if (pct > 60) {
        bar.style.background = 'linear-gradient(90deg, #4fc3f7, #818cf8)';
    } else if (pct > 30) {
        bar.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #f87171, #ef4444)';
    }
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

    // Stats — 4 значения в подготовленных слотах
    _setText('result-crystals',
        state.collected > 0 ? `+${state.collected}` : '0');
    _setText('result-crystals-label',
        state.collected > 0 ? `${ct.label} ${ct.emoji}` : 'Кристаллов');
    _setText('result-shield',  `${shieldPct}%`);
    _setText('result-combo',   `×${state.maxCombo}`);
    _setText('result-dodged',  String(state.dodged));
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


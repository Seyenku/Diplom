/**
 * flightUi.ts — Обновление пользовательского интерфейса экрана полёта
 */

import { CRYSTAL_COLORS } from '../clusterConfig.js';
import { CrystalType } from '../types.js';

export interface FlightUiState {
    collected: number;
    shield: number;
    maxShield: number;
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
    updateShieldBar(state.shield, state.maxShield);
    updateWaveProgress(state.currentWave, state.waveCount, state.elapsed, state.waveDurationS);
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

export function showResults(state: FlightUiState): void {
    const hudEl = document.getElementById('flight-hud');
    const resultsEl = document.getElementById('flight-results');
    if (hudEl) hudEl.classList.add('hidden');
    if (resultsEl) resultsEl.classList.remove('hidden');

    const shieldPct = Math.round((state.shield / state.maxShield) * 100);
    const rating = state.collected >= 30 && shieldPct > 60 ? 'S'
        : state.collected >= 20 && shieldPct > 40 ? 'A'
        : state.collected >= 10 ? 'B' : 'C';
    const ratingColor = rating === 'S' ? '#fbbf24' : rating === 'A' ? '#4ade80' : rating === 'B' ? '#4fc3f7' : '#94a3b8';

    const ct = CRYSTAL_COLORS[state.crystalType] ?? CRYSTAL_COLORS.programming;
    const statsEl = document.getElementById('flight-results-stats');
    
    if (statsEl) {
        const row = (label: string, value: string, color = 'var(--color-primary)') => `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span>
                <span style="font-family:var(--font-display);color:${color};">${value}</span>
            </div>`;

        const lines: string[] = [];
        lines.push(`<div style="font-size:2.5rem;font-family:var(--font-display);color:${ratingColor};text-align:center;margin-bottom:0.5rem;text-shadow:0 0 20px ${ratingColor}60;">${rating}</div>`);

        if (state.collected > 0) {
            lines.push(row(`${ct.emoji} ${ct.label}`, `+${state.collected}`));
        } else {
            lines.push('<p style="color:var(--color-text-muted);">Кристаллы не собраны. Попробуй ещё!</p>');
        }
        
        lines.push(row('🛡 Щиты', `${shieldPct}%`, shieldPct > 50 ? '#4ade80' : '#f87171'));
        lines.push(row('⚡ Макс. комбо', `×${state.maxCombo}`, state.maxCombo >= 4 ? '#fbbf24' : 'var(--color-text-muted)'));
        lines.push(row('💨 Уклонений', String(state.dodged), 'var(--color-text-muted)'));

        statsEl.innerHTML = lines.join('');
    }
}

function _setText(id: string, v: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

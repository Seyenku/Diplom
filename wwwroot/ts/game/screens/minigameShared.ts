/**
 * minigameShared.ts — Общие UX-утилиты трёх мини-игр (счёт, анимации, результат).
 *
 * Сюда выносится только НОВЫЙ код доработки — сами экраны мини-игр
 * не рефакторятся. Таймеры модуля трогают только DOM и безопасны при
 * уничтожении экрана (работа с отвязанными узлами — no-op).
 */

import { playSfx } from '../audioManager.js';

// ── Счёт ─────────────────────────────────────────────────────────────────────
// Грейс 45 с — школьник спокойно читает условие без штрафа; дальше −5 очков/с,
// но не ниже пола. Формула зеркалится на сервере (MiniGameService.ComputeScore).

export const SCORE_MAX = 1000;
const SCORE_GRACE_MS = 45_000;
const SCORE_DECAY_PER_SEC = 5;
const SCORE_FLOOR = 400;

export function computeScore(timeMs: number): number {
    if (timeMs <= SCORE_GRACE_MS) return SCORE_MAX;
    const overSec = (timeMs - SCORE_GRACE_MS) / 1000;
    return Math.max(SCORE_FLOOR, Math.round(SCORE_MAX - overSec * SCORE_DECAY_PER_SEC));
}

export function formatDuration(ms: number): string {
    const totalSec = Math.max(1, Math.round(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min} мин ${sec} сек` : `${sec} сек`;
}

// ── Бейджи мини-игр (иконки/названия — синхронно с screenAchievements.ts) ────

export const MINIGAME_BADGES: Record<string, { icon: string; title: string }> = {
    'perfect-run':  { icon: '⭐', title: 'Идеальная посадка' },
    'speed-master': { icon: '⚡', title: 'Мастер скорости' },
};

// ── Экран результата: время, счёт, бейджи, объяснение, конфетти ─────────────

export interface ResultExtras {
    prefix: 'med' | 'prog' | 'geo';
    success: boolean;
    timeMs: number;
    /** null при провале — чип счёта скрывается. */
    score: number | null;
    badges: string[];
    explanation: string;
    accentColor: string;
}

export function renderResultExtras(v: ResultExtras): void {
    _setText(`${v.prefix}-result-time`, formatDuration(v.timeMs));

    const scoreWrap = document.getElementById(`${v.prefix}-result-score-wrap`);
    if (scoreWrap) scoreWrap.classList.toggle('hidden', v.score === null);
    if (v.score !== null) _setText(`${v.prefix}-result-score`, String(v.score));

    const badgesEl = document.getElementById(`${v.prefix}-result-badges`);
    if (badgesEl) {
        const known = v.badges.filter(b => MINIGAME_BADGES[b]);
        badgesEl.innerHTML = known.map((b, i) => {
            const meta = MINIGAME_BADGES[b];
            return `<span class="mg-badge-chip" style="animation-delay:${(0.3 + i * 0.18).toFixed(2)}s">${meta.icon} ${meta.title}</span>`;
        }).join('');
        if (known.length > 0) playSfx('achievement');
    }

    _setText(`${v.prefix}-result-explanation-text`, v.explanation);

    if (v.success) {
        const phase = document.getElementById(`${v.prefix}-phase-result`);
        if (phase) spawnVictoryParticles(phase, v.accentColor);
    }
}

// ── Анимации фазы диагностики ────────────────────────────────────────────────

/** Поочерёдное появление карточек: добавляет .mg-reveal-item и с шагом — .is-in */
export function staggerReveal(root: ParentNode, selector: string, stepMs = 70): void {
    const items = root.querySelectorAll<HTMLElement>(selector);
    items.forEach((el, i) => {
        el.classList.add('mg-reveal-item');
        window.setTimeout(() => el.classList.add('is-in'), 30 + i * stepMs);
    });
}

/** Плавный налив прогресс-бара от нуля до целевого значения. */
export function animateBarFill(barEl: HTMLElement | null, pct: number, delayMs = 150): void {
    if (!barEl) return;
    barEl.classList.add('mg-bar-animated');
    barEl.style.width = '0%';
    window.setTimeout(() => { barEl.style.width = `${pct}%`; }, delayMs);
}

/** Count-up: интерполирует каждое число в строке («80/50 мм» — оба числа). */
export function animateNumericText(el: HTMLElement | null, finalText: string, durMs = 700): void {
    if (!el) return;
    const numRe = /\d+(?:\.\d+)?/g;
    const matches = finalText.match(numRe);
    if (!matches) { el.textContent = finalText; return; }

    const finals = matches.map(Number);
    const decimals = matches.map(m => (m.includes('.') ? m.split('.')[1].length : 0));
    const start = performance.now();

    const step = (now: number): void => {
        const t = Math.min(1, (now - start) / durMs);
        const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
        let i = 0;
        el.textContent = finalText.replace(numRe, () => {
            const s = (finals[i] * eased).toFixed(decimals[i]);
            i++;
            return s;
        });
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ── Сабмит и фидбек по ответу ────────────────────────────────────────────────

/** Активность кнопки сабмита + пульс-подсказка «можно жать». */
export function setSubmitReady(btn: HTMLButtonElement | null, ready: boolean): void {
    if (!btn) return;
    btn.disabled = !ready;
    btn.classList.toggle('mg-submit-ready', ready);
}

/**
 * Подсветка ответа перед сменой фазы: верный — зелёная пульсация выбранного;
 * неверный — красная тряска выбранного + подсветка правильного варианта.
 * Резолвится через ~1.4 с, когда игрок успел увидеть фидбек.
 */
export function flashAnswerFeedback(
    selectedEl: HTMLElement | null,
    correctEl: HTMLElement | null,
    isCorrect: boolean
): Promise<void> {
    if (isCorrect) {
        selectedEl?.classList.add('mg-answer-correct');
        playSfx('ui_success');
    } else {
        selectedEl?.classList.add('mg-answer-wrong');
        correctEl?.classList.add('mg-answer-reveal');
        playSfx('ui_error');
    }
    return new Promise(resolve => window.setTimeout(resolve, 1400));
}

/**
 * Затухание текущей фазы (~250 мс) → swap() (обычно существующий _showOnly).
 * Появление новой фазы оформляется статичным классом mg-phase-fade-in:
 * CSS-анимация перезапускается сама при display:none → block.
 */
export function fadeSwapPhase(hideId: string, swap: () => void): Promise<void> {
    const hideEl = document.getElementById(hideId);
    hideEl?.classList.add('mg-fade-out');
    return new Promise(resolve => {
        window.setTimeout(() => {
            hideEl?.classList.remove('mg-fade-out');
            swap();
            resolve();
        }, 250);
    });
}

// ── Конфетти победы (DOM, без canvas) ────────────────────────────────────────

export function spawnVictoryParticles(host: HTMLElement, accentColor: string): void {
    const COUNT = 24;
    for (let i = 0; i < COUNT; i++) {
        const p = document.createElement('span');
        p.className = 'mg-confetti-piece';
        p.style.left = `${5 + Math.random() * 90}%`;
        p.style.background = i % 3 === 0 ? '#fbbf24' : accentColor;
        p.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
        p.style.animationDuration = `${(1.6 + Math.random() * 1.2).toFixed(2)}s`;
        host.appendChild(p);
        window.setTimeout(() => p.remove(), 3200);
    }
}

// ── Внутреннее ───────────────────────────────────────────────────────────────

function _setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

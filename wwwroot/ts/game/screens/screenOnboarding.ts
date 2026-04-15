/**
 * screenOnboarding.ts — Модуль экрана онбординга (интерактивный тур)
 */

import { transition, Screen } from '../stateManager.js';
import { GameStore } from '../types.js';

interface OnboardingStep {
    icon: string;
    title: string;
    text: string;
}

const STEPS: OnboardingStep[] = [
    {
        icon:  '🚀',
        title: 'Добро пожаловать!',
        text:  'Ты — последний Звёздный Навигатор. Твоя миссия — исследовать Галактику Призвания и открыть профессии будущего.'
    },
    {
        icon:  '💎',
        title: 'Кристаллы Знаний',
        text:  'Летай по астероидным поясам и собирай Кристаллы Знаний. Каждый тип кристалла отражает знания в конкретном направлении: IT, медицина, экология...'
    },
    {
        icon:  '🔭',
        title: 'Сканирование туманностей',
        text:  'Тратя кристаллы, ты запускаешь сканер туманностей. Чем больше кристаллов нужных направлений — тем выше шанс открыть новую профессию-планету!'
    },
    {
        icon:  '🌍',
        title: 'Планеты-профессии',
        text:  'Каждая открытая планета — это профессия будущего со своими требованиями, навыками и рисками. Пройди пробную посадку, чтобы лучше понять специальность.'
    },
    {
        icon:  '🌠',
        title: 'Созвездие Призвания',
        text:  'Игра анализирует твою активность и формирует Созвездие Призвания — 3-5 профессий, которые наиболее тебе подходят. Удачи, Навигатор!'
    }
];

let _currentStep = 0;

window._onboarding = {
    nextStep() {
        if (_currentStep < STEPS.length - 1) {
            _currentStep++;
            _render();
        } else {
            transition(Screen.GALAXY_MAP);
        }
    },
    prevStep() {
        if (_currentStep > 0) {
            _currentStep--;
            _render();
        }
    },
    skip() {
        transition(Screen.GALAXY_MAP);
    }
};

function _render(): void {
    const step = STEPS[_currentStep];
    const iconEl = document.getElementById('step-icon');
    if (iconEl) iconEl.textContent = step.icon;
    _setText('step-title', step.title);
    _setText('step-text', step.text);

    // Кнопки навигации
    const backBtn = document.getElementById('btn-tour-back');
    if (backBtn) (backBtn as HTMLElement).style.visibility = _currentStep > 0 ? 'visible' : 'hidden';

    const nextBtn = document.getElementById('btn-tour-next');
    if (nextBtn) nextBtn.textContent = _currentStep === STEPS.length - 1 ? 'В галактику 🚀' : 'Далее →';

    // Точки прогресса
    STEPS.forEach((_, i) => {
        const dot = document.getElementById(`step-dot-${i}`);
        if (dot) (dot as HTMLElement).style.background = i === _currentStep ? 'var(--color-primary)' : 'var(--color-border)';
    });
}

function _setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

export async function init(_store: Readonly<GameStore>): Promise<void> {
    _currentStep = 0;
    _render();
}

export function destroy(): void {}

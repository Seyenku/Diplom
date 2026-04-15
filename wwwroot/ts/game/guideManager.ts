/**
 * guideManager.ts — Глобальный менеджер ИИ «Гайд»
 *
 * Живёт независимо от экранов — инициализируется один раз при старте,
 * слушает события store через dispatch-хуки и добавляет контекстные подсказки.
 */

import { on, getStore } from './stateManager.js';
import { ScreenId } from './types.js';

// ── Быстрые вопросы по умолчанию ─────────────────────────────────────────────
const DEFAULT_HINTS = [
    { id: 'how-crystals', text: 'Как собирать кристаллы?' },
    { id: 'how-scan',     text: 'Как сканировать туманность?' },
    { id: 'how-planets',  text: 'Что такое планеты-профессии?' },
    { id: 'how-upgrade',  text: 'Как улучшить корабль?' },
];

const HINT_ANSWERS: Record<string, string> = {
    'how-crystals': 'Летай по астероидным поясам на Звёздной карте 🌌 и врезайся в астероиды! Каждый астероид — это мини-игра, которая приносит Кристаллы Знаний конкретного направления.',
    'how-scan':     'Открой Карту галактики → нажми «Сканировать туманность» 🔭. Распредели кристаллы по направлениям — чем точнее совпадение с профессией, тем выше шанс.',
    'how-planets':  'Каждая планета — профессия будущего со своими навыками и требованиями. Открой её через сканирование, затем пройди «Пробную посадку» — мини-игру от первого лица.',
    'how-upgrade':  'Зайди в Мастерскую корабля ⚙ через Карту галактики. Трать кристаллы на улучшения двигателя, щитов, сканера и вместимости трюма.',
};

// Контекстные подсказки для конкретных экранов
const SCREEN_TIPS: Record<string, string> = {
    'main-menu':              '👋 Привет, Навигатор! Нажми «Новая игра» чтобы начать своё путешествие.',
    'char-creation':          '✍ Придумай имя и выбери аватар — это твой образ в Галактике Призвания.',
    'onboarding':             '📚 Этот тур познакомит тебя с основными механиками. Можно пропустить, если уже знаком.',
    'galaxy-map':             '🌌 Это твоя карта. Нажми на открытую планету, чтобы узнать о профессии. Используй фильтры вверху!',
    'nebula-scan':            '🔭 Распредели кристаллы по направлениям. Подсказка: смотри на «Нужные кристаллы» в карточке планеты.',
    'planet-detail':          '🌍 Читай внимательно — hard skills это конкретные инструменты, soft skills — личные качества.',
    'minigame':               '🎮 Это пробная посадка! Выполняй задание и набирай очки. Быстрее — больше бонусов.',
    'ship-upgrade':           '⚙ Улучши Сканер — он открывает доступ к редким профессиям дальних туманностей.',
    'vocation-constellation': '🌠 Это твой персональный результат. Чем выше процент — тем лучше совпадение с профессией.',
    'achievements':           '📊 Здесь твои достижения и статистика. Экспортируй их, чтобы показать учителю или родителям.',
    'settings':               '⚙ Настрой игру под себя. Включи субтитры или режим для дальтоников при необходимости.',
};

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Инициализирует Guide-панель — вставляет HTML во #guide-panel.
 * Должна вызываться один раз при старте игры (в main.ts после DOM-готовности).
 */
export async function initGuide(): Promise<void> {
    const panel = document.getElementById('guide-panel');
    if (!panel) return;

    // Загружаем HTML панели через Partial
    try {
        const resp = await fetch('/game?handler=Partial&screenId=guide', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (resp.ok) panel.innerHTML = await resp.text();
    } catch {
        // Offline fallback — рисуем минималистичную панель
        panel.innerHTML = `
            <div style="padding:1rem;color:var(--color-text-muted);font-size:0.85rem;">
                <p>🤖 <strong>Гайд</strong> недоступен офлайн.</p>
            </div>`;
    }

    _renderQuickHints(DEFAULT_HINTS);
    addMessage('Привет, Навигатор! Я — Гайд, твой бортовой ИИ. Спрашивай, если нужна помощь! 🤖', 'guide');

    // Хук: при каждой смене экрана показываем контекстную подсказку
    on('SCREEN_CHANGED', (_store, { screenId }) => {
        const tip = SCREEN_TIPS[screenId as ScreenId];
        if (tip) addMessage(tip, 'guide');
    });
}

type MessageSender = 'guide' | 'player';

/**
 * Добавляет сообщение в поток Guide-панели.
 */
export function addMessage(text: string, sender: MessageSender = 'guide'): void {
    const container = document.getElementById('guide-messages');
    if (!container) return;

    const isGuide = sender === 'guide';
    const el = document.createElement('div');
    el.style.cssText = `
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.82rem;
        line-height: 1.5;
        max-width: 90%;
        align-self: ${isGuide ? 'flex-start' : 'flex-end'};
        background: ${isGuide ? 'rgba(79,195,247,0.1)' : 'rgba(167,139,250,0.1)'};
        border: 1px solid ${isGuide ? 'rgba(79,195,247,0.2)' : 'rgba(167,139,250,0.2)'};
        color: var(--color-text);
    `;
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

// ── Внутренние хелперы ────────────────────────────────────────────────────────

function _renderQuickHints(hints: typeof DEFAULT_HINTS): void {
    const el = document.getElementById('guide-quick-hints');
    if (!el) return;
    el.innerHTML = hints.map(h => `
        <button onclick="window._guide?.askHint('${h.id}')"
                style="background:rgba(79,195,247,0.08);border:1px solid rgba(79,195,247,0.2);
                       color:var(--color-primary);border-radius:999px;padding:3px 10px;
                       font-size:0.72rem;cursor:pointer;transition:background var(--transition-ui);"
                onmouseenter="this.style.background='rgba(79,195,247,0.18)'"
                onmouseleave="this.style.background='rgba(79,195,247,0.08)'">
            ${h.text}
        </button>`
    ).join('');
}

// ── Глобальный API для onclick-атрибутов ─────────────────────────────────────

window._guide = {
    askHint(id: string) {
        const answer = HINT_ANSWERS[id];
        if (answer) addMessage(answer, 'guide');
    }
};

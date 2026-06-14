/**
 * screenMiniGameMedicine.ts — Мини-игра «Диагностика капитана»
 *
 * Туманность Целителей. Корабль сближается с планетой, врезается
 * в астероид, капитан получает травму. Игрок:
 *  1. Смотрит кинематографическую кат-сцену (~6 сек)
 *  2. Анализирует показатели здоровья (пульс, давление, температура, сатурация)
 *  3. Выбирает правильный диагноз из 5 вариантов
 *  4. Нажимает «Назначить лечение»
 *
 * Успех  → DISCOVER_PLANET, награда, возврат к деталям планеты
 * Провал → Кристаллы потеряны (уже списаны в screenPlanetDetail), возврат
 */

import { dispatch, goBack } from '../stateManager.js';
import { GameStore, MiniGameRewardDto } from '../types.js';
import { playSfx, playMusic } from '../audioManager.js';
import { createMedCutscene, MedCutsceneApi } from './medCutscene3d.js';
import {
    computeScore, setSubmitReady, staggerReveal, animateBarFill, animateNumericText,
    flashAnswerFeedback, fadeSwapPhase, renderResultExtras,
} from './minigameShared.js';

// ── Типы травм ──────────────────────────────────────────────────────────────

interface VitalReading {
    value: number;
    display: string;
    /** 'normal' | 'warning' | 'critical' */
    level: 'normal' | 'warning' | 'critical';
    /** 0-100, нормировано для прогресс-бара */
    bar: number;
}

interface Injury {
    id: string;
    name: string;
    description: string;
    symptoms: string;
    /** Образовательное объяснение: какие показатели указывали на этот диагноз. */
    explanation: string;
    vitals: {
        pulse:    VitalReading;
        pressure: VitalReading;
        temp:     VitalReading;
        o2:       VitalReading;
    };
}

// ── База травм ───────────────────────────────────────────────────────────────

const INJURIES: readonly Injury[] = [
    {
        id: 'bleeding',
        name: 'Внутреннее кровотечение',
        description: 'Потеря крови. Бледность, слабость, падение давления.',
        symptoms: 'Бледность кожи, холодный пот, слабый учащённый пульс, снижение давления',
        explanation: 'Давление упало до 80/50, а пульс подскочил до 122 — сердце качает быстрее, компенсируя потерю крови. Температура нормальная, значит это не инфекция. Низкое давление + частый слабый пульс + падающая сатурация (91%) — классическая картина внутреннего кровотечения.',
        vitals: {
            pulse:    { value: 122, display: '122 уд/мин', level: 'critical', bar: 85 },
            pressure: { value: 50,  display: '80/50 мм',   level: 'critical', bar: 20 },
            temp:     { value: 36.1, display: '36.1 °C',   level: 'normal',   bar: 45 },
            o2:       { value: 91,  display: '91%',         level: 'critical', bar: 35 },
        },
    },
    {
        id: 'concussion',
        name: 'Сотрясение мозга',
        description: 'Травма головы. Показатели почти в норме, но капитан дезориентирован.',
        symptoms: 'Головокружение, тошнота, дезориентация, нарушение координации',
        explanation: 'Все четыре показателя в норме — и это главная улика. Головокружение, тошнота и дезориентация при нормальных пульсе, давлении и сатурации означают, что пострадала голова, а не внутренние органы.',
        vitals: {
            pulse:    { value: 82,  display: '82 уд/мин',  level: 'normal',   bar: 60 },
            pressure: { value: 80,  display: '125/80 мм',  level: 'normal',   bar: 72 },
            temp:     { value: 36.5, display: '36.5 °C',   level: 'normal',   bar: 55 },
            o2:       { value: 97,  display: '97%',         level: 'normal',   bar: 93 },
        },
    },
    {
        id: 'infection',
        name: 'Космическая инфекция',
        description: 'Заражение внеземным микроорганизмом. Высокая температура, озноб.',
        symptoms: 'Жар, озноб, учащённый пульс, слабость, сниженная сатурация',
        explanation: 'Температура 39.6 °C — единственный критический показатель, плюс озноб и умеренно учащённый пульс (104). Травмы такого жара не дают: высокая температура — это иммунный ответ организма на заражение.',
        vitals: {
            pulse:    { value: 104, display: '104 уд/мин', level: 'warning',  bar: 78 },
            pressure: { value: 70,  display: '110/70 мм',  level: 'normal',   bar: 65 },
            temp:     { value: 39.6, display: '39.6 °C',   level: 'critical', bar: 92 },
            o2:       { value: 94,  display: '94%',         level: 'warning',  bar: 68 },
        },
    },
    {
        id: 'rib_fracture',
        name: 'Перелом ребра',
        description: 'Травма грудной клетки. Боль при дыхании, снижение сатурации.',
        symptoms: 'Острая боль при вдохе, учащённое дыхание, локальная болезненность',
        explanation: 'Сатурация снизилась до 93%, потому что дышать больно и дыхание становится поверхностным. Пульс (112) и давление (132/85) слегка повышены от боли, температура в норме. Острая боль при вдохе + сниженный кислород — перелом ребра.',
        vitals: {
            pulse:    { value: 112, display: '112 уд/мин', level: 'warning',  bar: 80 },
            pressure: { value: 85,  display: '132/85 мм',  level: 'warning',  bar: 78 },
            temp:     { value: 36.8, display: '36.8 °C',   level: 'normal',   bar: 58 },
            o2:       { value: 93,  display: '93%',         level: 'warning',  bar: 58 },
        },
    },
    {
        id: 'stress',
        name: 'Острый стресс',
        description: 'Сильный психологический шок. Учащённый пульс, высокое давление, тремор.',
        symptoms: 'Тремор рук, потливость, учащённый пульс, повышенное давление, паника',
        explanation: 'Пульс 134 и ПОВЫШЕННОЕ давление 152/95 при нормальных температуре и сатурации — реакция «бей или беги». Ключевое отличие: при кровотечении давление падает, а здесь оно высокое — это паника, а не внутренняя травма.',
        vitals: {
            pulse:    { value: 134, display: '134 уд/мин', level: 'critical', bar: 95 },
            pressure: { value: 95,  display: '152/95 мм',  level: 'critical', bar: 95 },
            temp:     { value: 36.9, display: '36.9 °C',   level: 'normal',   bar: 60 },
            o2:       { value: 97,  display: '97%',         level: 'normal',   bar: 93 },
        },
    },
];

// Все возможные диагнозы (для отображения в списке)
const ALL_DIAGNOSES = INJURIES.map(i => ({
    id: i.id,
    name: i.name,
    description: i.description,
}));

// ── Состояние модуля ─────────────────────────────────────────────────────────

type MedPhase = 'cutscene' | 'diagnosis' | 'result';

let _phase: MedPhase = 'cutscene';
let _planetId: string | null = null;
let _shipColor = '#4fc3f7';
let _currentInjury: Injury | null = null;
let _selectedDiagnosisId: string | null = null;
let _diagnosisStartTime = 0;
let _cutsceneTimer: ReturnType<typeof setTimeout> | null = null;
let _progressTimer: ReturnType<typeof setInterval> | null = null;
let _cutscene3d: MedCutsceneApi | null = null;
let _isDestroyed = false;

// ── Глобальный API ───────────────────────────────────────────────────────────

window._miniGameMedicine = {
    submitDiagnosis() {
        if (_phase !== 'diagnosis' || !_selectedDiagnosisId || !_currentInjury) return;
        _handleDiagnosisSubmit();
    },
    returnToPlanet() {
        goBack();
    },
    skipCutscene() {
        if (_phase !== 'cutscene' || !_cutscene3d) return;
        playSfx('ui_click');
        _cutscene3d.stop(); // резолвит play() → существующий .then() перейдёт к диагностике
    },
    selectDiagnosis(id: string) {
        if (_phase !== 'diagnosis') return;
        _selectedDiagnosisId = id;
        document.querySelectorAll('.med-diagnosis-option').forEach(el => el.classList.remove('selected'));
        document.getElementById(`diag-opt-${id}`)?.classList.add('selected');
        setSubmitReady(document.getElementById('med-submit-btn') as HTMLButtonElement | null, true);
        playSfx('ui_click');
    },
};

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    _isDestroyed = false;
    _planetId = store.sessionData?.planetId ?? null;
    _selectedDiagnosisId = null;
    _currentInjury = _pickRandomInjury();

    // Берём цвет корабля из профиля игрока
    _shipColor = (store.player as any)?.shipColor ?? '#4fc3f7';

    playMusic('ambient_minigame');
    _startCutscene();
}

export function destroy(): void {
    _isDestroyed = true;
    _clearTimers();
    _cutscene3d?.stop();
    _cutscene3d?.dispose();
    _cutscene3d = null;
}

// ── Кат-сцена ────────────────────────────────────────────────────────────────

/** Обновляет текстовый UI-оверлей кат-сцены и прогресс-бар */
function _updateCutsceneUI(elapsed: number, total: number): void {
    const pct = Math.min(100, (elapsed / total) * 100);
    const bar = document.getElementById('med-cutscene-progress-bar');
    if (bar) bar.style.width = `${pct}%`;
}

function _startCutscene(): void {
    _phase = 'cutscene';
    _setPhaseLabel('Кат-сцена');
    _showOnly('med-phase-cutscene');
    _hide('med-cutscene-alert');

    const canvas = document.getElementById('med-cutscene-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        // Фоллбэк: если canvas почему-то недоступен — сразу диагностика
        _cutsceneTimer = setTimeout(() => { if (!_isDestroyed) _startDiagnosis(); }, 500);
        return;
    }

    // Прогресс-бар (параллельно с 3D-сценой)
    const CUTSCENE_DURATION_MS = 8000;
    const startTime = Date.now();
    _progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        _updateCutsceneUI(elapsed, CUTSCENE_DURATION_MS);
        if (elapsed >= CUTSCENE_DURATION_MS) _clearProgressTimer();
    }, 100);

    // Запускаем 3D-сцену
    _cutscene3d = createMedCutscene(canvas, _shipColor, (event) => {
        // Синхронизируем DOM-текст с событиями 3D-таймлайна
        switch (event) {
            case 'approach':
                _setText('med-cutscene-headline', 'Приближение к планете...');
                _setText('med-cutscene-subtext', 'Корабль выходит на орбиту Туманности Целителей');
                break;
            case 'asteroid_spotted':
                _setText('med-cutscene-headline', '⚠️ Обнаружен астероид!');
                _setText('med-cutscene-subtext', 'Попытка уклонения... До столкновения — секунды');
                break;
            case 'impact':
                _setText('med-cutscene-headline', '💥 СТОЛКНОВЕНИЕ!');
                _setText('med-cutscene-subtext', 'Удар пришёлся в носовую часть корабля');
                _show('med-cutscene-alert');
                break;
            case 'captain_hurt':
                _setText('med-cutscene-headline', '🚨 Капитан ранен!');
                _setText('med-cutscene-subtext', 'Срочно требуется медицинская диагностика');
                _hide('med-cutscene-alert');
                break;
        }
    });

    // play() резолвится когда 8 секунд прошло
    _cutscene3d.play().then(() => {
        if (_isDestroyed) return;
        _clearProgressTimer();
        _cutscene3d?.dispose();
        _cutscene3d = null;
        _startDiagnosis();
    });
}

// ── Диагностика ──────────────────────────────────────────────────────────────

function _startDiagnosis(): void {
    _phase = 'diagnosis';
    _setPhaseLabel('Диагностика');

    _showOnly('med-phase-diagnosis');
    if (!_currentInjury) return;

    _diagnosisStartTime = Date.now();

    // Показываем симптомы
    _setText('med-symptoms-text', _currentInjury.symptoms);

    // Показатели здоровья
    _renderVitals(_currentInjury);

    // Список диагнозов
    _renderDiagnosisList();

    // Кнопка неактивна до выбора варианта (после рестарта могла остаться активной)
    setSubmitReady(document.getElementById('med-submit-btn') as HTMLButtonElement | null, false);

    // Поочерёдное появление карточек показателей и вариантов
    const phaseEl = document.getElementById('med-phase-diagnosis');
    if (phaseEl) {
        staggerReveal(phaseEl, '.med-vital-card');
        staggerReveal(phaseEl, '.med-diagnosis-option', 60);
    }
}

function _renderVitals(injury: Injury): void {
    _setVital('pulse',    injury.vitals.pulse);
    _setVital('pressure', injury.vitals.pressure);
    _setVital('temp',     injury.vitals.temp);
    _setVital('o2',       injury.vitals.o2);
}

function _setVital(id: 'pulse' | 'pressure' | 'temp' | 'o2', v: VitalReading): void {
    const card    = document.getElementById(`vital-${id}`);
    const valEl   = document.getElementById(`vital-${id}-val`);
    const barEl   = document.getElementById(`vital-${id}-bar`);

    if (valEl) {
        valEl.className = `med-vital-value ${v.level}`;
        animateNumericText(valEl, v.display);
    }
    if (barEl) {
        barEl.className = `med-vital-bar-fill ${v.level}`;
        animateBarFill(barEl, v.bar);
    }
    if (card) {
        card.className = `med-vital-card ${v.level}`;
    }

    // Микро-интерактив: иконка ❤️ бьётся с реальной частотой пульса пациента
    if (id === 'pulse' && card) {
        const icon = card.querySelector<HTMLElement>('.med-vital-icon');
        if (icon && v.value > 0) {
            icon.classList.add('mg-heartbeat');
            icon.style.animationDuration = `${(60 / v.value).toFixed(2)}s`;
        }
    }
}

function _renderDiagnosisList(): void {
    const list = document.getElementById('med-diagnosis-list');
    if (!list) return;

    // Перемешиваем список, чтобы правильный ответ не был всегда первым.
    // Выбор — через data-action-мост (inline onclick блокируется CSP).
    const shuffled = [...ALL_DIAGNOSES].sort(() => Math.random() - 0.5);

    list.innerHTML = shuffled.map(d => `
        <div class="med-diagnosis-option" id="diag-opt-${d.id}"
             data-action="miniGameMedicine.selectDiagnosis" data-arg="${d.id}">
            <div class="med-diagnosis-radio"></div>
            <div class="med-diagnosis-text">
                <span class="med-diagnosis-name">${d.name}</span>
                <span class="med-diagnosis-desc">${d.description}</span>
            </div>
        </div>
    `).join('');
    list.style.pointerEvents = '';
}

// ── Обработка ответа ─────────────────────────────────────────────────────────

async function _handleDiagnosisSubmit(): Promise<void> {
    if (!_currentInjury || !_selectedDiagnosisId) return;

    const injury = _currentInjury;
    const isCorrect = _selectedDiagnosisId === injury.id;
    const timeMs = Math.max(3000, Date.now() - _diagnosisStartTime);
    const score = computeScore(timeMs);

    // Блокируем повторный сабмит и дальнейший выбор вариантов
    setSubmitReady(document.getElementById('med-submit-btn') as HTMLButtonElement | null, false);
    const list = document.getElementById('med-diagnosis-list');
    if (list) list.style.pointerEvents = 'none';

    const selectedEl = document.getElementById(`diag-opt-${_selectedDiagnosisId}`);
    const correctEl  = document.getElementById(`diag-opt-${injury.id}`);

    dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });

    if (isCorrect) {
        // Открываем планету
        if (_planetId) {
            dispatch('DISCOVER_PLANET', { planetId: _planetId });
        }

        // Фидбек по ответу и запрос награды идут параллельно
        const [, reward] = await Promise.all([
            flashAnswerFeedback(selectedEl, correctEl, true),
            _fetchReward(score, timeMs),
        ]);
        if (_isDestroyed) return;

        let badges: string[] = [];
        if (reward?.valid && reward.crystals) {
            dispatch('EARN_CRYSTALS', { earned: reward.crystals });
        }
        if (reward?.badges?.length) {
            badges = reward.badges;
            reward.badges.forEach(b => dispatch('ADD_BADGE', { badge: b }));
        }

        playSfx('planet_unlock');
        await fadeSwapPhase('med-phase-diagnosis', () => _showResult(true, injury, timeMs, score, badges));
    } else {
        await flashAnswerFeedback(selectedEl, correctEl, false);
        if (_isDestroyed) return;
        playSfx('minigame_crash');
        await fadeSwapPhase('med-phase-diagnosis', () => _showResult(false, injury, timeMs, null, []));
    }
}

async function _fetchReward(score: number, timeMs: number): Promise<MiniGameRewardDto | null> {
    try {
        const resp = await fetch('/game?handler=MiniGameResult', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'RequestVerificationToken':
                    (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement)?.value ?? '',
            },
            body: JSON.stringify({
                planetId: _planetId,
                score,
                timeMs,
                passed: true,
            }),
        });
        if (resp.ok) return await resp.json() as MiniGameRewardDto;
    } catch (e) {
        console.warn('[MedMiniGame] reward fetch failed:', e);
    }
    return null;
}

// ── Результат ────────────────────────────────────────────────────────────────

function _showResult(success: boolean, injury: Injury, timeMs: number, score: number | null, badges: string[]): void {
    _phase = 'result';
    _setPhaseLabel('Результат');
    _showOnly('med-phase-result');

    const icon  = document.getElementById('med-result-icon');
    const title = document.getElementById('med-result-title');
    const text  = document.getElementById('med-result-text');
    const correctWrap = document.getElementById('med-result-correct-wrap');
    const correctEl   = document.getElementById('med-result-correct-name');
    const returnBtn   = document.getElementById('med-btn-return');

    if (success) {
        if (icon)  icon.textContent = '✅';
        if (title) { title.textContent = 'Диагноз верный! Капитан спасён!'; title.className = 'med-result-title success'; }
        if (text)  text.textContent = 'Вы правильно определили травму и назначили лечение. Капитан вернётся в строй через несколько часов. Планета открыта!';
        if (correctWrap) correctWrap.classList.add('hidden');
        if (returnBtn)   returnBtn.textContent = '🌍 Перейти к планете';
    } else {
        if (icon)  icon.textContent = '❌';
        if (title) { title.textContent = 'Неверный диагноз!'; title.className = 'med-result-title failure'; }
        if (text)  text.textContent = 'Капитан не получил нужного лечения. Кристаллы затрачены на попытку. Необходимо собрать новые кристаллы и попробовать снова.';
        if (correctWrap) correctWrap.classList.remove('hidden');
        if (correctEl)   correctEl.textContent = injury.name;
        if (returnBtn)   returnBtn.textContent = '← Вернуться к планете';
    }

    renderResultExtras({
        prefix: 'med', success, timeMs, score, badges,
        explanation: injury.explanation,
        accentColor: '#f87171',
    });
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function _pickRandomInjury(): Injury {
    return INJURIES[Math.floor(Math.random() * INJURIES.length)];
}

/** Показывает только один фазовый контейнер, скрывает остальные */
function _showOnly(visibleId: string): void {
    const phases = ['med-phase-cutscene', 'med-phase-diagnosis', 'med-phase-result'];
    phases.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === visibleId) {
            el.classList.remove('hidden');
            el.style.display = '';
        } else {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });
}

function _show(id: string): void {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function _hide(id: string): void {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function _setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _setPhaseLabel(label: string): void {
    _setText('med-phase-label', label);
}

function _clearTimers(): void {
    if (_cutsceneTimer)  { clearTimeout(_cutsceneTimer);   _cutsceneTimer = null; }
    _clearProgressTimer();
}

function _clearProgressTimer(): void {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
}

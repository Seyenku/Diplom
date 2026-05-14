/**
 * screenMiniGameGeology.ts — Мини-игра «Анализ породы»
 *
 * Туманность Геодезистов. Корабль обнаруживает астероидный пояс,
 * выпускает зонд, который сканирует породу. Игрок:
 *  1. Смотрит кинематографическую кат-сцену (~8 сек)
 *  2. Анализирует метрики породы (твёрдость/температура/радиация/пористость)
 *     и стратиграфический разрез (2D canvas со сканирующим лучом)
 *  3. Выбирает правильный метод бурения из 5 вариантов
 *  4. Нажимает «Начать бурение»
 *
 * Успех  → прогресс-бар + mini-cutscene раскола → DISCOVER_PLANET
 * Провал → Кристаллы потеряны (уже списаны в screenPlanetDetail), возврат
 */

import { dispatch, goBack, getStore } from '../stateManager.js';
import { GameStore, MiniGameRewardDto, CrystalType } from '../types.js';
import { playSfx, playMusic } from '../audioManager.js';
import { createGeoCutscene, GeoCutsceneApi } from './geoCutscene3d.js';
import { createGeoSplitCutscene } from './geoSplitCutscene3d.js';

// ── Типы ────────────────────────────────────────────────────────────────────

interface RockMetric {
    value: string;
    level: 'normal' | 'warning' | 'critical';
    bar: number;
}

interface StratumLayer {
    label: string;
    color: string;
    heightPct: number;   // 0-100
    anomaly: boolean;
}

interface RockSample {
    id: string;
    name: string;
    description: string;
    methodName: string;
    methodCommand: string;
    strata: StratumLayer[];
    metrics: {
        hardness: RockMetric;
        temp:     RockMetric;
        rad:      RockMetric;
        pore:     RockMetric;
    };
}

// ── База образцов ────────────────────────────────────────────────────────────

const SAMPLES: readonly RockSample[] = [
    {
        id: 'quartzite',
        name: 'Кварцит',
        description: 'Метаморфическая порода высочайшей твёрдости. Плотная структура без газовых включений. Стандартные буры разрушаются немедленно.',
        methodName: '💎 Алмазный бур с термо-нагревом',
        methodCommand: 'drill --diamond --thermal-preheat',
        strata: [
            { label: 'Реголит',  color: '#4a3f30', heightPct: 15, anomaly: false },
            { label: 'Кварцит',  color: '#c8b89a', heightPct: 45, anomaly: true  },
            { label: 'Сланец',   color: '#5a5040', heightPct: 25, anomaly: false },
            { label: 'Ядро',     color: '#2a2018', heightPct: 15, anomaly: false },
        ],
        metrics: {
            hardness: { value: '9/10 Мос',  level: 'critical', bar: 90 },
            temp:     { value: '−40 °C',    level: 'normal',   bar: 20 },
            rad:      { value: '0.1 мЗв/ч', level: 'normal',   bar: 5  },
            pore:     { value: '2%',         level: 'normal',   bar: 5  },
        },
    },
    {
        id: 'volcanic_tuff',
        name: 'Вулканический туф',
        description: 'Пористая порода с раскалёнными газовыми кавернами. Любой механический удар вызывает детонацию. Требуется бесконтактный метод.',
        methodName: '🔥 Плазменный резак',
        methodCommand: 'plasma-cut --mode=contact --temp=6000K',
        strata: [
            { label: 'Реголит',  color: '#4a3f30', heightPct: 12, anomaly: false },
            { label: 'Туф',      color: '#8b5e3c', heightPct: 30, anomaly: true  },
            { label: 'Каверны',  color: '#6b3020', heightPct: 35, anomaly: true  },
            { label: 'Базальт',  color: '#2a1f1a', heightPct: 23, anomaly: false },
        ],
        metrics: {
            hardness: { value: '4/10 Мос',  level: 'normal',   bar: 40 },
            temp:     { value: '+850 °C',   level: 'critical', bar: 95 },
            rad:      { value: '1.2 мЗв/ч', level: 'warning',  bar: 40 },
            pore:     { value: '68%',        level: 'critical', bar: 96 },
        },
    },
    {
        id: 'radioactive_shale',
        name: 'Радиоактивный сланец',
        description: 'Хрупкая порода с урановыми пластами. Вибрация вызывает распад и выброс. Только низкоамплитудный ультразвук обеспечит безопасное резонансное разрушение.',
        methodName: '🔊 Ультразвуковой резонанс',
        methodCommand: 'sonic --freq=42kHz --amplitude=low',
        strata: [
            { label: 'Реголит',  color: '#4a3f30', heightPct: 10, anomaly: false },
            { label: 'Сланец',   color: '#5a6040', heightPct: 30, anomaly: true  },
            { label: 'Ур. пласт',color: '#404820', heightPct: 40, anomaly: true  },
            { label: 'Ядро',     color: '#201e14', heightPct: 20, anomaly: false },
        ],
        metrics: {
            hardness: { value: '2/10 Мос',  level: 'normal',   bar: 15 },
            temp:     { value: '+120 °C',   level: 'warning',  bar: 55 },
            rad:      { value: '18 мЗв/ч',  level: 'critical', bar: 97 },
            pore:     { value: '55%',        level: 'critical', bar: 85 },
        },
    },
    {
        id: 'cryogenic_basalt',
        name: 'Криогенный базальт',
        description: 'Твёрдая вулканическая порода, скованная криогенным льдом. Алмазный бур треснет при первом контакте без прогрева. Термический прожиг плавит лёд и открывает трещины.',
        methodName: '🌡️ Термический прожиг',
        methodCommand: 'thermal-lance --temp=+2500C --duration=8s',
        strata: [
            { label: 'Реголит',  color: '#3a4050', heightPct: 15, anomaly: false },
            { label: 'Лёд',      color: '#8ab8d8', heightPct: 20, anomaly: true  },
            { label: 'Базальт',  color: '#5a5868', heightPct: 45, anomaly: true  },
            { label: 'Ядро',     color: '#1e1e28', heightPct: 20, anomaly: false },
        ],
        metrics: {
            hardness: { value: '8/10 Мос',  level: 'critical', bar: 80 },
            temp:     { value: '−180 °C',   level: 'critical', bar: 98 },
            rad:      { value: '0.2 мЗв/ч', level: 'normal',   bar: 8  },
            pore:     { value: '5%',         level: 'normal',   bar: 12 },
        },
    },
    {
        id: 'meteorite_iron',
        name: 'Метеоритный железняк',
        description: 'Плотная металлическая порода с умеренными показателями. Стабильная структура без аномалий — идеальный кандидат для направленного взрыва с шапочным зарядом.',
        methodName: '💣 Направленный взрыв',
        methodCommand: 'detonator --shaped-charge --depth=2m',
        strata: [
            { label: 'Реголит',  color: '#4a3f30', heightPct: 12, anomaly: false },
            { label: 'Железняк', color: '#706060', heightPct: 55, anomaly: true  },
            { label: 'Никель',   color: '#5a5050', heightPct: 20, anomaly: false },
            { label: 'Ядро',     color: '#2a2020', heightPct: 13, anomaly: false },
        ],
        metrics: {
            hardness: { value: '6/10 Мос',  level: 'warning',  bar: 60 },
            temp:     { value: '+200 °C',   level: 'warning',  bar: 60 },
            rad:      { value: '0.4 мЗв/ч', level: 'normal',   bar: 15 },
            pore:     { value: '8%',         level: 'normal',   bar: 18 },
        },
    },
];

const ALL_METHODS = SAMPLES.map(s => ({
    id:      s.id,
    name:    s.methodName,
    command: s.methodCommand,
}));

// ── Состояние модуля ─────────────────────────────────────────────────────────

type GeoPhase = 'cutscene' | 'analysis' | 'result';

let _phase: GeoPhase = 'cutscene';
let _planetId: string | null = null;
let _shipColor = '#7a9e50';
let _currentSample: RockSample | null = null;
let _selectedMethodId: string | null = null;
let _cutscene3d: GeoCutsceneApi | null = null;
let _isDestroyed = false;

let _cutsceneTimer: ReturnType<typeof setTimeout> | null = null;
let _progressTimer: ReturnType<typeof setInterval> | null = null;
let _miscTimers: ReturnType<typeof setTimeout>[] = [];
let _strataRaf: number | null = null;

// ── Глобальный API ───────────────────────────────────────────────────────────

window._miniGameGeology = {
    submitMethod() {
        if (_phase !== 'analysis' || !_selectedMethodId || !_currentSample) return;
        _handleMethodSubmit();
    },
    returnToPlanet() {
        goBack();
    },
};

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    _isDestroyed = false;
    _planetId = store.sessionData?.planetId ?? null;
    _selectedMethodId = null;
    _currentSample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];

    _shipColor = (store.player as any)?.shipColor ?? '#7a9e50';

    playMusic('ambient_minigame');
    _startCutscene();
}

export function destroy(): void {
    _isDestroyed = true;
    _clearAllTimers();
    _stopStrataCanvas();
    _cutscene3d?.stop();
    _cutscene3d?.dispose();
    _cutscene3d = null;
}

// ── Кат-сцена ────────────────────────────────────────────────────────────────

function _startCutscene(): void {
    _phase = 'cutscene';
    _setPhaseLabel('Кат-сцена');
    _showOnly('geo-phase-cutscene');
    _hide('geo-cutscene-alert');

    const canvas = document.getElementById('geo-cutscene-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        _cutsceneTimer = setTimeout(() => { if (!_isDestroyed) _startAnalysis(); }, 500);
        return;
    }

    const DURATION_MS = 8000;
    const t0 = Date.now();
    _progressTimer = setInterval(() => {
        const elapsed = Date.now() - t0;
        const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
        const bar = document.getElementById('geo-cutscene-progress-bar');
        if (bar) bar.style.width = `${pct}%`;
        if (elapsed >= DURATION_MS) _clearProgressTimer();
    }, 100);

    _cutscene3d = createGeoCutscene(canvas, _shipColor, (event) => {
        switch (event) {
            case 'approach':
                _setText('geo-cutscene-headline', 'Приближение к планете...');
                _setText('geo-cutscene-subtext', 'Корабль выходит на орбиту Туманности Геодезистов');
                break;
            case 'asteroid_belt_spotted':
                _setText('geo-cutscene-headline', '⚠️ Астероидный пояс обнаружен!');
                _setText('geo-cutscene-subtext', 'Плотное скопление астероидов блокирует посадочную орбиту');
                _show('geo-cutscene-alert');
                break;
            case 'probe_launched':
                _setText('geo-cutscene-headline', '🛸 Запуск геодезического зонда...');
                _setText('geo-cutscene-subtext', 'Зонд направляется к крупнейшему препятствию');
                _hide('geo-cutscene-alert');
                // Лёгкая вспышка запуска
                const flash = document.getElementById('geo-hit-flash');
                if (flash) {
                    flash.style.opacity = '0.6';
                    _miscTimers.push(setTimeout(() => { if (flash) flash.style.opacity = '0'; }, 200));
                }
                break;
            case 'probe_attached':
                _setText('geo-cutscene-headline', '📡 Зонд закреплён. Анализ породы...');
                _setText('geo-cutscene-subtext', 'Передача сейсмических данных с поверхности астероида');
                _setText('geo-probe-status', '📡 Закреплён');
                break;
            case 'scan_complete':
                _setText('geo-cutscene-headline', '🔬 ТРЕБУЕТСЯ АНАЛИЗ ПОРОДЫ');
                _setText('geo-cutscene-subtext', 'Данные получены. Выберите метод бурения для разблокировки орбиты');
                break;
        }
    });

    _cutscene3d.play().then(() => {
        if (_isDestroyed) return;
        _clearProgressTimer();
        _cutscene3d?.dispose();
        _cutscene3d = null;
        _startAnalysis();
    });
}

// ── Анализ породы ────────────────────────────────────────────────────────────

function _startAnalysis(): void {
    _phase = 'analysis';
    _setPhaseLabel('Анализ');
    _showOnly('geo-phase-analysis');
    if (!_currentSample) return;

    _setText('geo-probe-status', '✅ Данные получены');
    _setText('geo-sample-name', _currentSample.name);
    _setText('geo-sample-desc', _currentSample.description);

    _renderMetrics(_currentSample);
    _renderStrataCanvas(_currentSample);
    _renderMethodList();
}

function _renderMetrics(s: RockSample): void {
    _setMetric('hardness', s.metrics.hardness);
    _setMetric('temp',     s.metrics.temp);
    _setMetric('rad',      s.metrics.rad);
    _setMetric('pore',     s.metrics.pore);
}

function _setMetric(id: 'hardness' | 'temp' | 'rad' | 'pore', m: RockMetric): void {
    const card  = document.getElementById(`metric-${id}`);
    const valEl = document.getElementById(`metric-${id}-val`);
    const barEl = document.getElementById(`metric-${id}-bar`);
    if (valEl) { valEl.textContent = m.value; valEl.className = `geo-metric-value ${m.level}`; }
    if (barEl) { barEl.style.width = `${m.bar}%`; barEl.className = `geo-metric-bar-fill ${m.level}`; }
    if (card)  { card.className = `geo-metric-card ${m.level}`; }
}

// ── Стратиграфический разрез (2D Canvas) ─────────────────────────────────────

function _renderStrataCanvas(s: RockSample): void {
    const canvas = document.getElementById('geo-strata-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    _stopStrataCanvas();

    const resize = () => {
        canvas.width  = canvas.offsetWidth  || 200;
        canvas.height = canvas.offsetHeight || 300;
    };
    resize();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Предвычисляем слои
    interface LayerRect { y: number; h: number; layer: StratumLayer; }
    const rects: LayerRect[] = [];
    let cumY = 0;
    for (const layer of s.strata) {
        const h = (layer.heightPct / 100) * canvas.height;
        rects.push({ y: cumY, h, layer });
        cumY += h;
    }

    let scanY = 0;
    const SCAN_SPEED = canvas.height / 1.8; // пикс/сек
    let lastNow = 0;

    const draw = (now: number) => {
        if (_isDestroyed) { _strataRaf = null; return; }
        const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0;
        lastNow = now;
        scanY = (scanY + SCAN_SPEED * dt) % canvas.height;

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Слои породы
        for (const { y, h: rh, layer } of rects) {
            ctx.fillStyle = layer.color;
            ctx.fillRect(0, y, w, rh);

            // Название слоя
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = `${Math.max(9, w * 0.055)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(layer.label, 6, y + rh * 0.5 + 4);

            // Глубина справа
            const depthM = Math.round((y / h) * 100);
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.font = `${Math.max(8, w * 0.038)}px monospace`;
            ctx.textAlign = 'right';
            ctx.fillText(`${depthM}m`, w - 4, y + 11);
        }

        // Разделители
        for (const { y } of rects.slice(1)) {
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Аномальные рамки (пульсируют)
        for (const { y, h: rh, layer } of rects) {
            if (!layer.anomaly) continue;
            const pulse = 0.35 + 0.35 * Math.sin(now * 0.003);
            ctx.strokeStyle = `rgba(248,113,113,${pulse})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(1, y + 1, w - 2, rh - 2);
        }

        // Сканирующий луч
        const grad = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
        grad.addColorStop(0,   'rgba(122,158,80,0)');
        grad.addColorStop(0.5, 'rgba(122,158,80,0.55)');
        grad.addColorStop(1,   'rgba(122,158,80,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, scanY - 10, w, 20);

        // Яркая линия в центре луча
        ctx.strokeStyle = 'rgba(168,200,120,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(w, scanY);
        ctx.stroke();

        _strataRaf = requestAnimationFrame(draw);
    };

    _strataRaf = requestAnimationFrame(draw);
}

function _stopStrataCanvas(): void {
    if (_strataRaf !== null) { cancelAnimationFrame(_strataRaf); _strataRaf = null; }
}

// ── Список методов ────────────────────────────────────────────────────────────

function _renderMethodList(): void {
    const list = document.getElementById('geo-method-list');
    if (!list) return;

    const shuffled = [...ALL_METHODS].sort(() => Math.random() - 0.5);
    list.innerHTML = shuffled.map(m => `
        <div class="geo-method-option" id="method-opt-${m.id}"
             onclick="window.__geoSelectMethod('${m.id}')">
            <div class="geo-method-radio"></div>
            <div class="geo-method-text">
                <span class="geo-method-name">${m.name}</span>
                <span class="geo-method-command">${_escapeHtml(m.command)}</span>
            </div>
        </div>
    `).join('');

    (window as any).__geoSelectMethod = (id: string) => {
        _selectedMethodId = id;
        document.querySelectorAll('.geo-method-option').forEach(el => el.classList.remove('selected'));
        document.getElementById(`method-opt-${id}`)?.classList.add('selected');
        const btn = document.getElementById('geo-submit-btn') as HTMLButtonElement | null;
        if (btn) btn.disabled = false;
        playSfx('ui_click');
    };
}

// ── Обработка ответа ─────────────────────────────────────────────────────────

async function _handleMethodSubmit(): Promise<void> {
    if (!_currentSample || !_selectedMethodId) return;

    const isCorrect = _selectedMethodId === _currentSample.id;
    const btn = document.getElementById('geo-submit-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    document.querySelectorAll('.geo-method-option').forEach(el => {
        (el as HTMLElement).style.pointerEvents = 'none';
    });

    if (isCorrect) {
        _stopStrataCanvas();

        // Показываем overlay с прогресс-баром
        _show('geo-split-overlay');

        // Запрашиваем награду параллельно с анимацией
        const [, reward] = await Promise.all([
            _playDrillingAndSplit(),
            _fetchReward(),
        ]);

        if (_isDestroyed) return;

        playSfx('planet_unlock');
        if (_planetId) dispatch('DISCOVER_PLANET', { planetId: _planetId });
        if (reward?.valid && reward.crystals) dispatch('EARN_CRYSTALS', { earned: reward.crystals });
        if (reward?.badges?.length) reward.badges.forEach(b => dispatch('ADD_BADGE', { badge: b }));
        dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });

        _hide('geo-split-overlay');
        await _sleep(300);
        if (!_isDestroyed) _showResult(true, _currentSample!.methodName);
    } else {
        playSfx('minigame_crash');
        dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });
        _showResult(false, _currentSample.methodName);
    }
}

async function _playDrillingAndSplit(): Promise<void> {
    // 1. Прогресс-бар бурения (~1.3 сек)
    await _animateDrillProgress(1300);

    if (_isDestroyed) return;
    _setText('geo-drill-label', '💥 АСТЕРОИД РАСКОЛОТ!');

    // 2. Mini-cutscene раскола
    const splitCanvas = document.getElementById('geo-split-canvas') as HTMLCanvasElement | null;
    if (splitCanvas) {
        const sc = createGeoSplitCutscene(splitCanvas);
        await sc.play();
        if (!_isDestroyed) sc.dispose();
    }
}

function _animateDrillProgress(durationMs: number): Promise<void> {
    return new Promise(resolve => {
        const bar   = document.getElementById('geo-drill-bar');
        const label = document.getElementById('geo-drill-label');
        const start = Date.now();

        const tick = setInterval(() => {
            if (_isDestroyed) { clearInterval(tick); resolve(); return; }
            const p = Math.min(1, (Date.now() - start) / durationMs);
            const v = Math.round(p * 100);
            if (bar)   bar.style.width = `${v}%`;
            if (label) label.textContent = `⛏ БУРЕНИЕ... ${v}%`;
            if (p >= 1) { clearInterval(tick); resolve(); }
        }, 30);

        _miscTimers.push(tick as unknown as ReturnType<typeof setTimeout>);
    });
}

async function _fetchReward(): Promise<MiniGameRewardDto | null> {
    try {
        const resp = await fetch('/game?handler=MiniGameResult', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'RequestVerificationToken':
                    (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement)?.value ?? '',
            },
            body: JSON.stringify({ planetId: _planetId, score: 100, timeMs: 6000, passed: true }),
        });
        if (resp.ok) return await resp.json() as MiniGameRewardDto;
    } catch (e) {
        console.warn('[GeoMiniGame] reward fetch failed:', e);
    }
    return null;
}

// ── Результат ────────────────────────────────────────────────────────────────

function _showResult(success: boolean, correctName: string): void {
    _phase = 'result';
    _setPhaseLabel('Результат');
    _showOnly('geo-phase-result');

    const icon       = document.getElementById('geo-result-icon');
    const title      = document.getElementById('geo-result-title');
    const text       = document.getElementById('geo-result-text');
    const correctWrap = document.getElementById('geo-result-correct-wrap');
    const correctEl  = document.getElementById('geo-result-correct-name');
    const returnBtn  = document.getElementById('geo-btn-return');

    if (success) {
        if (icon)  icon.textContent = '✅';
        if (title) { title.textContent = 'Проход открыт! Посадка разрешена!'; title.className = 'geo-result-title success'; }
        if (text)  text.textContent = 'Вы верно определили состав породы и применили подходящий метод. Астероид расколот — орбита свободна. Планета открыта!';
        if (correctWrap) correctWrap.classList.add('hidden');
        if (returnBtn)   returnBtn.textContent = '🌍 Перейти к планете';
    } else {
        if (icon)  icon.textContent = '❌';
        if (title) { title.textContent = 'Неверный метод! Бур повреждён.'; title.className = 'geo-result-title failure'; }
        if (text)  text.textContent = 'Выбранный метод оказался непригоден для данной породы. Оборудование повреждено. Кристаллы затрачены. Соберите новые и повторите попытку.';
        if (correctWrap) correctWrap.classList.remove('hidden');
        if (correctEl)   correctEl.textContent = correctName;
        if (returnBtn)   returnBtn.textContent = '← Вернуться к планете';
    }
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function _showOnly(visibleId: string): void {
    ['geo-phase-cutscene', 'geo-phase-analysis', 'geo-phase-result'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === visibleId) { el.classList.remove('hidden'); el.style.display = ''; }
        else                  { el.classList.add('hidden');    el.style.display = 'none'; }
    });
}

function _show(id: string): void  { document.getElementById(id)?.classList.remove('hidden'); }
function _hide(id: string): void  { document.getElementById(id)?.classList.add('hidden'); }
function _setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
function _setPhaseLabel(label: string): void { _setText('geo-phase-label', label); }

function _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _sleep(ms: number): Promise<void> {
    return new Promise(r => { _miscTimers.push(setTimeout(r, ms)); });
}

function _clearAllTimers(): void {
    if (_cutsceneTimer)  { clearTimeout(_cutsceneTimer);   _cutsceneTimer  = null; }
    _clearProgressTimer();
    _miscTimers.forEach(t => clearTimeout(t));
    _miscTimers = [];
}

function _clearProgressTimer(): void {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
}

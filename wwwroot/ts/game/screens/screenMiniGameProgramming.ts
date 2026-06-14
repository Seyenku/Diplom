/**
 * screenMiniGameProgramming.ts — Мини-игра «Диагностика систем»
 *
 * Туманность Кибернетики. Корабль попадает в электромагнитную бурю,
 * навигационный компьютер выходит из строя. Игрок:
 *  1. Смотрит кинематографическую кат-сцену (~8 сек)
 *  2. Анализирует системные метрики (CPU, RAM, Network, Disk)
 *     и читает лог ошибок в терминале
 *  3. Выбирает правильный патч из 5 вариантов
 *  4. Нажимает «Применить патч»
 *
 * Успех  → DISCOVER_PLANET, награда, возврат к деталям планеты
 * Провал → Кристаллы потеряны (уже списаны в screenPlanetDetail), возврат
 */

import { dispatch, goBack } from '../stateManager.js';
import { GameStore, MiniGameRewardDto } from '../types.js';
import { playSfx, playMusic } from '../audioManager.js';
import { createProgCutscene, ProgCutsceneApi } from './progCutscene3d.js';
import {
    computeScore, setSubmitReady, staggerReveal, animateBarFill, animateNumericText,
    flashAnswerFeedback, fadeSwapPhase, renderResultExtras,
} from './minigameShared.js';

// ── Типы ────────────────────────────────────────────────────────────────────

interface SystemMetric {
    value: string;
    level: 'normal' | 'warning' | 'critical';
    bar: number;
}

interface SystemFault {
    id: string;
    name: string;
    patchName: string;
    patchCommand: string;
    /** Образовательное объяснение: какие метрики и логи указывали на этот сбой. */
    explanation: string;
    logs: string[];
    successLogs: string[];
    metrics: {
        cpu:  SystemMetric;
        ram:  SystemMetric;
        net:  SystemMetric;
        disk: SystemMetric;
    };
}

// ── База сбоев ───────────────────────────────────────────────────────────────

const FAULTS: readonly SystemFault[] = [
    {
        id: 'memory_leak',
        name: 'Утечка памяти',
        patchName: '🧹 Сборщик мусора',
        patchCommand: 'gc --force --deep-clean',
        explanation: 'RAM заполнена на 15.7 из 16 ГБ — единственная критическая метрика. В логах OutOfMemoryException и зависший GC: память не освобождается сама. Принудительная глубокая сборка мусора очищает кучу и перезапускает навигацию.',
        logs: [
            'OutOfMemoryException: heap size exceeded 15.7 GB',
            'GC stalled for 8420 ms — unable to reclaim memory',
            'WARNING: NavSystem.alloc() returned null pointer',
            'FATAL: Navigation process terminated (OOM)',
        ],
        successLogs: [
            'INFO gc --force --deep-clean: starting deep GC cycle...',
            'INFO Freed 12.4 GB — heap usage: 3.3 / 16 GB',
            'INFO NavSystem.alloc() OK — memory pool restored',
            'INFO Navigation process restarted successfully',
        ],
        metrics: {
            cpu:  { value: '78%',       level: 'warning',  bar: 78 },
            ram:  { value: '15.7 / 16 GB', level: 'critical', bar: 98 },
            net:  { value: '120 ms',    level: 'normal',   bar: 24 },
            disk: { value: '45 MB/s',   level: 'normal',   bar: 45 },
        },
    },
    {
        id: 'infinite_loop',
        name: 'Бесконечный цикл',
        patchName: '🛑 Аварийный останов потока',
        patchCommand: 'kill -9 thread:main_nav',
        explanation: 'CPU застрял на 99%, хотя память, сеть и диск в норме. StackOverflowError в recalcRoute() и заблокированный поток main_nav — программа крутится в бесконечном цикле, который лечится только аварийным остановом потока.',
        logs: [
            'StackOverflowError in NavComputer.recalcRoute()',
            'Thread:main_nav blocked — CPU 100% for 12 seconds',
            'Watchdog: NavController not responding (timeout)',
            'ERROR: System unresponsive — manual intervention required',
        ],
        successLogs: [
            'INFO kill -9 thread:main_nav: signal sent',
            'INFO Thread:main_nav terminated — CPU usage: 12%',
            'INFO NavController restarted — watchdog OK',
            'INFO Navigation system online — all routes nominal',
        ],
        metrics: {
            cpu:  { value: '99%',     level: 'critical', bar: 99 },
            ram:  { value: '4.2 GB',  level: 'normal',   bar: 26 },
            net:  { value: '95 ms',   level: 'normal',   bar: 19 },
            disk: { value: '60 MB/s', level: 'normal',   bar: 60 },
        },
    },
    {
        id: 'ddos',
        name: 'DDoS-атака',
        patchName: '🛡️ Активация файрвола',
        patchCommand: 'firewall --enable --block-all',
        explanation: 'Сеть деградировала до 9999 мс при нормальных CPU и RAM, а в логах 48 291 попытка подключения за 10 секунд и сканирование портов — атака извне. Файрвол блокирует вредоносный трафик и возвращает канал связи.',
        logs: [
            'Connection refused: 48291 attempts in last 10 seconds',
            'Port scan detected from 192.168.0.0/8 range',
            'WARNING: NavSystem bandwidth saturated (100%)',
            'ERROR: Navigation uplink timeout — 9999 ms',
        ],
        successLogs: [
            'INFO firewall --enable --block-all: rules applied',
            'INFO Blocked 48291 malicious connections',
            'INFO Network latency: 9999 ms → 87 ms',
            'INFO Navigation uplink restored — signal stable',
        ],
        metrics: {
            cpu:  { value: '65%',      level: 'warning',  bar: 65 },
            ram:  { value: '5.1 GB',   level: 'normal',   bar: 32 },
            net:  { value: '9999 ms',  level: 'critical', bar: 100 },
            disk: { value: '30 MB/s',  level: 'normal',   bar: 30 },
        },
    },
    {
        id: 'fs_corruption',
        name: 'Повреждение файловой системы',
        patchName: '💿 Восстановление ФС',
        patchCommand: 'fsck --repair /dev/nav0',
        explanation: 'Диск читает 0 МБ/с — остальные метрики в норме. Ошибки ввода-вывода, повреждённый inode и несовпадение CRC в логах указывают на разрушенную файловую систему: её восстанавливает fsck --repair.',
        logs: [
            'I/O Error: read failed at block 0x4F2A (inode 8192)',
            'Inode corrupted: /nav/routes/sector_7.dat',
            'Disk read timeout on /dev/nav0 — retries exhausted',
            'ERROR: NavSystem cannot load route database (CRC mismatch)',
        ],
        successLogs: [
            'INFO fsck --repair /dev/nav0: scanning 32768 inodes...',
            'INFO Repaired 7 corrupted inodes, 2 bad blocks remapped',
            'INFO Disk I/O: 0 MB/s → 52 MB/s — drive healthy',
            'INFO NavSystem route database loaded — CRC OK',
        ],
        metrics: {
            cpu:  { value: '25%',    level: 'normal',   bar: 25 },
            ram:  { value: '3.8 GB', level: 'normal',   bar: 24 },
            net:  { value: '110 ms', level: 'normal',   bar: 22 },
            disk: { value: '0 MB/s', level: 'critical', bar: 1 },
        },
    },
    {
        id: 'miner_virus',
        name: 'Вирус-майнер',
        patchName: '🦠 Антивирусная изоляция',
        patchCommand: 'quarantine --scan --purge',
        explanation: 'Подняты сразу ВСЕ четыре метрики: CPU 95%, память, сеть и диск. Так выглядит чужой процесс, пожирающий ресурсы: [cryptod] и крипто-хэши в логах выдают вирус-майнер. Антивирусный карантин изолирует и удаляет его.',
        logs: [
            'Unknown process [cryptod] consuming 72% CPU',
            'Crypto hash detected: SHA-3 brute-force activity',
            'WARNING: NavSystem priority lowered by rogue process',
            'ALERT: Suspicious outbound traffic — 800 ms latency spike',
        ],
        successLogs: [
            'INFO quarantine --scan --purge: found 3 infected files',
            'INFO [cryptod] isolated and purged from /tmp/.sys/',
            'INFO CPU usage: 95% → 18% — NavSystem priority restored',
            'INFO Network latency: 800 ms → 94 ms — system clean',
        ],
        metrics: {
            cpu:  { value: '95%',     level: 'critical', bar: 95 },
            ram:  { value: '12.1 GB', level: 'warning',  bar: 76 },
            net:  { value: '800 ms',  level: 'warning',  bar: 80 },
            disk: { value: '90 MB/s', level: 'warning',  bar: 90 },
        },
    },
];

// Все патчи (для отображения в списке)
const ALL_PATCHES = FAULTS.map(f => ({
    id: f.id,
    name: f.patchName,
    command: f.patchCommand,
}));

// ── Состояние модуля ─────────────────────────────────────────────────────────

type ProgPhase = 'cutscene' | 'diagnosis' | 'result';

let _phase: ProgPhase = 'cutscene';
let _planetId: string | null = null;
let _shipColor = '#4fc3f7';
let _currentFault: SystemFault | null = null;
let _selectedPatchId: string | null = null;
let _diagnosisStartTime = 0;
let _cutsceneTimer: ReturnType<typeof setTimeout> | null = null;
let _progressTimer: ReturnType<typeof setInterval> | null = null;
let _logTimers: ReturnType<typeof setTimeout>[] = [];
let _logQueue: string[] = []; // невыведенные строки лога (для flushLogs по тапу)
let _cutscene3d: ProgCutsceneApi | null = null;
let _isDestroyed = false;

// ── Глобальный API ───────────────────────────────────────────────────────────

window._miniGameProgramming = {
    submitPatch() {
        if (_phase !== 'diagnosis' || !_selectedPatchId || !_currentFault) return;
        _handlePatchSubmit();
    },
    returnToPlanet() {
        goBack();
    },
    skipCutscene() {
        if (_phase !== 'cutscene' || !_cutscene3d) return;
        playSfx('ui_click');
        _cutscene3d.stop(); // резолвит play() → существующий .then() перейдёт к диагностике
    },
    selectPatch(id: string) {
        if (_phase !== 'diagnosis') return;
        _selectedPatchId = id;
        document.querySelectorAll('.prog-patch-option').forEach(el => el.classList.remove('selected'));
        document.getElementById(`patch-opt-${id}`)?.classList.add('selected');
        setSubmitReady(document.getElementById('prog-submit-btn') as HTMLButtonElement | null, true);
        playSfx('ui_click');
    },
    // Микро-интерактив: тап по терминалу мгновенно выводит оставшиеся строки лога
    flushLogs() {
        if (_phase !== 'diagnosis' || _logQueue.length === 0) return;
        while (_logQueue.length > 0) _emitNextLog();
        playSfx('ui_click');
    },
};

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    _isDestroyed = false;
    _planetId = store.sessionData?.planetId ?? null;
    _selectedPatchId = null;
    _currentFault = _pickRandomFault();

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

function _startCutscene(): void {
    _phase = 'cutscene';
    _setPhaseLabel('Кат-сцена');
    _showOnly('prog-phase-cutscene');
    _hide('prog-cutscene-alert');

    const canvas = document.getElementById('prog-cutscene-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        _cutsceneTimer = setTimeout(() => { if (!_isDestroyed) _startDiagnosis(); }, 500);
        return;
    }

    const CUTSCENE_DURATION_MS = 8000;
    const startTime = Date.now();
    _progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, (elapsed / CUTSCENE_DURATION_MS) * 100);
        const bar = document.getElementById('prog-cutscene-progress-bar');
        if (bar) bar.style.width = `${pct}%`;
        if (elapsed >= CUTSCENE_DURATION_MS) _clearProgressTimer();
    }, 100);

    _cutscene3d = createProgCutscene(canvas, _shipColor, (event) => {
        switch (event) {
            case 'approach':
                _setText('prog-cutscene-headline', 'Приближение к планете...');
                _setText('prog-cutscene-subtext', 'Корабль выходит на орбиту Туманности Кибернетики');
                break;
            case 'em_storm_detected':
                _setText('prog-cutscene-headline', '⚡ Обнаружена ЭМ-буря!');
                _setText('prog-cutscene-subtext', 'Электромагнитная аномалия — уровень опасности критический');
                _show('prog-cutscene-alert');
                break;
            case 'system_failure':
                _setText('prog-cutscene-headline', '⚠️ Критический сбой систем!');
                _setText('prog-cutscene-subtext', 'Навигационный компьютер не отвечает на команды');
                _hide('prog-cutscene-alert');
                break;
            case 'computer_offline':
                _setText('prog-cutscene-headline', '🖥️ Навигационный компьютер offline');
                _setText('prog-cutscene-subtext', 'Требуется диагностика и применение экстренного патча');
                break;
        }
    });

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
    _showOnly('prog-phase-diagnosis');
    if (!_currentFault) return;

    _diagnosisStartTime = Date.now();
    _renderMetrics(_currentFault);
    _renderLogs(_currentFault.logs);
    _renderPatchList();

    setSubmitReady(document.getElementById('prog-submit-btn') as HTMLButtonElement | null, false);

    const phaseEl = document.getElementById('prog-phase-diagnosis');
    if (phaseEl) {
        staggerReveal(phaseEl, '.prog-metric-card');
        staggerReveal(phaseEl, '.prog-patch-option', 60);
    }
}

function _renderMetrics(fault: SystemFault): void {
    _setMetric('cpu',  fault.metrics.cpu);
    _setMetric('ram',  fault.metrics.ram);
    _setMetric('net',  fault.metrics.net);
    _setMetric('disk', fault.metrics.disk);
}

function _setMetric(id: 'cpu' | 'ram' | 'net' | 'disk', m: SystemMetric): void {
    const card  = document.getElementById(`metric-${id}`);
    const valEl = document.getElementById(`metric-${id}-val`);
    const barEl = document.getElementById(`metric-${id}-bar`);

    if (valEl) {
        valEl.className = `prog-metric-value ${m.level}`;
        animateNumericText(valEl, m.value);
    }
    if (barEl) {
        barEl.className = `prog-metric-bar-fill ${m.level}`;
        animateBarFill(barEl, m.bar);
    }
    if (card) {
        card.className = `prog-metric-card ${m.level}`;
    }
}

function _renderLogs(logs: string[]): void {
    const terminal = document.getElementById('prog-log-output');
    if (!terminal) return;
    terminal.innerHTML = '';

    // Очередь: строки выводятся таймерами по одной, тап по терминалу
    // (flushLogs) высыпает остаток мгновенно.
    _logQueue = [...logs];
    logs.forEach((_, i) => {
        const timer = setTimeout(() => {
            if (_isDestroyed) return;
            _emitNextLog();
            playSfx('ui_click');
        }, i * 400);
        _logTimers.push(timer);
    });
}

/** Выводит головную строку очереди логов в терминал (no-op при пустой очереди). */
function _emitNextLog(): void {
    const line = _logQueue.shift();
    if (line === undefined) return;
    const terminal = document.getElementById('prog-log-output');
    if (!terminal) return;
    const el = document.createElement('div');
    el.className = 'prog-log-line';
    const levelClass = _logLevelClass(line);
    el.innerHTML = `<span class="prog-log-time">[${_fmtTime()}]</span> <span class="prog-log-level ${levelClass}">${levelClass.toUpperCase()}</span> ${_escapeHtml(line)}`;
    terminal.appendChild(el);
    terminal.scrollTop = terminal.scrollHeight;
}

function _renderPatchList(): void {
    const list = document.getElementById('prog-patch-list');
    if (!list) return;

    const shuffled = [...ALL_PATCHES].sort(() => Math.random() - 0.5);

    // Выбор — через data-action-мост (inline onclick блокируется CSP).
    list.innerHTML = shuffled.map(p => `
        <div class="prog-patch-option" id="patch-opt-${p.id}"
             data-action="miniGameProgramming.selectPatch" data-arg="${p.id}">
            <div class="prog-patch-radio"></div>
            <div class="prog-patch-text">
                <span class="prog-patch-name">${p.name}</span>
                <span class="prog-patch-command">${_escapeHtml(p.command)}</span>
            </div>
        </div>
    `).join('');
    list.style.pointerEvents = '';
}

// ── Обработка ответа ─────────────────────────────────────────────────────────

async function _handlePatchSubmit(): Promise<void> {
    if (!_currentFault || !_selectedPatchId) return;

    const fault = _currentFault;
    const isCorrect = _selectedPatchId === fault.id;
    const timeMs = Math.max(3000, Date.now() - _diagnosisStartTime);
    const score = computeScore(timeMs);

    // Блокируем повторный сабмит и дальнейший выбор вариантов
    setSubmitReady(document.getElementById('prog-submit-btn') as HTMLButtonElement | null, false);
    const list = document.getElementById('prog-patch-list');
    if (list) list.style.pointerEvents = 'none';

    const selectedEl = document.getElementById(`patch-opt-${_selectedPatchId}`);
    const correctEl  = document.getElementById(`patch-opt-${fault.id}`);

    dispatch('INCREMENT_STAT', { key: 'miniGamesPlayed' });

    if (isCorrect) {
        if (_planetId) {
            dispatch('DISCOVER_PLANET', { planetId: _planetId });
        }

        // Параллельно: фидбек по ответу, success-логи в терминале и запрос награды
        const [, , reward] = await Promise.all([
            flashAnswerFeedback(selectedEl, correctEl, true),
            _appendSuccessLogs(fault.successLogs),
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
        await fadeSwapPhase('prog-phase-diagnosis', () => _showResult(true, fault, timeMs, score, badges));
    } else {
        await flashAnswerFeedback(selectedEl, correctEl, false);
        if (_isDestroyed) return;
        playSfx('minigame_crash');
        await fadeSwapPhase('prog-phase-diagnosis', () => _showResult(false, fault, timeMs, null, []));
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
        console.warn('[ProgMiniGame] reward fetch failed:', e);
    }
    return null;
}

/** Дописывает строки успешного восстановления в терминал, по одной с задержкой. */
function _appendSuccessLogs(logs: string[]): Promise<void> {
    return new Promise(resolve => {
        const terminal = document.getElementById('prog-log-output');

        // Разделитель между ошибками и успехом
        if (terminal) {
            const sep = document.createElement('div');
            sep.className = 'prog-log-separator';
            terminal.appendChild(sep);
        }

        logs.forEach((line, i) => {
            const timer = setTimeout(() => {
                if (_isDestroyed) return;
                if (terminal) {
                    const el = document.createElement('div');
                    el.className = 'prog-log-line success';
                    const time = _fmtTime();
                    el.innerHTML = `<span class="prog-log-time">[${time}]</span> <span class="prog-log-level ok">OK</span> ${_escapeHtml(line)}`;
                    terminal.appendChild(el);
                    terminal.scrollTop = terminal.scrollHeight;
                }
                playSfx('ui_click');
                if (i === logs.length - 1) resolve();
            }, i * 400);
            _logTimers.push(timer);
        });
    });
}

// ── Результат ────────────────────────────────────────────────────────────────

function _showResult(success: boolean, fault: SystemFault, timeMs: number, score: number | null, badges: string[]): void {
    _phase = 'result';
    _setPhaseLabel('Результат');
    _showOnly('prog-phase-result');

    const icon       = document.getElementById('prog-result-icon');
    const title      = document.getElementById('prog-result-title');
    const text       = document.getElementById('prog-result-text');
    const correctWrap = document.getElementById('prog-result-correct-wrap');
    const correctEl  = document.getElementById('prog-result-correct-name');
    const returnBtn  = document.getElementById('prog-btn-return');

    if (success) {
        if (icon)  icon.textContent = '✅';
        if (title) { title.textContent = 'Патч применён! Системы восстановлены!'; title.className = 'prog-result-title success'; }
        if (text)  text.textContent = 'Вы верно определили сбой и применили нужный патч. Навигационный компьютер перезагружается. Планета открыта!';
        if (correctWrap) correctWrap.classList.add('hidden');
        if (returnBtn)   returnBtn.textContent = '🌍 Перейти к планете';
    } else {
        if (icon)  icon.textContent = '❌';
        if (title) { title.textContent = 'Неверный патч. Системы повреждены!'; title.className = 'prog-result-title failure'; }
        if (text)  text.textContent = 'Применённый патч не устранил сбой. Кристаллы затрачены на попытку. Соберите новые кристаллы и попробуйте снова.';
        if (correctWrap) correctWrap.classList.remove('hidden');
        if (correctEl)   correctEl.textContent = fault.patchName;
        if (returnBtn)   returnBtn.textContent = '← Вернуться к планете';
    }

    renderResultExtras({
        prefix: 'prog', success, timeMs, score, badges,
        explanation: fault.explanation,
        accentColor: '#4fc3f7',
    });
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function _pickRandomFault(): SystemFault {
    return FAULTS[Math.floor(Math.random() * FAULTS.length)];
}

function _logLevelClass(line: string): string {
    const l = line.toLowerCase();
    if (l.startsWith('fatal') || l.startsWith('alert')) return 'error';
    if (l.startsWith('error')) return 'error';
    if (l.startsWith('warning') || l.startsWith('warn')) return 'warn';
    return 'info';
}

function _fmtTime(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showOnly(visibleId: string): void {
    const phases = ['prog-phase-cutscene', 'prog-phase-diagnosis', 'prog-phase-result'];
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
    _setText('prog-phase-label', label);
}

function _clearTimers(): void {
    if (_cutsceneTimer)  { clearTimeout(_cutsceneTimer);  _cutsceneTimer = null; }
    _clearProgressTimer();
    _logTimers.forEach(t => clearTimeout(t));
    _logTimers = [];
    _logQueue = [];
}

function _clearProgressTimer(): void {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
}

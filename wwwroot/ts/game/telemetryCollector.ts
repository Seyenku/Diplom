/**
 * telemetryCollector.ts — Клиентский сборщик телеметрии
 *
 * Собирает игровые события в буфер и периодически отправляет
 * на сервер batch-запросом. При закрытии окна — flush.
 *
 * Использование:
 *   import { telemetry } from './telemetryCollector.js';
 *   telemetry.track('SCREEN_CHANGED', { from: 'main-menu', to: 'flight' });
 */

import { TelemetryEventDto } from './types.js';

const FLUSH_INTERVAL_MS = 15_000; // 15 секунд
const MAX_BUFFER_SIZE   = 50;     // макс. событий в буфере до принудительного flush
const ENDPOINT          = '/game?handler=Telemetry';

// ── Состояние ───────────────────────────────────────────────────────────────

let _sessionId: string | null = null;
let _buffer: TelemetryEventDto[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _started = false;

// ── Публичный API ───────────────────────────────────────────────────────────

export const telemetry = {
    /**
     * Инициализирует сессию телеметрии.
     * Вызывается один раз при старте SPA.
     */
    startSession(): void {
        if (_started) return;
        _started = true;

        _sessionId = _generateSessionId();

        // Регистрируем сессию
        _send({
            sessionId: _sessionId,
            action: 'SESSION_START',
            details: JSON.stringify({
                deviceType: _getDeviceType(),
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight,
                userAgent: navigator.userAgent.substring(0, 200),
                timestamp: new Date().toISOString(),
            }),
        });

        // Автоматический flush
        _flushTimer = setInterval(() => _flush(), FLUSH_INTERVAL_MS);

        // Flush при закрытии
        window.addEventListener('beforeunload', () => {
            _track('SESSION_END', {});
            _flush(true);
        });

        // Visibility change (мобильные браузеры)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) _flush();
        });
    },

    /**
     * Отслеживает игровое событие.
     * @param actionType — тип действия (e.g. 'SCREEN_CHANGED', 'CRYSTAL_COLLECTED')
     * @param details    — дополнительные данные
     * @param targetId   — ID связанного объекта (планеты и т.п.)
     */
    track(actionType: string, details: Record<string, unknown> = {}, targetId: string | null = null): void {
        _track(actionType, details, targetId);
    },

    /** Принудительный flush буфера */
    flush(): void { _flush(); },

    /** Получить ID текущей сессии */
    getSessionId(): string | null { return _sessionId; },
};

// ── Внутренние функции ──────────────────────────────────────────────────────

function _track(actionType: string, details: Record<string, unknown> = {}, targetId: string | null = null): void {
    if (!_started) return;

    _buffer.push({
        sessionId: _sessionId!,
        actionType,
        targetId,
        createdAt: Date.now() as unknown as string, // stored as number, converted at flush
        details: JSON.stringify(details),
    });

    if (_buffer.length >= MAX_BUFFER_SIZE) {
        _flush();
    }
}

async function _flush(sync = false): Promise<void> {
    if (_buffer.length === 0) return;

    const batch = _buffer.map(e => ({
        ...e,
        createdAt: typeof e.createdAt === 'number'
            ? new Date(e.createdAt as unknown as number).toISOString()
            : e.createdAt,
    }));
    _buffer = [];

    const body = JSON.stringify({ events: batch });

    if (sync && navigator.sendBeacon) {
        // sendBeacon для beforeunload (надёжнее чем fetch)
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        return;
    }

    try {
        await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'RequestVerificationToken': (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement)?.value ?? ''
            },
            body,
            keepalive: true,
        });
    } catch (e) {
        // При ошибке — возвращаем события в буфер
        _buffer.unshift(...batch);
        console.warn('[Telemetry] flush failed, events re-buffered:', e);
    }
}

function _send(event: { sessionId: string; action: string; details: string }): void {
    _buffer.push({
        sessionId: event.sessionId,
        actionType: event.action,
        targetId: null,
        createdAt: Date.now() as unknown as string, // stored as number, converted at flush
        details: event.details,
    });
}

function _generateSessionId(): string {
    // Простой UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function _getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
}

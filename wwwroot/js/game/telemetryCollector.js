/**
 * telemetryCollector.js — Клиентский сборщик телеметрии
 *
 * Собирает игровые события в буфер и периодически отправляет
 * на сервер batch-запросом. При закрытии окна — flush.
 *
 * Использование:
 *   import { telemetry } from './telemetryCollector.js';
 *   telemetry.track('SCREEN_CHANGED', { from: 'main-menu', to: 'flight' });
 */

const FLUSH_INTERVAL_MS = 15_000; // 15 секунд
const MAX_BUFFER_SIZE   = 50;     // макс. событий в буфере до принудительного flush
const ENDPOINT          = '/game?handler=Telemetry';

// ── Состояние ───────────────────────────────────────────────────────────────

let _sessionId = null;
let _buffer    = [];
let _flushTimer = null;
let _started    = false;

// ── Публичный API ───────────────────────────────────────────────────────────

export const telemetry = {
    /**
     * Инициализирует сессию телеметрии.
     * Вызывается один раз при старте SPA.
     */
    startSession() {
        if (_started) return;
        _started = true;

        _sessionId = _generateSessionId();

        // Регистрируем сессию
        _send({
            sessionId: _sessionId,
            action: 'SESSION_START',
            details: {
                deviceType: _getDeviceType(),
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight,
                userAgent: navigator.userAgent.substring(0, 200),
                timestamp: new Date().toISOString(),
            }
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
     * @param {string} actionType — тип действия (e.g. 'SCREEN_CHANGED', 'CRYSTAL_COLLECTED')
     * @param {object} details    — дополнительные данные
     * @param {number} [targetId] — ID связанного объекта (планеты и т.п.)
     */
    track(actionType, details = {}, targetId = null) {
        _track(actionType, details, targetId);
    },

    /** Принудительный flush буфера */
    flush() { _flush(); },

    /** Получить ID текущей сессии */
    getSessionId() { return _sessionId; },
};

// ── Внутренние функции ──────────────────────────────────────────────────────

function _track(actionType, details = {}, targetId = null) {
    if (!_started) return;

    _buffer.push({
        sessionId: _sessionId,
        actionType,
        targetId,
        createdAt: new Date().toISOString(),
        details: JSON.stringify(details),
    });

    if (_buffer.length >= MAX_BUFFER_SIZE) {
        _flush();
    }
}

async function _flush(sync = false) {
    if (_buffer.length === 0) return;

    const batch = [..._buffer];
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
                'RequestVerificationToken': document.querySelector('input[name="__RequestVerificationToken"]')?.value ?? ''
            },
            body,
            keepalive: true, // для beforeunload
        });
    } catch (e) {
        // При ошибке — возвращаем события в буфер
        _buffer.unshift(...batch);
        console.warn('[Telemetry] flush failed, events re-buffered:', e);
    }
}

function _send(event) {
    _buffer.push({
        sessionId: event.sessionId,
        actionType: event.action,
        targetId: null,
        createdAt: new Date().toISOString(),
        details: JSON.stringify(event.details),
    });
}

function _generateSessionId() {
    // Простой UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function _getDeviceType() {
    const ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) return 'mobile';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'desktop';
}

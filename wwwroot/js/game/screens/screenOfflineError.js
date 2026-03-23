/**
 * screenOfflineError.js — Экран офлайн-ошибки
 */
export async function init(store) {
    const err  = store.sessionData?.errorMessage ?? '';
    const log  = store.sessionData?.errorLog     ?? '';
    const msgEl  = document.getElementById('offline-error-message');
    const logEl  = document.getElementById('offline-error-log');
    if (msgEl && err) msgEl.textContent = err;
    if (logEl && log) logEl.textContent = log;
}

export function destroy() {}

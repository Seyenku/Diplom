/**
 * screenOfflineError.ts — Экран офлайн-ошибки
 */

import { GameStore } from '../types.js';

export async function init(store: Readonly<GameStore>): Promise<void> {
    const err  = store.sessionData?.errorMessage ?? '';
    const log  = store.sessionData?.errorLog     ?? '';
    const msgEl  = document.getElementById('offline-error-message');
    const logEl  = document.getElementById('offline-error-log');
    if (msgEl && err) msgEl.textContent = err;
    if (logEl && log) logEl.textContent = log;
}

export function destroy(): void {}

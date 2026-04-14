/**
 * screenMainMenu.ts — Модуль экрана главного меню
 */

import { transition, loadSavedPlayer, Screen, ScreenId, getStore } from '../stateManager.js';
import { GameStore } from '../types.js';
import { switchScene } from '../threeScene.js';

// Глобальный API для onclick-атрибутов в HTML
window._spa = window._spa ?? {} as typeof window._spa;
window._spa.newGame      = () => transition(Screen.CHAR_CREATION);
window._spa.continueGame = () => transition(Screen.GALAXY_MAP);
window._spa.openSettings = () => transition(Screen.SETTINGS);
window._spa.goBack       = () => { import('../stateManager.js').then(m => m.goBack()); };
window._spa.goto         = (s: ScreenId) => transition(s);
window._spa.pause        = () => transition(Screen.PAUSE ?? Screen.SETTINGS);
window._spa.toggleGuide  = () => {
    const panel = document.getElementById('guide-panel');
    panel?.classList.toggle('hidden');
};

export async function init(_store: Readonly<GameStore>): Promise<void> {
    // Фоновая сцена — звёздное поле
    await switchScene('starfield');

    // Показываем кнопку «Продолжить» если есть сохранение
    const hasSave = loadSavedPlayer();
    const continueBtn = document.getElementById('btn-continue');
    if (continueBtn) {
        (continueBtn as HTMLElement).style.display = hasSave ? '' : 'none';
    }
}

export function destroy(): void {}

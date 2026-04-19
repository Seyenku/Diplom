/**
 * screenMainMenu.ts — Модуль экрана главного меню
 */

import { transition, loadSavedPlayer, Screen, ScreenId, getStore } from '../stateManager.js';
import { GameStore } from '../types.js';
import { switchScene } from '../threeScene.js';


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

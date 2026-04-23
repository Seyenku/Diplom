/**
 * screenMainMenu.ts — Модуль экрана главного меню
 */

import { transition, loadSavedPlayer, Screen, ScreenId, getStore } from '../stateManager.js';
import { GameStore } from '../types.js';
import { switchScene } from '../threeScene.js';
import { playMusic } from '../audioManager.js';


export async function init(_store: Readonly<GameStore>): Promise<void> {
    playMusic('ambient_menu');
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

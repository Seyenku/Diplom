/**
 * screenSettings.ts — Настройки и доступность
 */

import { getStore, dispatch } from '../stateManager.js';
import { GameStore } from '../types.js';

window._settings = {
    update(key: string, value: string | number) {
        dispatch('SET_SETTINGS', { [key]: isNaN(Number(value)) ? value : parseFloat(String(value)) });
    },
    saveAndApply() {
        const s = (getStore().settings ?? {}) as Partial<import('../types.js').GameSettingsDto>;
        dispatch('SET_SETTINGS', s as import('../types.js').ActionPayload['SET_SETTINGS']);
        // Применяем масштаб UI через CSS-переменную (работает поверх авто-адаптации clamp)
        document.documentElement.style.setProperty('--user-ui-scale', String(s.uiScale ?? 1.0));
        alert('Настройки сохранены.');
    }
};

export async function init(store: Readonly<import('../types.js').GameStore>): Promise<void> {
    const s = (store.settings ?? {}) as Partial<import('../types.js').GameSettingsDto>;
    _setVal('setting-sound',      (s.soundVolume   ?? 0.7) * 100);
    _setVal('setting-music',      (s.musicVolume   ?? 0.5) * 100);
    _setVal('setting-graphics',    s.graphicsQuality ?? 'medium');
    _setVal('setting-controls',    s.controlScheme  ?? 'keyboard');
    _setChk('setting-subtitles',   s.subtitles      ?? false);
    _setChk('setting-colorblind',  s.colorblindMode ?? false);
    _setChk('setting-guide',       s.guideEnabled   ?? true);
    _setVal('setting-uiscale',    (s.uiScale        ?? 1.0) * 100);
}

export function destroy(): void {}

function _setVal(id: string, v: string | number): void {
    const e = document.getElementById(id) as HTMLInputElement;
    if (e) e.value = String(v);
}

function _setChk(id: string, v: boolean): void {
    const e = document.getElementById(id) as HTMLInputElement;
    if (e) e.checked = v;
}

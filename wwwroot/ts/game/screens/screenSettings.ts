/**
 * screenSettings.ts — Настройки и доступность
 */

import { getStore, dispatch, saveSettingsNow } from '../stateManager.js';
import { GameStore } from '../types.js';
import { setQuality, QualityLevel } from '../qualityPresets.js';
import { setSfxVolume, setMusicVolume, playSfx } from '../audioManager.js';

window._settings = {
    update(key: string, value: string | number | boolean) {
        let parsed = value;
        if (typeof value !== 'boolean') {
            parsed = isNaN(Number(value)) ? value : parseFloat(String(value));
        }
        dispatch('SET_SETTINGS', { [key]: parsed });
        // Мгновенное применение качества графики
        if (key === 'graphicsQuality') {
            setQuality(value as QualityLevel);
        } else if (key === 'soundVolume') {
            setSfxVolume(parseFloat(String(value)) / 100);
            playSfx('ui_hover'); // звук для проверки громкости
        } else if (key === 'musicVolume') {
            setMusicVolume(parseFloat(String(value)) / 100);
        }
    },
    saveAndApply() {
        const s = (getStore().settings ?? {}) as Partial<import('../types.js').GameSettingsDto>;
        dispatch('SET_SETTINGS', s as import('../types.js').ActionPayload['SET_SETTINGS']);
        // Применяем масштаб UI через CSS-переменную (работает поверх авто-адаптации clamp)
        document.documentElement.style.setProperty('--user-ui-scale', String(s.uiScale ?? 1.0));
        // Применяем качество графики
        if (s.graphicsQuality) setQuality(s.graphicsQuality as QualityLevel);
        
        saveSettingsNow(); // Сохраняем в localStorage
        playSfx('ui_success');
        alert('Настройки сохранены.');
    }
};

export async function init(store: Readonly<import('../types.js').GameStore>): Promise<void> {
    const s = (store.settings ?? {}) as Partial<import('../types.js').GameSettingsDto>;
    _setVal('setting-sound',      (s.soundVolume   ?? 0.7) * 100);
    _setVal('setting-music',      (s.musicVolume   ?? 0.5) * 100);
    _setVal('setting-graphics',    s.graphicsQuality ?? 'medium');
    _setChk('setting-bloom',       s.useBloom       ?? true);
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

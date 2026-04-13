/**
 * screenSettings.js — Настройки и доступность
 */
import { getStore, dispatch } from '../stateManager.js';

window._settings = {
    update(key, value) {
        dispatch('SET_SETTINGS', { [key]: isNaN(value) ? value : parseFloat(value) });
    },
    saveAndApply() {
        const s = getStore().settings ?? {};
        dispatch('SET_SETTINGS', s); // гарантируем сохранение в localStorage
        // Применяем масштаб UI через CSS-переменную (работает поверх авто-адаптации clamp)
        document.documentElement.style.setProperty('--user-ui-scale', s.uiScale ?? 1.0);
        alert('Настройки сохранены.');
    }
};

export async function init(store) {
    const s = store.settings ?? {};
    _setVal('setting-sound',      (s.soundVolume   ?? 0.7) * 100);
    _setVal('setting-music',      (s.musicVolume   ?? 0.5) * 100);
    _setVal('setting-graphics',    s.graphicsQuality ?? 'medium');
    _setVal('setting-controls',    s.controlScheme  ?? 'keyboard');
    _setChk('setting-subtitles',   s.subtitles      ?? false);
    _setChk('setting-colorblind',  s.colorblindMode ?? false);
    _setChk('setting-guide',       s.guideEnabled   ?? true);
    _setVal('setting-uiscale',    (s.uiScale        ?? 1.0) * 100);
}

export function destroy() {}

function _setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
function _setChk(id, v) { const e = document.getElementById(id); if (e) e.checked = v; }

/**
 * screenSettings.ts — Настройки и доступность
 */

import { getStore, dispatch, saveSettingsNow } from '../stateManager.js';
import { GameStore } from '../types.js';
import { setQuality, QualityLevel } from '../qualityPresets.js';
import { setSfxVolume, setMusicVolume, playSfx } from '../audioManager.js';

let _bindingAction: string | null = null;
let _currentBinds = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    boost: 'Space'
};

function _formatKey(code: string): string {
    if (code.startsWith('Key')) return code.substring(3);
    if (code.startsWith('Digit')) return code.substring(5);
    if (code === 'Space') return 'Space';
    return code;
}

function _updateKeybindBlockState(scheme: string): void {
    const block = document.getElementById('settings-keybindings-block');
    if (!block) return;
    if (scheme === 'mouse') {
        block.style.opacity = '0.5';
        block.style.pointerEvents = 'none';
    } else {
        block.style.opacity = '1';
        block.style.pointerEvents = 'auto';
    }
}

function _onKeyDownBind(e: KeyboardEvent) {
    if (!_bindingAction) return;
    e.preventDefault();
    e.stopPropagation();

    playSfx('ui_click');
    _currentBinds[_bindingAction as keyof typeof _currentBinds] = e.code;
    
    const btn = document.getElementById(`bind-${_bindingAction}`);
    if (btn) {
        btn.textContent = _formatKey(e.code);
        btn.style.color = '';
    }

    dispatch('SET_SETTINGS', { keybindings: { ..._currentBinds } });

    _bindingAction = null;
    document.removeEventListener('keydown', _onKeyDownBind, true);
}

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
        } else if (key === 'controlScheme') {
            _updateKeybindBlockState(String(value));
        }
    },
    startBind(action: string) {
        if (_bindingAction) {
            // Cancel previous
            const oldBtn = document.getElementById(`bind-${_bindingAction}`);
            if (oldBtn) {
                oldBtn.textContent = _formatKey(_currentBinds[_bindingAction as keyof typeof _currentBinds]);
                oldBtn.style.color = '';
            }
            document.removeEventListener('keydown', _onKeyDownBind, true);
        }

        _bindingAction = action;
        const btn = document.getElementById(`bind-${action}`);
        if (btn) {
            btn.textContent = 'Нажмите...';
            btn.style.color = 'var(--color-primary)';
        }

        document.addEventListener('keydown', _onKeyDownBind, true);
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
    _setChk('setting-guide',       s.guideEnabled   ?? true);
    _setVal('setting-uiscale',    (s.uiScale        ?? 1.0) * 100);

    if (s.keybindings) {
        _currentBinds = { ...s.keybindings };
    }
    
    const upBtn = document.getElementById('bind-up');
    if (upBtn) upBtn.textContent = _formatKey(_currentBinds.up);
    const downBtn = document.getElementById('bind-down');
    if (downBtn) downBtn.textContent = _formatKey(_currentBinds.down);
    const leftBtn = document.getElementById('bind-left');
    if (leftBtn) leftBtn.textContent = _formatKey(_currentBinds.left);
    const rightBtn = document.getElementById('bind-right');
    if (rightBtn) rightBtn.textContent = _formatKey(_currentBinds.right);
    const boostBtn = document.getElementById('bind-boost');
    if (boostBtn) boostBtn.textContent = _formatKey(_currentBinds.boost);

    _updateKeybindBlockState(s.controlScheme ?? 'keyboard');
}

export function destroy(): void {
    if (_bindingAction) {
        document.removeEventListener('keydown', _onKeyDownBind, true);
        _bindingAction = null;
    }
}

function _setVal(id: string, v: string | number): void {
    const e = document.getElementById(id) as HTMLInputElement;
    if (e) e.value = String(v);
}

function _setChk(id: string, v: boolean): void {
    const e = document.getElementById(id) as HTMLInputElement;
    if (e) e.checked = v;
}

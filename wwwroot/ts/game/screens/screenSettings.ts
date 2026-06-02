/**
 * screenSettings.ts — Настройки и доступность
 */

import { getStore, dispatch, saveSettingsNow, _syncNavbarOverlaySpace } from '../stateManager.js';
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
        // Нормализуем значение для store:
        // - громкости: ползунок 0..100 → store хранит 0..1 (под Web Audio API)
        // - uiScale: уже приходит как 0.8..1.3 (HTML делит на 100)
        // - остальные числа: parseFloat как есть
        let parsed: string | number | boolean = value;
        if (typeof value !== 'boolean') {
            const num = parseFloat(String(value));
            if (Number.isNaN(num)) {
                parsed = String(value);
            } else if (key === 'soundVolume' || key === 'musicVolume') {
                parsed = num / 100; // 70 → 0.7 (так store не накопит ×100 после сохранения)
            } else {
                parsed = num;
            }
        }
        dispatch('SET_SETTINGS', { [key]: parsed });

        // Мгновенное применение — только то, что игрок должен слышать/видеть «вживую»:
        // звук, музыка, качество графики, переключатель схемы. UI-scale применяется
        // только на saveAndApply, чтобы не дёргать layout при движении ползунка.
        if (key === 'graphicsQuality') {
            setQuality(value as QualityLevel);
        } else if (key === 'soundVolume') {
            setSfxVolume(parsed as number);
            playSfx('ui_hover'); // короткий цыр для проверки громкости
        } else if (key === 'musicVolume') {
            setMusicVolume(parsed as number);
        } else if (key === 'controlScheme') {
            _updateKeybindBlockState(String(value));
        }
        // uiScale → ничего не делаем: применится в saveAndApply()
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

        // Финальная нормализация громкости перед сохранением — на случай если
        // в store случайно затесалось «старое» значение в диапазоне 0..100.
        const normalized = {
            ...s,
            soundVolume: _normalizeVolume(s.soundVolume ?? 0.7),
            musicVolume: _normalizeVolume(s.musicVolume ?? 0.5),
        };
        dispatch('SET_SETTINGS', normalized as import('../types.js').ActionPayload['SET_SETTINGS']);

        // Применяем масштаб UI ТОЛЬКО при сохранении — не дёргает layout
        // при движении ползунка
        document.documentElement.style.setProperty('--user-ui-scale', String(normalized.uiScale ?? 1.0));
        // Применяем качество графики
        if (normalized.graphicsQuality) setQuality(normalized.graphicsQuality as QualityLevel);
        // Применяем громкости (нормализованные)
        setSfxVolume(normalized.soundVolume);
        setMusicVolume(normalized.musicVolume);

        // Пересчитываем высоту navbar после применения нового масштаба
        requestAnimationFrame(() => _syncNavbarOverlaySpace());

        saveSettingsNow(); // Сохраняем в localStorage
        (window as any).showNotification('Настройки сохранены.', 'success');
    }
};

export async function init(store: Readonly<import('../types.js').GameStore>): Promise<void> {
    const s = (store.settings ?? {}) as Partial<import('../types.js').GameSettingsDto>;
    // Миграция старых сохранений: до фикса громкости хранились как 0..100,
    // теперь должны быть 0..1. Если значение > 1 — делим на 100.
    const sound = _normalizeVolume(s.soundVolume ?? 0.7);
    const music = _normalizeVolume(s.musicVolume ?? 0.5);
    const soundPct  = Math.round(sound * 100);
    const musicPct  = Math.round(music * 100);
    const uiPct     = Math.round((s.uiScale     ?? 1.0) * 100);

    _setVal('setting-sound',      soundPct);
    _setVal('setting-music',      musicPct);
    _setVal('setting-graphics',    s.graphicsQuality ?? 'medium');
    _setChk('setting-bloom',       s.useBloom       ?? true);
    _setVal('setting-controls',    s.controlScheme  ?? 'keyboard');
    _setVal('setting-uiscale',     uiPct);

    // Текстовые подписи у ползунков
    _setText('setting-sound-val',   `${soundPct}%`);
    _setText('setting-music-val',   `${musicPct}%`);
    _setText('setting-uiscale-val', `${uiPct}%`);

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

function _setText(id: string, v: string): void {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
}

/** Миграция громкости: до фикса значение могло сохраниться как 70 вместо 0.7.
 *  Любое значение > 1 трактуем как «старое 0..100» и нормализуем. */
function _normalizeVolume(v: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.7;
    if (n > 1) return Math.min(1, n / 100);
    return Math.max(0, n);
}

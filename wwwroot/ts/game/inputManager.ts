/**
 * inputManager.ts — Централизованный менеджер ввода для поддержки разных схем управления (Клавиатура, Мышь, Геймпад).
 */

import * as THREE from 'three';
import { getStore } from './stateManager.js';

let _keys: Record<string, boolean> = {};
let _pointerTarget: THREE.Vector2 | null = null;
let _isMouseDown = false;
let _canvas: HTMLElement | null = null;

// ── Touch controls (виртуальный джойстик + кнопка буста) ─────────────────
const _joystick = new THREE.Vector2(0, 0);
let _joystickActive = false;
let _joystickPointerId: number | null = null;
let _joystickCenter = { x: 0, y: 0 };
let _joystickMaxRadius = 50;
let _touchBoost = false;
let _joystickEl: HTMLElement | null = null;
let _stickEl: HTMLElement | null = null;
let _boostEl: HTMLElement | null = null;
let _touchHandlers: Array<{ el: HTMLElement; type: string; fn: EventListener }> = [];
/** Включены ли виртуальные тач-контролы (joystick + boost-btn).
 *  Когда true — mouse-схема (зажать палец на экране) полностью отключается,
 *  чтобы не конкурировать с джойстиком. */
let _touchControlsActive = false;

export function init(canvasId?: string): void {
    _keys = {};
    _pointerTarget = null;
    _isMouseDown = false;

    if (canvasId) {
        _canvas = document.getElementById(canvasId);
    } else {
        _canvas = document.body;
    }

    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup', _onKeyUp);
    
    if (_canvas) {
        _canvas.addEventListener('mousemove', _onMouseMove);
        _canvas.addEventListener('mousedown', _onMouseDown);
        _canvas.addEventListener('mouseup', _onMouseUp);
        _canvas.addEventListener('touchmove', _onTouchMove, { passive: false });
        _canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
        _canvas.addEventListener('touchend', _onTouchEnd);
    }
}

export function destroy(): void {
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup', _onKeyUp);
    
    if (_canvas) {
        _canvas.removeEventListener('mousemove', _onMouseMove);
        _canvas.removeEventListener('mousedown', _onMouseDown);
        _canvas.removeEventListener('mouseup', _onMouseUp);
        _canvas.removeEventListener('touchmove', _onTouchMove);
        _canvas.removeEventListener('touchstart', _onTouchStart);
        _canvas.removeEventListener('touchend', _onTouchEnd);
    }
    
    _canvas = null;
}

function _onKeyDown(e: KeyboardEvent): void {
    _keys[e.code] = true;
    _pointerTarget = null; // Keyboard overrides pointer target
}

function _onKeyUp(e: KeyboardEvent): void {
    _keys[e.code] = false;
}

function _updatePointer(clientX: number, clientY: number): void {
    const nx = clientX / window.innerWidth;
    const ny = clientY / window.innerHeight;
    
    // Normalized coordinates (-1 to 1) relative to center
    // Y is inverted (up is positive in 3D world, down is positive in DOM)
    _pointerTarget = new THREE.Vector2(
        (nx - 0.5) * 2,
        -(ny - 0.5) * 2
    );
}

function _onMouseMove(e: MouseEvent): void {
    _updatePointer(e.clientX, e.clientY);
}

function _onMouseDown(e: MouseEvent): void {
    _isMouseDown = true;
}

function _onMouseUp(e: MouseEvent): void {
    _isMouseDown = false;
}

function _onTouchMove(e: TouchEvent): void {
    if (!e.touches.length) return;
    const t = e.touches[0];
    _updatePointer(t.clientX, t.clientY);
}

function _onTouchStart(e: TouchEvent): void {
    _isMouseDown = true;
    _onTouchMove(e);
}

function _onTouchEnd(e: TouchEvent): void {
    _isMouseDown = false;
}

/**
 * Returns a normalized movement vector [-1 to 1] based on the current control scheme.
 */
export function getMovementVector(): THREE.Vector2 {
    const s = getStore().settings;
    const scheme = s?.controlScheme ?? 'keyboard';
    const binds = s?.keybindings ?? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'Space' };
    const vec = new THREE.Vector2(0, 0);

    // Виртуальный джойстик имеет приоритет — пока активен, перекрывает клавиатуру
    if (_joystickActive && _joystick.lengthSq() > 0.001) {
        return _joystick.clone();
    }

    if (scheme === 'keyboard' || scheme === 'mouse') {
        if (_keys[binds.left]) vec.x -= 1;
        if (_keys[binds.right]) vec.x += 1;
        if (_keys[binds.up]) vec.y += 1;
        if (_keys[binds.down]) vec.y -= 1;
    }

    if (vec.lengthSq() > 1) {
        vec.normalize();
    }

    return vec;
}

/**
 * Returns normalized pointer position [-1 to 1] from center.
 * Only returns a value if control scheme is 'mouse'.
 */
export function getPointerPosition(): THREE.Vector2 | null {
    // При активных тач-контролах (джойстик) mouse-схема отключена,
    // чтобы тач по экрану не дублировал управление джойстиком.
    if (_touchControlsActive) return null;

    const scheme = getStore().settings?.controlScheme ?? 'keyboard';

    if (scheme === 'mouse') {
        return _pointerTarget;
    }

    return null;
}

/**
 * Returns true if the boost/action button is pressed based on the scheme.
 */
export function isBoostPressed(): boolean {
    const s = getStore().settings;
    const scheme = s?.controlScheme ?? 'keyboard';
    const binds = s?.keybindings ?? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'Space' };

    // Тач-кнопка имеет приоритет — работает независимо от схемы управления
    if (_touchBoost) return true;

    // При активных тач-контролах mouse-схема (зажать палец = буст) отключена,
    // иначе любое касание экрана активировало бы буст.
    if (_touchControlsActive) {
        return !!_keys[binds.boost];
    }

    if (scheme === 'keyboard') {
        return !!_keys[binds.boost];
    }

    if (scheme === 'mouse') {
        return !!_keys[binds.boost] || _isMouseDown;
    }

    return false;
}

// ── Touch controls API ─────────────────────────────────────────────────────

/**
 * Активирует виртуальный джойстик и кнопку буста в DOM.
 * Безопасно вызывать многократно — повторно не подписывается.
 */
export function attachTouchControls(joystickId: string, stickId: string, boostId: string): void {
    detachTouchControls(); // на всякий случай очищаем перед re-attach

    _joystickEl = document.getElementById(joystickId);
    _stickEl    = document.getElementById(stickId);
    _boostEl    = document.getElementById(boostId);

    if (!_joystickEl || !_stickEl || !_boostEl) return;

    const onJoyDown = (e: Event) => _onJoystickDown(e as PointerEvent);
    const onJoyMove = (e: Event) => _onJoystickMove(e as PointerEvent);
    const onJoyUp   = (e: Event) => _onJoystickUp(e as PointerEvent);

    _joystickEl.addEventListener('pointerdown',   onJoyDown);
    _joystickEl.addEventListener('pointermove',   onJoyMove);
    _joystickEl.addEventListener('pointerup',     onJoyUp);
    _joystickEl.addEventListener('pointercancel', onJoyUp);
    _joystickEl.addEventListener('pointerleave',  onJoyUp);
    _touchHandlers.push(
        { el: _joystickEl, type: 'pointerdown',   fn: onJoyDown },
        { el: _joystickEl, type: 'pointermove',   fn: onJoyMove },
        { el: _joystickEl, type: 'pointerup',     fn: onJoyUp },
        { el: _joystickEl, type: 'pointercancel', fn: onJoyUp },
        { el: _joystickEl, type: 'pointerleave',  fn: onJoyUp },
    );

    const onBoostDown = (_e: Event) => { _touchBoost = true;  _boostEl?.classList.add('flight-boost-btn--active'); };
    const onBoostUp   = (_e: Event) => { _touchBoost = false; _boostEl?.classList.remove('flight-boost-btn--active'); };

    _boostEl.addEventListener('pointerdown',   onBoostDown);
    _boostEl.addEventListener('pointerup',     onBoostUp);
    _boostEl.addEventListener('pointercancel', onBoostUp);
    _boostEl.addEventListener('pointerleave',  onBoostUp);
    _touchHandlers.push(
        { el: _boostEl, type: 'pointerdown',   fn: onBoostDown },
        { el: _boostEl, type: 'pointerup',     fn: onBoostUp },
        { el: _boostEl, type: 'pointercancel', fn: onBoostUp },
        { el: _boostEl, type: 'pointerleave',  fn: onBoostUp },
    );

    _touchControlsActive = true;
}

export function detachTouchControls(): void {
    _touchHandlers.forEach(h => h.el.removeEventListener(h.type, h.fn));
    _touchHandlers = [];
    _joystick.set(0, 0);
    _joystickActive = false;
    _joystickPointerId = null;
    _touchBoost = false;
    _stickEl?.style.removeProperty('transform');
    _boostEl?.classList.remove('flight-boost-btn--active');
    _joystickEl = _stickEl = _boostEl = null;
    _touchControlsActive = false;
}

/** Активны ли сейчас тач-контролы. */
export function areTouchControlsActive(): boolean {
    return _touchControlsActive;
}

function _onJoystickDown(e: PointerEvent): void {
    if (!_joystickEl) return;
    e.preventDefault();
    _joystickActive = true;
    _joystickPointerId = e.pointerId;
    _joystickEl.setPointerCapture?.(e.pointerId);

    // Центр и радиус берём с актуальных размеров базы джойстика
    const rect = _joystickEl.getBoundingClientRect();
    _joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    _joystickMaxRadius = Math.min(rect.width, rect.height) / 2 - 6; // 6px зазор для стика

    _updateJoystick(e.clientX, e.clientY);
}

function _onJoystickMove(e: PointerEvent): void {
    if (!_joystickActive || e.pointerId !== _joystickPointerId) return;
    e.preventDefault();
    _updateJoystick(e.clientX, e.clientY);
}

function _onJoystickUp(e: PointerEvent): void {
    if (_joystickPointerId !== null && e.pointerId !== _joystickPointerId) return;
    _joystickActive = false;
    _joystickPointerId = null;
    _joystick.set(0, 0);
    if (_stickEl) _stickEl.style.transform = 'translate(-50%, -50%)';
}

function _updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - _joystickCenter.x;
    const dy = clientY - _joystickCenter.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = Math.min(len, _joystickMaxRadius);
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;

    if (_stickEl) {
        _stickEl.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    }
    // Нормализуем для игровых координат:
    //  X: вправо положительно
    //  Y: вверх положительно (в DOM вниз → меняем знак)
    _joystick.x = sx / _joystickMaxRadius;
    _joystick.y = -sy / _joystickMaxRadius;
}

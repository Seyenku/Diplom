/**
 * inputManager.ts — Централизованный менеджер ввода для поддержки разных схем управления (Клавиатура, Мышь, Геймпад).
 */

import * as THREE from 'three';
import { getStore } from './stateManager.js';

let _keys: Record<string, boolean> = {};
let _pointerTarget: THREE.Vector2 | null = null;
let _isMouseDown = false;
let _canvas: HTMLElement | null = null;

// ── Touch controls (floating joystick + boost-zone) ──────────────────────
// Пользовательский UX: вместо фиксированной базы джойстика + отдельной кнопки
// буста, мы используем две полупрозрачные «зоны». Joystick спавнится под
// пальцем (floating), boost удерживается касанием в своей зоне (может быть
// несколько одновременно — multi-touch).
const _joystick = new THREE.Vector2(0, 0);
let _joystickActive = false;
let _joystickPointerId: number | null = null;
let _joystickOrigin = { x: 0, y: 0 };
const _JOYSTICK_MAX_RADIUS = 60;
let _touchBoost = false;
const _boostPointers = new Set<number>();
let _boostHintHidden = false;
let _joystickZoneEl: HTMLElement | null = null;
let _joystickBaseEl: HTMLElement | null = null;
let _stickEl: HTMLElement | null = null;
let _boostZoneEl: HTMLElement | null = null;
let _boostHintEl: HTMLElement | null = null;
let _touchHandlers: Array<{ el: HTMLElement; type: string; fn: EventListener }> = [];
/** Включены ли виртуальные тач-контролы. Когда true — mouse-схема (зажать
 *  палец на экране) полностью отключается, чтобы не конкурировать с зонами. */
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
 * Активирует тач-контролы: floating joystick в своей зоне и boost-zone
 * (touch-and-hold = буст). Безопасно вызывать многократно.
 *
 * @param joystickZoneId  DIV, в котором ловится первое касание для джойстика
 * @param baseId          DIV «основы» джойстика — позиция выставляется через CSS-vars
 * @param stickId         DIV «стика» внутри базы — JS двигает через transform
 * @param boostZoneId     DIV, любое касание в котором = буст (multi-touch ОК)
 * @param hintId          (опц.) DIV-подсказка про буст; скрывается после первого
 */
export function attachTouchControls(
    joystickZoneId: string,
    baseId: string,
    stickId: string,
    boostZoneId: string,
    hintId?: string
): void {
    detachTouchControls();

    _joystickZoneEl = document.getElementById(joystickZoneId);
    _joystickBaseEl = document.getElementById(baseId);
    _stickEl        = document.getElementById(stickId);
    _boostZoneEl    = document.getElementById(boostZoneId);
    _boostHintEl    = hintId ? document.getElementById(hintId) : null;

    if (!_joystickZoneEl || !_joystickBaseEl || !_stickEl || !_boostZoneEl) return;

    const onJoyDown = (e: Event) => _onJoystickDown(e as PointerEvent);
    const onJoyMove = (e: Event) => _onJoystickMove(e as PointerEvent);
    const onJoyUp   = (e: Event) => _onJoystickUp(e as PointerEvent);

    _joystickZoneEl.addEventListener('pointerdown',         onJoyDown);
    _joystickZoneEl.addEventListener('pointermove',         onJoyMove);
    _joystickZoneEl.addEventListener('pointerup',           onJoyUp);
    _joystickZoneEl.addEventListener('pointercancel',       onJoyUp);
    _joystickZoneEl.addEventListener('lostpointercapture',  onJoyUp);
    _touchHandlers.push(
        { el: _joystickZoneEl, type: 'pointerdown',        fn: onJoyDown },
        { el: _joystickZoneEl, type: 'pointermove',        fn: onJoyMove },
        { el: _joystickZoneEl, type: 'pointerup',          fn: onJoyUp },
        { el: _joystickZoneEl, type: 'pointercancel',      fn: onJoyUp },
        { el: _joystickZoneEl, type: 'lostpointercapture', fn: onJoyUp },
    );

    const onBoostDown = (e: Event) => _onBoostDown(e as PointerEvent);
    const onBoostUp   = (e: Event) => _onBoostUp(e as PointerEvent);

    _boostZoneEl.addEventListener('pointerdown',        onBoostDown);
    _boostZoneEl.addEventListener('pointerup',          onBoostUp);
    _boostZoneEl.addEventListener('pointercancel',      onBoostUp);
    _boostZoneEl.addEventListener('lostpointercapture', onBoostUp);
    _touchHandlers.push(
        { el: _boostZoneEl, type: 'pointerdown',        fn: onBoostDown },
        { el: _boostZoneEl, type: 'pointerup',          fn: onBoostUp },
        { el: _boostZoneEl, type: 'pointercancel',      fn: onBoostUp },
        { el: _boostZoneEl, type: 'lostpointercapture', fn: onBoostUp },
    );

    _boostHintHidden = false;
    if (_boostHintEl) _boostHintEl.classList.remove('flight-boost-hint--hidden');

    _touchControlsActive = true;
}

export function detachTouchControls(): void {
    _touchHandlers.forEach(h => h.el.removeEventListener(h.type, h.fn));
    _touchHandlers = [];
    _joystick.set(0, 0);
    _joystickActive = false;
    _joystickPointerId = null;
    _touchBoost = false;
    _boostPointers.clear();
    if (_joystickZoneEl) delete _joystickZoneEl.dataset.active;
    if (_stickEl) _stickEl.style.removeProperty('transform');
    if (_boostHintEl) _boostHintEl.classList.remove('flight-boost-hint--hidden');
    _joystickZoneEl = _joystickBaseEl = _stickEl = _boostZoneEl = _boostHintEl = null;
    _touchControlsActive = false;
}

/** Активны ли сейчас тач-контролы. */
export function areTouchControlsActive(): boolean {
    return _touchControlsActive;
}

function _onJoystickDown(e: PointerEvent): void {
    if (!_joystickZoneEl || !_joystickBaseEl) return;
    // Игнорируем второй палец на joystick-зоне — только первый управляет.
    if (_joystickActive) return;
    e.preventDefault();
    _joystickActive = true;
    _joystickPointerId = e.pointerId;
    _joystickZoneEl.setPointerCapture?.(e.pointerId);

    _joystickOrigin = { x: e.clientX, y: e.clientY };

    // Позиция базы — относительно joystick-зоны (она же содержащий элемент).
    const zoneRect = _joystickZoneEl.getBoundingClientRect();
    const relX = e.clientX - zoneRect.left;
    const relY = e.clientY - zoneRect.top;
    _joystickBaseEl.style.setProperty('--base-x', `${relX}px`);
    _joystickBaseEl.style.setProperty('--base-y', `${relY}px`);
    _joystickZoneEl.dataset.active = 'true';

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
    if (_joystickZoneEl) delete _joystickZoneEl.dataset.active;
    if (_stickEl) _stickEl.style.transform = 'translate(-50%, -50%)';
}

function _updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - _joystickOrigin.x;
    const dy = clientY - _joystickOrigin.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = Math.min(len, _JOYSTICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;

    if (_stickEl) {
        _stickEl.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    }
    // Нормализуем для игровых координат:
    //  X: вправо положительно
    //  Y: вверх положительно (в DOM вниз → меняем знак)
    _joystick.x = sx / _JOYSTICK_MAX_RADIUS;
    _joystick.y = -sy / _JOYSTICK_MAX_RADIUS;
}

function _onBoostDown(e: PointerEvent): void {
    e.preventDefault();
    _boostPointers.add(e.pointerId);
    _touchBoost = true;
    if (!_boostHintHidden && _boostHintEl) {
        _boostHintHidden = true;
        _boostHintEl.classList.add('flight-boost-hint--hidden');
    }
}

function _onBoostUp(e: PointerEvent): void {
    _boostPointers.delete(e.pointerId);
    if (_boostPointers.size === 0) {
        _touchBoost = false;
    }
}

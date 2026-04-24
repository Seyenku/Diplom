/**
 * inputManager.ts — Централизованный менеджер ввода для поддержки разных схем управления (Клавиатура, Мышь, Геймпад).
 */

import * as THREE from 'three';
import { getStore } from './stateManager.js';

let _keys: Record<string, boolean> = {};
let _pointerTarget: THREE.Vector2 | null = null;
let _isMouseDown = false;
let _canvas: HTMLElement | null = null;

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

    if (scheme === 'keyboard') {
        return !!_keys[binds.boost];
    }
    
    if (scheme === 'mouse') {
        return !!_keys[binds.boost] || _isMouseDown;
    }

    return false;
}

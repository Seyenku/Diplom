/**
 * screenCharCreation.ts - step-by-step character creation module
 */

import * as THREE from 'three';
import { clearSave, dispatch, savePlayerNow, transition, Screen } from '../stateManager.js';
import { switchScene } from '../threeScene.js';
import { loadModel } from '../gltfLoader.js';
import { CrystalType, GameStore } from '../types.js';
import { applyShipColor, createFallbackShip } from '../shipUtils.js';
import { disposeSceneGraph } from '../threeUtils.js';

let _step: 1 | 2 = 1;
let _selectedShipColor: string | null = null;
let _nicknameDraft = '';

let _previewRenderer: THREE.WebGLRenderer | null = null;
let _previewScene: THREE.Scene | null = null;
let _previewCamera: THREE.PerspectiveCamera | null = null;
let _previewShipRoot: THREE.Group | null = null;
let _previewAnimId: number | null = null;
let _previewInitPromise: Promise<void> | null = null;
let _previewCanvas: HTMLCanvasElement | null = null;
let _previewYaw = -Math.PI / 2;
let _previewPitch = 0;
let _isPreviewDragging = false;
let _lastPointerX = 0;
let _lastPointerY = 0;

const EMPTY_CRYSTALS: Record<CrystalType, number> = {
    programming: 0,
    medicine: 0,
    geology: 0,
};

window._charCreation = {
    nextFromName() {
        const name = _validateName();
        if (!name) return;

        _nicknameDraft = name;
        _setStep(2);
        void _ensurePreview();
    },

    backToName() {
        _setStep(1);
    },

    selectShipColor(btn: HTMLElement) {
        document.querySelectorAll('.ship-color-btn').forEach(b => {
            (b as HTMLElement).style.borderColor = 'var(--color-border)';
            (b as HTMLElement).style.boxShadow = 'none';
        });

        btn.style.borderColor = 'var(--color-primary)';
        btn.style.boxShadow = '0 0 12px rgba(79,195,247,0.4)';

        _selectedShipColor = btn.dataset.color ?? null;

        const colorError = document.getElementById('ship-color-error');
        if (colorError) colorError.textContent = '';

        if (_selectedShipColor) {
            applyShipColor(_previewShipRoot!, _selectedShipColor);
        }
    },

    submit() {
        const name = _nicknameDraft || _validateName();
        if (!name) {
            _setStep(1);
            return;
        }

        const colorError = document.getElementById('ship-color-error');
        if (!_selectedShipColor) {
            if (colorError) colorError.textContent = 'Выбери цвет корабля.';
            return;
        }
        if (colorError) colorError.textContent = '';

        clearSave();

        dispatch('SET_PLAYER', {
            name,
            shipColor: _selectedShipColor,
            crystals: { ...EMPTY_CRYSTALS },
            discoveredPlanets: [],
            appliedUpgrades: [],
            shipStats: { speedBonus: 0, shieldBonus: 0, scanRange: 1, capacity: 50 },
            stats: { scans: 0, miniGamesPlayed: 0, totalCrystalsEarned: 0 },
            badges: [],
        });

        savePlayerNow();
        transition(Screen.ONBOARDING);
    }
};

export async function init(_store: Readonly<GameStore>): Promise<void> {
    _step = 1;
    _selectedShipColor = null;
    _nicknameDraft = '';

    const input = document.getElementById('navigator-name') as HTMLInputElement | null;
    if (input) input.value = '';

    const nameError = document.getElementById('name-error');
    if (nameError) nameError.textContent = '';

    const colorError = document.getElementById('ship-color-error');
    if (colorError) colorError.textContent = '';

    _resetColorButtons();
    _setStep(1);

    await switchScene('starfield');
}

export function destroy(): void {
    _disposePreview();
}

function _setStep(step: 1 | 2): void {
    _step = step;

    const step1 = document.getElementById('char-step-1');
    const step2 = document.getElementById('char-step-2');
    const indicator = document.getElementById('char-step-indicator');
    const subtitle = document.getElementById('char-step-subtitle');

    if (step1) step1.classList.toggle('hidden', step !== 1);
    if (step2) step2.classList.toggle('hidden', step !== 2);
    if (indicator) indicator.textContent = step === 1 ? 'ШАГ 1 ИЗ 2' : 'ШАГ 2 ИЗ 2';
    if (subtitle) subtitle.textContent = step === 1
        ? 'Шаг 1: придумай никнейм.'
        : 'Шаг 2: выбери цвет и покрути корабль мышью.';
}

function _validateName(): string | null {
    const nameInput = document.getElementById('navigator-name') as HTMLInputElement | null;
    const nameError = document.getElementById('name-error');

    const name = nameInput?.value?.trim() ?? '';
    if (name.length < 2) {
        if (nameError) nameError.textContent = 'Никнейм должен содержать не менее 2 символов.';
        return null;
    }

    if (nameError) nameError.textContent = '';
    return name;
}

function _resetColorButtons(): void {
    document.querySelectorAll('.ship-color-btn').forEach(b => {
        (b as HTMLElement).style.borderColor = 'var(--color-border)';
        (b as HTMLElement).style.boxShadow = 'none';
    });
}

async function _ensurePreview(): Promise<void> {
    if (_previewRenderer) return;
    if (_previewInitPromise) return _previewInitPromise;

    _previewInitPromise = (async () => {
        const viewport = document.getElementById('ship-preview-viewport');
        if (!viewport) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.cursor = 'grab';
        renderer.domElement.style.touchAction = 'none';

        viewport.innerHTML = '';
        viewport.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0.7, 7.6);

        scene.add(new THREE.AmbientLight(0x8090aa, 1.0));

        const key = new THREE.DirectionalLight(0xffffff, 1.15);
        key.position.set(2.5, 3.5, 3.0);
        scene.add(key);

        const rim = new THREE.DirectionalLight(0x4fc3f7, 0.8);
        rim.position.set(-2.0, 0.8, -2.5);
        scene.add(rim);

        const fill = new THREE.PointLight(0xa78bfa, 0.6, 20);
        fill.position.set(0, -1.5, 2.5);
        scene.add(fill);

        let ship: THREE.Group;
        try {
            ship = await loadModel('/models/ship.glb');
            ship.scale.set(0.8, 0.8, 0.8);
            ship.rotation.y = -Math.PI / 2;
        } catch {
            ship = createFallbackShip();
        }

        _previewRenderer = renderer;
        _previewScene = scene;
        _previewCamera = camera;
        _previewShipRoot = ship;
        _previewCanvas = renderer.domElement;
        _previewYaw = ship.rotation.y;
        _previewPitch = 0;

        scene.add(ship);

        _resizePreview();
        _frameShipInPreview();
        window.addEventListener('resize', _onPreviewResize);
        _bindPreviewControls();

        applyShipColor(_previewShipRoot!, _selectedShipColor ?? '#4fc3f7');
        _startPreviewLoop();
    })().finally(() => {
        _previewInitPromise = null;
    });

    return _previewInitPromise;
}

function _startPreviewLoop(): void {
    if (_previewAnimId) cancelAnimationFrame(_previewAnimId);

    const tick = (): void => {
        if (!_previewRenderer || !_previewScene || !_previewCamera) return;

        _previewAnimId = requestAnimationFrame(tick);

        if (_previewShipRoot) {
            if (!_isPreviewDragging) {
                _previewYaw += 0.003;
            }
            _previewShipRoot.rotation.y = _previewYaw;
            _previewShipRoot.rotation.x = _previewPitch;
        }

        _previewRenderer.render(_previewScene, _previewCamera);
    };

    tick();
}

// _applyShipColorToPreview вынесена в shipUtils.ts как applyShipColor

function _resizePreview(): void {
    if (!_previewRenderer || !_previewCamera) return;

    const viewport = document.getElementById('ship-preview-viewport');
    if (!viewport) return;

    const w = Math.max(1, viewport.clientWidth);
    const h = Math.max(1, viewport.clientHeight);

    _previewCamera.aspect = w / h;
    _previewCamera.updateProjectionMatrix();
    _previewRenderer.setSize(w, h, false);
}

function _onPreviewResize(): void {
    _resizePreview();
    _frameShipInPreview();
}

function _frameShipInPreview(): void {
    if (!_previewCamera || !_previewShipRoot) return;

    const box = new THREE.Box3().setFromObject(_previewShipRoot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const fov = THREE.MathUtils.degToRad(_previewCamera.fov);
    const fitHeightDistance = (size.y * 0.5) / Math.tan(fov / 2);
    const fitWidthDistance = (size.x * 0.5) / (Math.tan(fov / 2) * _previewCamera.aspect);
    const distance = Math.max(fitHeightDistance, fitWidthDistance) + size.z * 1.2;

    _previewCamera.position.set(center.x, center.y + size.y * 0.12, center.z + distance * 1.8);
    _previewCamera.lookAt(center);
}

function _bindPreviewControls(): void {
    if (!_previewCanvas) return;
    _previewCanvas.addEventListener('pointerdown', _onPreviewPointerDown);
    _previewCanvas.addEventListener('pointermove', _onPreviewPointerMove);
    _previewCanvas.addEventListener('pointerup', _onPreviewPointerUp);
    _previewCanvas.addEventListener('pointercancel', _onPreviewPointerUp);
    _previewCanvas.addEventListener('pointerleave', _onPreviewPointerUp);
}

function _unbindPreviewControls(): void {
    if (!_previewCanvas) return;
    _previewCanvas.removeEventListener('pointerdown', _onPreviewPointerDown);
    _previewCanvas.removeEventListener('pointermove', _onPreviewPointerMove);
    _previewCanvas.removeEventListener('pointerup', _onPreviewPointerUp);
    _previewCanvas.removeEventListener('pointercancel', _onPreviewPointerUp);
    _previewCanvas.removeEventListener('pointerleave', _onPreviewPointerUp);
}

function _onPreviewPointerDown(e: PointerEvent): void {
    if (!_previewCanvas) return;
    _isPreviewDragging = true;
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;
    _previewCanvas.style.cursor = 'grabbing';
    _previewCanvas.setPointerCapture(e.pointerId);
}

function _onPreviewPointerMove(e: PointerEvent): void {
    if (!_isPreviewDragging) return;
    const dx = e.clientX - _lastPointerX;
    const dy = e.clientY - _lastPointerY;
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;

    _previewYaw += dx * 0.01;
    _previewPitch += dy * 0.0075;
    _previewPitch = Math.max(-0.6, Math.min(0.45, _previewPitch));
}

function _onPreviewPointerUp(e: PointerEvent): void {
    if (!_previewCanvas) return;
    _isPreviewDragging = false;
    _previewCanvas.style.cursor = 'grab';
    if (_previewCanvas.hasPointerCapture(e.pointerId)) {
        _previewCanvas.releasePointerCapture(e.pointerId);
    }
}

// _createFallbackPreviewShip вынесена в shipUtils.ts как createFallbackShip

function _disposePreview(): void {
    if (_previewAnimId) {
        cancelAnimationFrame(_previewAnimId);
        _previewAnimId = null;
    }

    window.removeEventListener('resize', _onPreviewResize);
    _isPreviewDragging = false;
    _unbindPreviewControls();

    if (_previewShipRoot) {
        disposeSceneGraph(_previewShipRoot);
        _previewShipRoot = null;
    }

    if (_previewRenderer) {
        _previewRenderer.dispose();
        _previewRenderer.forceContextLoss();
        const canvas = _previewRenderer.domElement;
        if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
        _previewRenderer = null;
    }

    _previewCanvas = null;
    _previewScene = null;
    _previewCamera = null;
    _previewInitPromise = null;
}

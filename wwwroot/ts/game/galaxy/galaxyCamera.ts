/**
 * galaxyCamera.ts — Управление камерой карты (орбита, zoom, панорамирование)
 */

import * as THREE from 'three';

export type CameraState = 'overview' | 'focused' | 'zooming-to-planet';

export interface GalaxyCameraConfig {
    camera: THREE.PerspectiveCamera;
    domElement: HTMLElement;
    onZoomUIUpdate: (pct: number) => void;
    onRaycastMove: (mouse: THREE.Vector2) => void;
    onClick: () => void;
}

export class GalaxyCamera {
    public state: CameraState = 'overview';
    public spherical = { radius: 120, theta: 0, phi: 1.1 };
    public targetRadius = 120;
    public targetCenter = new THREE.Vector3(0, 0, 0);
    public targetDest = new THREE.Vector3(0, 0, 0);
    
    public zoomingPlanetId: string | null = null;
    public zoomStartTime = 0;
    public readonly ZOOM_DURATION = 500;

    private _camera: THREE.PerspectiveCamera;
    private _domElement: HTMLElement;
    private _onZoomUIUpdate: (pct: number) => void;
    private _onRaycastMove: (mouse: THREE.Vector2) => void;
    private _onClick: () => void;

    private _isRightMouseDown = false;
    private _isTouchDown = false;
    private _lastInteractX = 0;
    private _lastInteractY = 0;
    private _lastPinchDist = 0;

    constructor(config: GalaxyCameraConfig) {
        this._camera = config.camera;
        this._domElement = config.domElement;
        this._onZoomUIUpdate = config.onZoomUIUpdate;
        this._onRaycastMove = config.onRaycastMove;
        this._onClick = config.onClick;

        this._bindEvents();
    }

    public update(): void {
        this.targetCenter.lerp(this.targetDest, 0.05);
        this.spherical.radius += (this.targetRadius - this.spherical.radius) * 0.05;

        this._camera.position.x = this.targetCenter.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
        this._camera.position.y = this.targetCenter.y + this.spherical.radius * Math.cos(this.spherical.phi);
        this._camera.position.z = this.targetCenter.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

        this._camera.lookAt(this.targetCenter);
    }

    public resetToOverview(): void {
        this.state = 'overview';
        this.targetDest.set(0, 0, 0);
        this.targetRadius = 120;
        this.updateZoomUI();
    }

    public focusCluster(pos: THREE.Vector3): void {
        this.state = 'focused';
        this.targetDest.copy(pos);
        this.targetRadius = 28;
        this.updateZoomUI();
    }

    public startPlanetZoom(planetWorldPos: THREE.Vector3, planetId: string): void {
        this.state = 'zooming-to-planet';
        this.zoomingPlanetId = planetId;
        this.zoomStartTime = performance.now();
        this.targetDest.copy(planetWorldPos);
        this.targetRadius = 3;
    }

    public dispose(): void {
        const c = this._domElement;
        c.removeEventListener('mousemove', this._onMouseMove);
        c.removeEventListener('mousedown', this._onMouseDown);
        c.removeEventListener('mouseup', this._onMouseUp);
        c.removeEventListener('mouseleave', this._onMouseUp);
        c.removeEventListener('contextmenu', this._onContextMenu);
        c.removeEventListener('click', this._onMouseClick);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('touchstart', this._onTouchStart);
        c.removeEventListener('touchmove', this._onTouchMove);
        c.removeEventListener('touchend', this._onTouchEnd);
        c.removeEventListener('touchcancel', this._onTouchEnd);
    }

    private _bindEvents(): void {
        const c = this._domElement;
        c.addEventListener('mousemove', this._onMouseMove);
        c.addEventListener('mousedown', this._onMouseDown);
        c.addEventListener('mouseup', this._onMouseUp);
        c.addEventListener('mouseleave', this._onMouseUp);
        c.addEventListener('contextmenu', this._onContextMenu);
        c.addEventListener('click', this._onMouseClick);
        c.addEventListener('wheel', this._onWheel, { passive: false });
        c.addEventListener('touchstart', this._onTouchStart, { passive: true });
        c.addEventListener('touchmove', this._onTouchMove, { passive: false });
        c.addEventListener('touchend', this._onTouchEnd);
        c.addEventListener('touchcancel', this._onTouchEnd);
    }

    public updateZoomUI = (): void => {
        const maxR = this.state === 'focused' ? 80 : 200;
        const minR = this.state === 'focused' ? 12 : 40;
        const pct = Math.round(((maxR - this.targetRadius) / (maxR - minR)) * 100);
        this._onZoomUIUpdate(pct);
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (e.button === 2) {
            this._isRightMouseDown = true;
            this._lastInteractX = e.clientX;
            this._lastInteractY = e.clientY;
        }
    }

    private _onMouseUp = (e: MouseEvent): void => {
        if (e.button === 2 || e.type === 'mouseleave') {
            this._isRightMouseDown = false;
        }
    }

    private _onMouseMove = (e: MouseEvent): void => {
        if (this._isRightMouseDown) {
            const deltaX = e.clientX - this._lastInteractX;
            const deltaY = e.clientY - this._lastInteractY;
            this.spherical.theta -= deltaX * 0.005;
            this.spherical.phi -= deltaY * 0.005;
            this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
            this._lastInteractX = e.clientX;
            this._lastInteractY = e.clientY;
        }

        const rect = this._domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        this._onRaycastMove(mouse);

        const tooltipEl = document.getElementById('galaxy-tooltip');
        if (tooltipEl && !tooltipEl.classList.contains('hidden')) {
            tooltipEl.style.left = `${e.clientX - rect.left + 12}px`;
            tooltipEl.style.top = `${e.clientY - rect.top - 10}px`;
        }
    }

    private _onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        const zoomSpeed = 0.05;
        this.spherical.radius += Math.sign(e.deltaY) * zoomSpeed * this.spherical.radius;
        const minR = this.state === 'focused' ? 12 : 40;
        const maxR = this.state === 'focused' ? 80 : 200;
        this.spherical.radius = Math.max(minR, Math.min(maxR, this.spherical.radius));
        this.targetRadius = this.spherical.radius;
        this.updateZoomUI();
    }

    private _onTouchStart = (e: TouchEvent): void => {
        if (e.touches.length === 1) {
            this._isTouchDown = true;
            this._lastInteractX = e.touches[0].clientX;
            this._lastInteractY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this._isTouchDown = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this._lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        }
        const rect = this._domElement.getBoundingClientRect();
        const t = e.touches[0];
        const mouse = new THREE.Vector2(
            ((t.clientX - rect.left) / rect.width) * 2 - 1,
            -((t.clientY - rect.top) / rect.height) * 2 + 1
        );
        this._onRaycastMove(mouse);
    }

    private _onTouchMove = (e: TouchEvent): void => {
        if (e.touches.length === 1 || e.touches.length === 2) e.preventDefault();

        if (this._isTouchDown && e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - this._lastInteractX;
            const deltaY = e.touches[0].clientY - this._lastInteractY;
            this.spherical.theta -= deltaX * 0.005;
            this.spherical.phi -= deltaY * 0.005;
            this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
            this._lastInteractX = e.touches[0].clientX;
            this._lastInteractY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const delta = this._lastPinchDist - dist;
            this.spherical.radius += delta * 0.2;
            const minR = this.state === 'focused' ? 12 : 40;
            const maxR = this.state === 'focused' ? 80 : 200;
            this.spherical.radius = Math.max(minR, Math.min(maxR, this.spherical.radius));
            this.targetRadius = this.spherical.radius;
            this.updateZoomUI();
            this._lastPinchDist = dist;
        }

        if (e.touches.length > 0) {
            const rect = this._domElement.getBoundingClientRect();
            const t = e.touches[0];
            const mouse = new THREE.Vector2(
                ((t.clientX - rect.left) / rect.width) * 2 - 1,
                -((t.clientY - rect.top) / rect.height) * 2 + 1
            );
            this._onRaycastMove(mouse);
        }
    }

    private _onTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length === 0) {
            if (this._isTouchDown) this._onClick();
            this._isTouchDown = false;
        }
    }

    private _onContextMenu = (e: Event): void => {
        e.preventDefault();
    }

    private _onMouseClick = (): void => {
        this._onClick();
    }
}

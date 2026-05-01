/**
 * galaxyScreen.ts — Главный контроллер экрана Звёздной карты
 */

import * as THREE from 'three';
import { getStore, dispatch, transition, Screen, ScreenId, on, off } from '../stateManager.js';
import { GameStore, PlanetDto, ClusterDto, ClusterType } from '../types.js';
import { getProfile, onQualityChange, offQualityChange } from '../qualityPresets.js';
import { CLUSTER_META } from '../clusterConfig.js';
import { playMusic } from '../audioManager.js';
import { switchScene, registerSceneBuilder, getBaseCamera } from '../threeScene.js';

// ── Scene Builder (Background) ──────────────────────────────────────────────

registerSceneBuilder('galaxy-map', () => {
    const scene = new THREE.Scene();
    const camera = getBaseCamera();
    return { scene, camera };
});

import { GalaxyRendererState, initRenderer, disposeRenderer } from './galaxyRenderer.js';
import { GalaxyCamera, CameraState } from './galaxyCamera.js';
import { GalaxyNebulaeState, initNebulaeState, buildNebulae, updateNebulae, buildMapStars, disposeNebulae } from './galaxyNebulae.js';
import { GalaxyPlanetsState, initPlanetsState, buildPlanetsForCluster, updatePlanets, clearPlanetMeshes, hoverPlanet, unhoverPlanet, disposePlanetsState } from './galaxyPlanets.js';
import * as Ui from './galaxyUi.js';

// ── Внутреннее состояние ────────────────────────────────────────────────────
let _allPlanets: PlanetDto[] = [];
let _clusters: ClusterDto[] = [];
let _discoveredIds = new Set<string>();

let _focusedCluster: ClusterType | null = null;
let _isGalaxyMapActive = false;

// Подсистемы
let _rendererState: GalaxyRendererState | null = null;
let _cameraState: GalaxyCamera | null = null;
let _nebulaeState: GalaxyNebulaeState | null = null;
let _planetsState: GalaxyPlanetsState | null = null;

let _mapAnimId: number | null = null;
let _raycaster: THREE.Raycaster | null = null;
let _mouseMovedSinceLastRaycast = false;
let _mousePosition = new THREE.Vector2(-999, -999);

// ── Глобальный API для HTML-onclick ─────────────────────────────────────────

window._galaxyMap = {
    backToOverview() {
        if (!_cameraState) return;
        _cameraState.resetToOverview();
        _focusedCluster = null;
        if (_planetsState && _rendererState) clearPlanetMeshes(_planetsState, _rendererState.scene);
        Ui.hideNebulaPanel();
        Ui.showBackButton(false);
    },

    resetCamera() {
        window._galaxyMap.backToOverview();
        if (_cameraState) {
            _cameraState.spherical.theta = 0;
            _cameraState.spherical.phi = 1.1;
        }
    },

    flyToRegion() {
        if (!_focusedCluster) return;
        transition(Screen.FLIGHT as ScreenId, {
            regionId: _focusedCluster,
            crystalType: _focusedCluster,
        });
    },

    openPlanet(planetId: string) {
        if (!_cameraState || _cameraState.state === 'zooming-to-planet') return;

        const planetMesh = _planetsState?.planetMeshes.find(m => m.userData.planetId === planetId);
        if (!planetMesh) {
            transition(Screen.PLANET_DETAIL as ScreenId, {
                planetId,
                regionId: _focusedCluster ?? undefined,
                crystalType: _focusedCluster ?? undefined,
            });
            return;
        }

        const worldPos = new THREE.Vector3();
        planetMesh.getWorldPosition(worldPos);
        _cameraState.startPlanetZoom(worldPos, planetId);

        const overlay = document.getElementById('planet-zoom-overlay');
        if (overlay) {
            const meta = _focusedCluster ? CLUSTER_META[_focusedCluster] : null;
            const color = meta?.colorHex ?? '#4fc3f7';
            overlay.style.background = `radial-gradient(circle, ${color}dd 0%, #020710 70%)`;
            overlay.className = '';
            void overlay.offsetWidth;
            overlay.classList.add('fade-in');
        }
    }
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function init(store: Readonly<GameStore>): Promise<void> {
    playMusic('ambient_map');
    await switchScene('galaxy-map');

    _clusters = (store.sessionData?.clusters ?? []) as ClusterDto[];
    _allPlanets = (store.sessionData?.catalog ?? []) as PlanetDto[];
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);

    if (_allPlanets.length === 0) {
        try {
            const resp = await fetch('/game?handler=Catalog');
            if (resp.ok) _allPlanets = await resp.json() as PlanetDto[];
        } catch { /* offline */ }
    }

    _focusedCluster = null;
    _init3DMap();

    const returnCluster = store.sessionData?.regionId as ClusterType | undefined;
    const returnPlanetId = store.sessionData?.planetId as string | undefined;
    const prevScreen = store.previousScreen;

    if (returnCluster && (returnCluster in CLUSTER_META)) {
        const meta = CLUSTER_META[returnCluster];
        _focusCluster(returnCluster);

        if (_cameraState) {
            _cameraState.targetCenter.set(meta.position.x, meta.position.y, meta.position.z);
            _cameraState.spherical.radius = 36;
            _cameraState.targetRadius = 36;
        }

        if (prevScreen === Screen.PLANET_DETAIL && returnPlanetId && _planetsState && _cameraState) {
            const planetMesh = _planetsState.planetMeshes.find(m => m.userData.planetId === returnPlanetId);
            if (planetMesh) {
                const worldPos = new THREE.Vector3();
                planetMesh.getWorldPosition(worldPos);
                _cameraState.targetCenter.copy(worldPos);
                _cameraState.spherical.radius = 3;

                _cameraState.targetDest.set(meta.position.x, meta.position.y, meta.position.z);
                _cameraState.targetRadius = 36;

                const overlay = document.getElementById('planet-zoom-overlay');
                if (overlay) {
                    overlay.style.cssText = '';
                    overlay.style.background = `radial-gradient(circle, ${meta.colorHex}dd 0%, #020710 70%)`;
                    overlay.className = 'covering';
                    requestAnimationFrame(() => {
                        overlay.className = 'fading';
                        setTimeout(() => { overlay.className = ''; }, 450);
                    });
                }
            }
        }
    }

    _isGalaxyMapActive = true;
    onQualityChange(_onQualityChanged);

    on('EARN_CRYSTALS',   _refreshNebulaPanel);
    on('ADD_CRYSTALS',    _refreshNebulaPanel);
    on('SPEND_CRYSTALS',  _refreshNebulaPanel);
    on('DISCOVER_PLANET', _refreshNebulaPanel);
}

export function destroy(): void {
    _isGalaxyMapActive = false;
    offQualityChange(_onQualityChanged);
    off('EARN_CRYSTALS',   _refreshNebulaPanel);
    off('ADD_CRYSTALS',    _refreshNebulaPanel);
    off('SPEND_CRYSTALS',  _refreshNebulaPanel);
    off('DISCOVER_PLANET', _refreshNebulaPanel);
    _cleanup3D();
}

function _onQualityChanged(): void {
    if (!_isGalaxyMapActive) return;
    _cleanup3D();
    _init3DMap();
}

// ── 3D MAP ──────────────────────────────────────────────────────────────────

function _init3DMap(): void {
    const wrap = document.getElementById('galaxy-3d-canvas-wrap');
    if (!wrap) return;

    _rendererState = initRenderer(wrap);
    _cameraState = new GalaxyCamera({
        camera: _rendererState.camera,
        domElement: _rendererState.renderer.domElement,
        onZoomUIUpdate: (pct) => {
            const el = document.getElementById('galaxy-zoom-percent');
            if (el) el.textContent = `${pct}%`;
        },
        onRaycastMove: (mouse) => {
            _mousePosition.copy(mouse);
            _mouseMovedSinceLastRaycast = true;
        },
        onClick: _onMapClick
    });

    _raycaster = new THREE.Raycaster();
    _nebulaeState = initNebulaeState();
    _planetsState = initPlanetsState();

    buildMapStars(_rendererState.scene);
    buildNebulae(_nebulaeState, _rendererState.scene, ['programming', 'medicine', 'geology'], _allPlanets);

    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Render loop ─────────────────────────────────────────────────────────────

function _mapRenderLoop(): void {
    if (!_rendererState || !_cameraState || !_nebulaeState || !_planetsState) return;

    _cameraState.update();

    if (_cameraState.state === 'zooming-to-planet' && _cameraState.zoomingPlanetId) {
        const elapsed = performance.now() - _cameraState.zoomStartTime;
        if (elapsed >= _cameraState.ZOOM_DURATION) {
            const overlay = document.getElementById('planet-zoom-overlay');
            if (overlay) overlay.className = 'covering';

            const planetId = _cameraState.zoomingPlanetId;
            _cameraState.zoomingPlanetId = null;
            _cameraState.state = 'focused';

            transition(Screen.PLANET_DETAIL as ScreenId, {
                planetId,
                regionId: _focusedCluster ?? undefined,
                crystalType: _focusedCluster ?? undefined,
            }).then(() => {
                if (overlay) {
                    overlay.className = 'fading';
                    setTimeout(() => { overlay.className = ''; }, 450);
                }
            });
            return;
        }
    }

    const time = performance.now() / 1000;
    updateNebulae(_nebulaeState, time, _cameraState.state, _focusedCluster);
    updatePlanets(_planetsState, 0.016);

    if (_mouseMovedSinceLastRaycast && _raycaster) {
        _mouseMovedSinceLastRaycast = false;
        _raycaster.setFromCamera(_mousePosition, _rendererState.camera);

        let targets: THREE.Object3D[] = [];
        if (_cameraState.state === 'overview') {
            for (const group of Object.values(_nebulaeState.meshes)) {
                group.children.forEach(child => {
                    if ((child.userData as { type?: string })?.type === 'nebula-hitbox') targets.push(child);
                });
            }
        } else {
            targets = _planetsState.planetMeshes;
        }

        const intersects = _raycaster.intersectObjects(targets, false);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            if (_planetsState.hoveredObj !== hit) {
                _unhover();
                _hover(hit as THREE.Mesh);
            }
        } else {
            _unhover();
        }
    }

    const settings = getStore().settings;
    const isBloomEnabled = settings?.useBloom ?? true;
    if (isBloomEnabled) {
        _rendererState.composer.render();
    } else {
        _rendererState.renderer.render(_rendererState.scene, _rendererState.camera);
    }
    
    _mapAnimId = requestAnimationFrame(_mapRenderLoop);
}

// ── Hover / Focus ───────────────────────────────────────────────────────────

function _hover(mesh: THREE.Mesh): void {
    if (!_planetsState || !_rendererState) return;
    const userData = mesh.userData as Record<string, unknown>;

    if (userData?.type === 'nebula-hitbox') {
        const meta = CLUSTER_META[userData.clusterId as ClusterType];
        Ui.showTooltip(meta?.label ?? 'Туманность', `${meta?.crystalEmoji ?? '💎'} Кристаллы`);
        _rendererState.renderer.domElement.style.cursor = 'pointer';
        _planetsState.hoveredObj = mesh;
    } else if (userData?.type === 'planet') {
        hoverPlanet(_planetsState, mesh);
        Ui.showTooltip(
            userData.planetName as string,
            userData.discovered ? 'ЛКМ — открыть' : `🔒 ${userData.unlockCost} 💎`
        );
        _rendererState.renderer.domElement.style.cursor = 'pointer';
    }
}

function _unhover(): void {
    if (!_planetsState || !_planetsState.hoveredObj || !_rendererState) return;
    const userData = _planetsState.hoveredObj.userData as Record<string, unknown>;

    if (userData?.type === 'planet') {
        unhoverPlanet(_planetsState, _planetsState.hoveredObj as THREE.Mesh);
    }
    _planetsState.hoveredObj = null;
    Ui.hideTooltip();
    _rendererState.renderer.domElement.style.cursor = 'default';
}

function _onMapClick(): void {
    if (_cameraState?.state === 'zooming-to-planet') return;
    if (!_planetsState?.hoveredObj) return;

    const userData = _planetsState.hoveredObj.userData as Record<string, unknown>;
    if (userData?.type === 'nebula-hitbox') {
        _focusCluster(userData.clusterId as ClusterType);
    } else if (userData?.type === 'planet') {
        window._galaxyMap.openPlanet(userData.planetId as string);
    }
}

function _focusCluster(clusterId: ClusterType): void {
    const meta = CLUSTER_META[clusterId];
    if (!meta || !_cameraState || !_planetsState || !_rendererState) return;

    _cameraState.focusCluster(new THREE.Vector3(meta.position.x, meta.position.y, meta.position.z));
    _focusedCluster = clusterId;
    Ui.showBackButton(true);

    const store = getStore();
    const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[clusterId] ?? 0;
    const cluster = _clusters.find(c => c.name === clusterId);
    const planetCount = _allPlanets.filter(p => p.clusterId === clusterId).length;

    buildPlanetsForCluster(_planetsState, _rendererState.scene, clusterId, _allPlanets, _discoveredIds, (s, c, soft) => {
        // Fallback for creating a quick texture, galaxyNebulae already has a better one but we need it here
        const canvas = document.createElement('canvas');
        canvas.width = s; canvas.height = s;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
        gradient.addColorStop(0, c);
        gradient.addColorStop(soft, c + '80');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, s, s);
        return new THREE.CanvasTexture(canvas);
    });

    Ui.showNebulaPanel(clusterId, cluster?.description ?? '', playerCrystals, planetCount, _allPlanets, _discoveredIds);
}

function _refreshNebulaPanel(): void {
    if (!_focusedCluster) return;
    const store = getStore();
    const playerCrystals = ((store.player?.crystals ?? {}) as Record<string, number>)[_focusedCluster] ?? 0;
    _discoveredIds = new Set(store.player?.discoveredPlanets ?? []);
    Ui.refreshNebulaPanel(_focusedCluster, playerCrystals, _allPlanets, _discoveredIds);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function _cleanup3D(): void {
    if (_mapAnimId) cancelAnimationFrame(_mapAnimId);
    _mapAnimId = null;

    if (_cameraState) { _cameraState.dispose(); _cameraState = null; }
    if (_rendererState) {
        if (_planetsState) clearPlanetMeshes(_planetsState, _rendererState.scene);
        if (_nebulaeState) disposeNebulae(_nebulaeState, _rendererState.scene);
        disposeRenderer(_rendererState);
        _rendererState = null;
    }
    if (_planetsState) { disposePlanetsState(_planetsState); _planetsState = null; }

    _nebulaeState = null;
    _raycaster = null;
}

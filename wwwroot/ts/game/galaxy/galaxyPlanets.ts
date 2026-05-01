/**
 * galaxyPlanets.ts — Генерация и управление планетами (орбиты, hover)
 */

import * as THREE from 'three';
import { ClusterType, PlanetDto } from '../types.js';
import { CLUSTER_META } from '../clusterConfig.js';
import { getProfile } from '../qualityPresets.js';

export interface GalaxyPlanetsState {
    sharedPlanetGeo: THREE.SphereGeometry | null;
    sharedOutlineGeo: THREE.SphereGeometry | null;
    sharedRingGeo: THREE.RingGeometry | null;
    sharedOrbitGeo: THREE.BufferGeometry | null;
    planetMeshes: THREE.Mesh[];
    orbitMap: Map<string, THREE.LineLoop>;
    hoveredObj: THREE.Object3D | null;
}

export function initPlanetsState(): GalaxyPlanetsState {
    return {
        sharedPlanetGeo: null,
        sharedOutlineGeo: null,
        sharedRingGeo: null,
        sharedOrbitGeo: null,
        planetMeshes: [],
        orbitMap: new Map(),
        hoveredObj: null,
    };
}

export function disposePlanetsState(state: GalaxyPlanetsState): void {
    state.sharedPlanetGeo?.dispose(); state.sharedPlanetGeo = null;
    state.sharedOutlineGeo?.dispose(); state.sharedOutlineGeo = null;
    state.sharedRingGeo?.dispose(); state.sharedRingGeo = null;
    state.sharedOrbitGeo?.dispose(); state.sharedOrbitGeo = null;
}

function _ensureSharedGeos(state: GalaxyPlanetsState): void {
    if (state.sharedPlanetGeo) return;
    const p = getProfile();
    state.sharedPlanetGeo = new THREE.SphereGeometry(1, p.planetSegments[0], p.planetSegments[1]);
    state.sharedOutlineGeo = new THREE.SphereGeometry(1, 16, 12);
    state.sharedRingGeo = new THREE.RingGeometry(1.3, 1.45, p.planetRingSegments);
    state.sharedOrbitGeo = new THREE.BufferGeometry().setFromPoints(
        new THREE.Path().absarc(0, 0, 1, 0, Math.PI * 2, false).getPoints(64)
    );
}

export function clearPlanetMeshes(state: GalaxyPlanetsState, scene: THREE.Scene): void {
    state.planetMeshes.forEach(m => {
        if (m.parent && m.parent !== scene) {
            scene.remove(m.parent);
        } else {
            scene.remove(m);
        }
        m.traverse(child => {
            const c = child as THREE.Mesh;
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(mat => {
                    for (const key of Object.keys(mat)) {
                        const val = (mat as unknown as Record<string, unknown>)[key];
                        if (val instanceof THREE.Texture) val.dispose();
                    }
                    mat.dispose();
                });
            }
        });
    });
    state.planetMeshes = [];
    state.hoveredObj = null;

    state.orbitMap.forEach(line => {
        if (line.parent) line.removeFromParent();
        if (line.material) (line.material as THREE.Material).dispose();
    });
    state.orbitMap.clear();
}

export function buildPlanetsForCluster(
    state: GalaxyPlanetsState,
    scene: THREE.Scene,
    clusterId: ClusterType,
    allPlanets: PlanetDto[],
    discoveredIds: Set<string>,
    createGlowTexture: (size: number, colorHex: string, softness: number) => THREE.CanvasTexture
): void {
    clearPlanetMeshes(state, scene);
    _ensureSharedGeos(state);

    const clusterPlanets = allPlanets.filter(p => p.clusterId === clusterId);
    const meta = CLUSTER_META[clusterId];
    if (!meta) return;

    const center = meta.position;

    clusterPlanets.forEach((planet, i) => {
        const discovered = discoveredIds.has(planet.id) || planet.isStarterVisible;
        const baseColor = new THREE.Color(meta.color);

        const radius = 0.8 + Math.min(planet.unlockCost ?? 5, 10) * 0.08;
        const visibleColor = discovered ? baseColor.clone().lerp(new THREE.Color(0xffffff), 0.22) : new THREE.Color(0x46506f);
        const baseEmissiveIntensity = discovered ? 0.72 : 0.2;
        
        const mat = new THREE.MeshStandardMaterial({
            color: visibleColor,
            emissive: discovered ? baseColor : new THREE.Color(0x111122),
            emissiveIntensity: baseEmissiveIntensity,
            roughness: 0.3,
            metalness: 0.22,
            transparent: !discovered,
            opacity: discovered ? 1.0 : 0.62,
        });

        const mesh = new THREE.Mesh(state.sharedPlanetGeo!, mat);
        mesh.scale.setScalar(radius);

        const angle = (i / clusterPlanets.length) * Math.PI * 2 + Math.random() * 0.18;
        const orbitR = 8 + (i % 4) * 4.8 + Math.floor(i / 4) * 2.2;
        const orbitRadiusX = orbitR;
        const orbitRadiusZ = orbitR * (0.6 + Math.random() * 0.4);
        const yOffset = (Math.random() - 0.5) * 3;
        const tiltX = (Math.random() - 0.5) * 0.3;
        const tiltZ = (Math.random() - 0.5) * 0.3;
        const orbitSpeed = 0.15 / Math.sqrt(orbitR);

        const orbitPivot = new THREE.Group();
        orbitPivot.position.set(center.x, center.y + yOffset, center.z);
        orbitPivot.rotation.set(tiltX, 0, tiltZ);
        orbitPivot.userData = { type: 'orbit-pivot' };
        scene.add(orbitPivot);

        mesh.position.set(
            Math.cos(angle) * orbitRadiusX,
            0,
            Math.sin(angle) * orbitRadiusZ
        );

        mesh.userData = {
            planetId: planet.id,
            planetName: planet.name,
            clusterId,
            discovered,
            unlockCost: planet.unlockCost,
            baseEmissiveIntensity,
            type: 'planet',
            orbitAngle: angle,
            orbitRadiusX,
            orbitRadiusZ,
            orbitSpeed,
        };

        if (discovered) {
            const ringMat = new THREE.MeshBasicMaterial({
                color: meta.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25,
            });
            const ring = new THREE.Mesh(state.sharedRingGeo!, ringMat);
            ring.rotation.x = Math.PI / 2;
            const ringScale = (radius + 0.3) / radius;
            ring.scale.setScalar(ringScale);
            mesh.add(ring);
        }

        const outline = new THREE.Mesh(
            state.sharedOutlineGeo!,
            new THREE.MeshBasicMaterial({
                color: discovered ? 0xb8c2d8 : 0x9aa3b5,
                side: THREE.BackSide,
                transparent: true,
                opacity: discovered ? 0.26 : 0.2,
                depthWrite: false,
            })
        );
        outline.scale.setScalar(1.1);
        mesh.add(outline);

        const orbitMat = new THREE.LineBasicMaterial({
            color: discovered ? meta.color : 0x556677,
            transparent: true,
            opacity: discovered ? 0.25 : 0.1,
            depthWrite: false,
        });
        const orbitLine = new THREE.LineLoop(state.sharedOrbitGeo!, orbitMat);
        orbitLine.scale.set(orbitRadiusX, orbitRadiusZ, 1);
        orbitLine.rotation.x = Math.PI / 2;
        orbitLine.userData = { planetId: planet.id, type: 'orbit' };
        orbitPivot.add(orbitLine);
        state.orbitMap.set(planet.id, orbitLine);

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createGlowTexture(128, meta.colorHex, 0.4),
            color: discovered
                ? new THREE.Color(meta.color).lerp(new THREE.Color(0xffffff), 0.2)
                : new THREE.Color(meta.color).lerp(new THREE.Color(0x111827), 0.35),
            transparent: true,
            opacity: discovered ? 0.42 : 0.24,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        halo.scale.set(4.8, 4.8, 1);
        mesh.add(halo);

        orbitPivot.add(mesh);
        state.planetMeshes.push(mesh);
    });
}

export function updatePlanets(state: GalaxyPlanetsState, dt: number): void {
    state.planetMeshes.forEach(mesh => {
        mesh.rotation.y += 0.005;
        const ud = mesh.userData as Record<string, number>;
        const speed = ud.orbitSpeed;
        if (speed) {
            ud.orbitAngle += speed * dt;
            mesh.position.x = Math.cos(ud.orbitAngle) * ud.orbitRadiusX;
            mesh.position.z = Math.sin(ud.orbitAngle) * ud.orbitRadiusZ;
        }
    });
}

export function hoverPlanet(state: GalaxyPlanetsState, mesh: THREE.Mesh): void {
    const userData = mesh.userData as Record<string, unknown>;
    mesh.scale.setScalar(1.22);
    if (mesh.material) {
        const baseIntensity = Number(userData.baseEmissiveIntensity ?? 0.35);
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = baseIntensity + 0.35;
    }
    const orbitLine = state.orbitMap.get(userData.planetId as string);
    if (orbitLine && orbitLine.material) {
        (orbitLine.material as THREE.LineBasicMaterial).opacity = 0.65;
    }
    state.hoveredObj = mesh;
}

export function unhoverPlanet(state: GalaxyPlanetsState, mesh: THREE.Mesh): void {
    const userData = mesh.userData as Record<string, unknown>;
    mesh.scale.setScalar(1.0);
    if (mesh.material) {
        const baseIntensity = Number(userData.baseEmissiveIntensity ?? 0.35);
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = baseIntensity;
    }
    const orbitLine = state.orbitMap.get(userData.planetId as string);
    if (orbitLine && orbitLine.material) {
        (orbitLine.material as THREE.LineBasicMaterial).opacity = 0.25;
    }
    if (state.hoveredObj === mesh) state.hoveredObj = null;
}

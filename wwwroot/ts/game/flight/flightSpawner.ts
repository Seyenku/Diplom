/**
 * flightSpawner.ts — Управление спавном объектов (астероиды, кристаллы, бонусы)
 */

import * as THREE from 'three';

// ── Константы ────────────────────────────────────

export const FIELD_W = 16;
export const FIELD_H = 10;
export const FIELD_D = 300;

const WAVE_ASTEROID_COUNT = [2, 3, 4]; // мин. астероидов
const WAVE_ASTEROID_EXTRA = [2, 3, 3]; // доп. случайных
const WAVE_CRYSTAL_COUNT  = [1, 2, 2];
const WAVE_CRYSTAL_EXTRA  = [2, 2, 3];

export interface SpawnerState {
    asteroidGeo: THREE.IcosahedronGeometry | null;
    asteroidMat: THREE.MeshStandardMaterial | null;
    asteroidIceMat: THREE.MeshStandardMaterial | null;
    crystalGeo: THREE.OctahedronGeometry | null;
    crystalMat: THREE.MeshStandardMaterial | null;
    megaCrystalMat: THREE.MeshStandardMaterial | null;
    repairMat: THREE.MeshStandardMaterial | null;
}

/** Инициализирует общие GPU-ресурсы для спавна */
export function initSpawner(crystalColor: number): SpawnerState {
    return {
        asteroidGeo: new THREE.IcosahedronGeometry(0.5, 1),
        asteroidMat: new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9, metalness: 0.2 }),
        asteroidIceMat: new THREE.MeshStandardMaterial({ color: 0x88ccee, roughness: 0.3, metalness: 0.6, emissive: 0x224466, emissiveIntensity: 0.2 }),
        crystalGeo: new THREE.OctahedronGeometry(0.3, 0),
        crystalMat: new THREE.MeshStandardMaterial({
            color: crystalColor, emissive: crystalColor, emissiveIntensity: 0.6,
            roughness: 0.2, metalness: 0.8,
        }),
        megaCrystalMat: new THREE.MeshStandardMaterial({
            color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.9,
            roughness: 0.1, metalness: 0.9,
        }),
        repairMat: new THREE.MeshStandardMaterial({
            color: 0x4ade80, emissive: 0x4ade80, emissiveIntensity: 0.7,
            roughness: 0.15, metalness: 0.8,
        })
    };
}

/** Спавнит волну объектов, добавляет их в сцену и в переданные массивы */
export function spawnWave(
    state: SpawnerState,
    scene: THREE.Scene,
    currentWave: number,
    asteroidsArr: THREE.Object3D[],
    crystalsArr: THREE.Object3D[],
    bonusesArr: THREE.Object3D[]
): void {
    if (!state.asteroidGeo || !state.asteroidMat || !state.crystalGeo || !state.crystalMat) return;

    // Fallback to array bounds if wave is larger than mult list
    const w = Math.min(currentWave, WAVE_ASTEROID_COUNT.length - 1);

    // Астероиды
    const aCount = WAVE_ASTEROID_COUNT[w] + Math.floor(Math.random() * WAVE_ASTEROID_EXTRA[w]);
    for (let i = 0; i < aCount; i++) {
        const isIce = w >= 1 && Math.random() < 0.2 && state.asteroidIceMat;
        const mesh = new THREE.Mesh(state.asteroidGeo, isIce ? state.asteroidIceMat! : state.asteroidMat!);
        const sizeMin = 0.6 + w * 0.15;
        const sizeMax = 1.2 + w * 0.4;
        mesh.scale.setScalar(sizeMin + Math.random() * (sizeMax - sizeMin));
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        asteroidsArr.push(mesh);
    }

    // Кристаллы
    const cCount = WAVE_CRYSTAL_COUNT[w] + Math.floor(Math.random() * WAVE_CRYSTAL_EXTRA[w]);
    for (let i = 0; i < cCount; i++) {
        const mesh = new THREE.Mesh(state.crystalGeo, state.crystalMat);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.3 + Math.random() * FIELD_D * 0.7)
        );
        scene.add(mesh);
        crystalsArr.push(mesh);
    }

    // Бонусы (5% мега-кристалл, 4% ремкомплект)
    if (Math.random() < 0.05 && state.megaCrystalMat && state.crystalGeo) {
        const mesh = new THREE.Mesh(state.crystalGeo, state.megaCrystalMat);
        mesh.scale.setScalar(0.6);
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.4 + Math.random() * FIELD_D * 0.5)
        );
        (mesh as any).userData._bonusType = 'mega';
        scene.add(mesh);
        bonusesArr.push(mesh);
    }
    if (Math.random() < 0.04 && state.repairMat) {
        const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.35, 0),
            state.repairMat
        );
        mesh.position.set(
            (Math.random() - 0.5) * FIELD_W,
            (Math.random() - 0.5) * FIELD_H,
            -(FIELD_D * 0.4 + Math.random() * FIELD_D * 0.5)
        );
        (mesh as any).userData._bonusType = 'repair';
        scene.add(mesh);
        bonusesArr.push(mesh);
    }
}

/** Очистка GPU-ресурсов */
export function disposeSpawner(state: SpawnerState): void {
    state.asteroidGeo?.dispose(); state.asteroidGeo = null;
    state.asteroidMat?.dispose(); state.asteroidMat = null;
    state.asteroidIceMat?.dispose(); state.asteroidIceMat = null;
    state.crystalGeo?.dispose();  state.crystalGeo = null;
    state.crystalMat?.dispose();  state.crystalMat = null;
    state.megaCrystalMat?.dispose(); state.megaCrystalMat = null;
    state.repairMat?.dispose(); state.repairMat = null;
}

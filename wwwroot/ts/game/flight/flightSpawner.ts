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

const MAX_LIVE_BONUSES = 3; // редкость мега/ремкомплектов не зависит от рецикла

export interface SpawnerState {
    asteroidGeo: THREE.IcosahedronGeometry | null;
    asteroidMat: THREE.MeshStandardMaterial | null;
    asteroidIceMat: THREE.MeshStandardMaterial | null;
    crystalGeo: THREE.OctahedronGeometry | null;
    crystalMat: THREE.MeshStandardMaterial | null;
    megaCrystalMat: THREE.MeshStandardMaterial | null;
    repairGeo: THREE.OctahedronGeometry | null;
    repairMat: THREE.MeshStandardMaterial | null;
}

/** Точка спавна с упреждением по вектору скорости корабля: объект ставится
 *  туда, где корабль окажется к моменту подлёта (t = |z| / approachSpeed).
 *  Коэффициент 0.6 — неполный перехват, чтобы поле не было детерминированным. */
function _spawnPos(
    centerX: number, centerY: number,
    vx: number, vy: number, approachSpeed: number,
    zNearFrac = 0.3, zSpanFrac = 0.7
): { x: number; y: number; z: number } {
    const z = -(FIELD_D * zNearFrac + Math.random() * FIELD_D * zSpanFrac);
    const tArrive = -z / Math.max(1, approachSpeed);
    const leadX = Math.max(-40, Math.min(40, vx * tArrive * 0.6));
    const leadY = Math.max(-25, Math.min(25, vy * tArrive * 0.6));
    return {
        x: centerX + leadX + (Math.random() - 0.5) * FIELD_W,
        y: centerY + leadY + (Math.random() - 0.5) * FIELD_H,
        z,
    };
}

/** Рециркуляция: переставляет вышедший из игры меш на новую позицию впереди
 *  корабля. Без dispose/create — геометрия и материалы общие, GC не трогаем. */
export function recycleObject(
    obj: THREE.Object3D,
    centerX: number, centerY: number,
    vx: number, vy: number, approachSpeed: number
): void {
    const p = _spawnPos(centerX, centerY, vx, vy, approachSpeed);
    obj.position.set(p.x, p.y, p.z);
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
        repairGeo: new THREE.OctahedronGeometry(0.35, 0),
        repairMat: new THREE.MeshStandardMaterial({
            color: 0x4ade80, emissive: 0x4ade80, emissiveIntensity: 0.7,
            roughness: 0.15, metalness: 0.8,
        })
    };
}

/** Спавнит волну объектов, добавляет их в сцену и в переданные массивы.
 *  centerX/centerY — позиция корабля; vx/vy/approachSpeed дают упреждение,
 *  чтобы объекты появлялись там, куда игрок летит, а не где он был.
 *  maxAsteroids/maxCrystals — капы пула: спавн лишь дозаполняет до них. */
export function spawnWave(
    state: SpawnerState,
    scene: THREE.Scene,
    currentWave: number,
    centerX: number,
    centerY: number,
    vx: number,
    vy: number,
    approachSpeed: number,
    maxAsteroids: number,
    maxCrystals: number,
    asteroidsArr: THREE.Object3D[],
    crystalsArr: THREE.Object3D[],
    bonusesArr: THREE.Object3D[]
): void {
    if (!state.asteroidGeo || !state.asteroidMat || !state.crystalGeo || !state.crystalMat) return;

    // Fallback to array bounds if wave is larger than mult list
    const w = Math.min(currentWave, WAVE_ASTEROID_COUNT.length - 1);

    // Астероиды
    const aWant = WAVE_ASTEROID_COUNT[w] + Math.floor(Math.random() * WAVE_ASTEROID_EXTRA[w]);
    const aCount = Math.min(aWant, Math.max(0, maxAsteroids - asteroidsArr.length));
    for (let i = 0; i < aCount; i++) {
        const isIce = w >= 1 && Math.random() < 0.2 && state.asteroidIceMat;
        const mesh = new THREE.Mesh(state.asteroidGeo, isIce ? state.asteroidIceMat! : state.asteroidMat!);
        const sizeMin = 0.6 + w * 0.15;
        const sizeMax = 1.2 + w * 0.4;
        mesh.scale.setScalar(sizeMin + Math.random() * (sizeMax - sizeMin));
        const ap = _spawnPos(centerX, centerY, vx, vy, approachSpeed);
        mesh.position.set(ap.x, ap.y, ap.z);
        scene.add(mesh);
        asteroidsArr.push(mesh);
    }

    // Кристаллы
    const cWant = WAVE_CRYSTAL_COUNT[w] + Math.floor(Math.random() * WAVE_CRYSTAL_EXTRA[w]);
    const cCount = Math.min(cWant, Math.max(0, maxCrystals - crystalsArr.length));
    for (let i = 0; i < cCount; i++) {
        const mesh = new THREE.Mesh(state.crystalGeo, state.crystalMat);
        const cp = _spawnPos(centerX, centerY, vx, vy, approachSpeed);
        mesh.position.set(cp.x, cp.y, cp.z);
        scene.add(mesh);
        crystalsArr.push(mesh);
    }

    // Бонусы (5% мега-кристалл, 4% ремкомплект)
    if (bonusesArr.length >= MAX_LIVE_BONUSES) return;
    if (Math.random() < 0.05 && state.megaCrystalMat && state.crystalGeo) {
        const mesh = new THREE.Mesh(state.crystalGeo, state.megaCrystalMat);
        mesh.scale.setScalar(0.6);
        const bp = _spawnPos(centerX, centerY, vx, vy, approachSpeed, 0.4, 0.5);
        mesh.position.set(bp.x, bp.y, bp.z);
        (mesh as any).userData._bonusType = 'mega';
        scene.add(mesh);
        bonusesArr.push(mesh);
    }
    if (Math.random() < 0.04 && state.repairGeo && state.repairMat) {
        const mesh = new THREE.Mesh(state.repairGeo, state.repairMat);
        const rp = _spawnPos(centerX, centerY, vx, vy, approachSpeed, 0.4, 0.5);
        mesh.position.set(rp.x, rp.y, rp.z);
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
    state.repairGeo?.dispose(); state.repairGeo = null;
    state.repairMat?.dispose(); state.repairMat = null;
}

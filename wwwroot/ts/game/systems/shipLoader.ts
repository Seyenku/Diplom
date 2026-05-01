/**
 * shipLoader.ts — Загрузка и настройка модели корабля
 *
 * Единая точка загрузки ship.glb с fallback-геометрией и настройкой цвета.
 * Используется в screenFlight и screenMiniGame.
 */

import * as THREE from 'three';
import { loadModel } from '../gltfLoader.js';
import { applyShipColor, createFallbackShip } from '../shipUtils.js';

/**
 * Загружает модель корабля, применяет цвет и возвращает готовую Group.
 * При ошибке загрузки использует fallback-геометрию.
 *
 * @param color - hex-цвет корабля (e.g. '#4fc3f7')
 * @param position - начальная позиция (по умолчанию 0,0,0)
 */
export async function loadShipGroup(
    color: string,
    position?: THREE.Vector3,
): Promise<THREE.Group> {
    const ship = new THREE.Group();
    if (position) ship.position.copy(position);

    try {
        const mesh = await loadModel('/models/ship.glb');
        mesh.scale.set(0.5, 0.5, 0.5);
        mesh.rotation.y = -Math.PI / 2; // модель экспортирована носом по X → корректируем на -Z
        ship.add(mesh);
    } catch (e) {
        console.warn('[ShipLoader] ship.glb not loaded, using fallback');
        const fallback = createFallbackShip();
        if (fallback) ship.add(fallback);
    }

    applyShipColor(ship, color);
    return ship;
}

// Реэкспортируем утилиты из shipUtils для удобства
export { applyShipColor, createFallbackShip } from '../shipUtils.js';

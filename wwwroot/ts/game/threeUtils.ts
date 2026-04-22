/**
 * threeUtils.ts — Общие Three.js утилиты
 *
 * Извлечены из threeScene.ts, screenGalaxyMap.ts, screenPlanetDetail.ts,
 * screenMiniGame.ts, screenCharCreation.ts для устранения дублирования.
 */

import * as THREE from 'three';

/**
 * Рекурсивно освобождает GPU-ресурсы всего графа объектов:
 * - Geometries
 * - Materials (включая вложенные текстуры)
 *
 * НЕ удаляет объекты из сцены — это ответственность вызывающего кода.
 */
export function disposeSceneGraph(root: THREE.Object3D): void {
    root.traverse(obj => {
        const mesh = obj as THREE.Mesh;

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
                // Dispose всех текстур, привязанных к материалу
                for (const key of Object.keys(mat)) {
                    const val = (mat as unknown as Record<string, unknown>)[key];
                    if (val instanceof THREE.Texture) val.dispose();
                }
                mat.dispose();
            });
        }
    });
}

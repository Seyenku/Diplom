/**
 * shipUtils.ts — Общие утилиты для работы с 3D-моделью корабля
 *
 * Извлечены из screenFlight.ts, screenMiniGame.ts и screenCharCreation.ts
 * для устранения дублирования кода.
 */

import * as THREE from 'three';

/**
 * Применяет цвет к 3D-модели корабля.
 *
 * Стратегия:
 *   1. Ищет материал с именем `ship_body` → красит его.
 *   2. Если не найден — красит первый материал с `color`.
 */
export function applyShipColor(root: THREE.Object3D, hexColor: string): void {
    let bodyFound = false;
    let firstPaintable: THREE.Material | null = null;

    root.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mat => {
            if (!firstPaintable && _isColorMaterial(mat)) {
                firstPaintable = mat;
            }

            if (mat.name === 'ship_body' && _isColorMaterial(mat)) {
                mat.color.set(hexColor);
                mat.needsUpdate = true;
                bodyFound = true;
            }
        });
    });

    if (!bodyFound && firstPaintable) {
        const mat = firstPaintable as unknown as { color: THREE.Color; needsUpdate: boolean };
        if (mat.color) {
            mat.color.set(hexColor);
            mat.needsUpdate = true;
        }
    }
}

/**
 * Создаёт фоллбэк-модель корабля (когда ship.glb недоступен).
 *
 * Конус (корпус) + плоский бокс (крылья).
 */
export function createFallbackShip(): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x4fc3f7,
        metalness: 0.7,
        roughness: 0.3,
    });
    bodyMat.name = 'ship_body';

    const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 1.5, 6),
        bodyMat
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const wing = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.05, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x818cf8, metalness: 0.5, roughness: 0.4 })
    );
    wing.position.z = 0.3;
    group.add(wing);

    return group;
}

// ── Внутренние хелперы ──────────────────────────────────────────────────────

function _isColorMaterial(mat: THREE.Material): mat is THREE.Material & { color: THREE.Color } {
    return 'color' in (mat as unknown as Record<string, unknown>);
}

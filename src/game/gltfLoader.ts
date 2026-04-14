/**
 * gltfLoader.ts — Обёртка загрузки GLB-моделей с кешированием
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _cache = new Map<string, THREE.Group>();
const _loader = new GLTFLoader();

/**
 * Загружает GLB-модель по URL. Повторные вызовы возвращают кеш.
 * @param url — путь к .glb (например '/models/ship.glb')
 * @returns — клонированная группа из модели
 */
export async function loadModel(url: string): Promise<THREE.Group> {
    if (_cache.has(url)) {
        return (_cache.get(url) as THREE.Group).clone();
    }

    return new Promise((resolve, reject) => {
        _loader.load(
            url,
            (gltf) => {
                _cache.set(url, gltf.scene);
                resolve(gltf.scene.clone());
            },
            undefined,
            (err) => {
                console.error(`[gltfLoader] Failed to load ${url}:`, err);
                reject(err);
            }
        );
    });
}

/**
 * Предзагрузка нескольких моделей (fire-and-forget)
 */
export function preloadModels(urls: string[]): Promise<PromiseSettledResult<THREE.Group>[]> {
    return Promise.allSettled(urls.map(url => loadModel(url)));
}

/**
 * Очистка кеша
 */
export function clearModelCache(): void {
    _cache.clear();
}

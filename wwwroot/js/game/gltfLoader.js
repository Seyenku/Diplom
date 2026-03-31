/**
 * gltfLoader.js — Обёртка загрузки GLB-моделей с кешированием
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _cache = new Map();
const _loader = new GLTFLoader();

/**
 * Загружает GLB-модель по URL. Повторные вызовы возвращают кеш.
 * @param {string} url — путь к .glb (например '/models/ship.glb')
 * @returns {Promise<THREE.Group>} — клонированная группа из модели
 */
export async function loadModel(url) {
    if (_cache.has(url)) {
        return _cache.get(url).scene.clone();
    }

    return new Promise((resolve, reject) => {
        _loader.load(
            url,
            (gltf) => {
                _cache.set(url, gltf);
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
export function preloadModels(urls) {
    return Promise.allSettled(urls.map(url => loadModel(url)));
}

/**
 * Очистка кеша
 */
export function clearModelCache() {
    _cache.clear();
}

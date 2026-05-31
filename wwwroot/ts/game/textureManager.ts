/**
 * textureManager.ts — Кэш THREE.Texture с refcount.
 *
 * Цель: одна и та же текстура должна загружаться один раз; повторный запрос
 * возвращает закэшированный объект. При освобождении refcount → 0 текстура
 * диспозится.
 *
 * Загрузка асинхронная: возвращаемая THREE.Texture сразу пригодна к использованию
 * в материале, но `.image` появится только после fetch'а; .needsUpdate = true
 * взводится автоматически.
 */

import * as THREE from 'three';
import { renderer as globalRenderer } from './threeScene.js';

interface CacheEntry {
    texture: THREE.Texture;
    refcount: number;
}

const _cache = new Map<string, CacheEntry>();
const _loader = new THREE.TextureLoader();

/**
 * Загружает текстуру по URL, кэширует и инкрементит refcount.
 * Повторный вызов того же URL возвращает уже загруженную текстуру.
 */
export function loadTexture(url: string): THREE.Texture {
    const existing = _cache.get(url);
    if (existing) {
        existing.refcount++;
        return existing.texture;
    }

    const texture = _loader.load(
        url,
        // onLoad: настройки фильтрации и анизотропии
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            if (globalRenderer) {
                tex.anisotropy = Math.min(8, globalRenderer.capabilities.getMaxAnisotropy());
            }
            tex.needsUpdate = true;
        },
        undefined,
        (err) => {
            console.warn(`[TextureManager] Failed to load: ${url}`, err);
        }
    );

    _cache.set(url, { texture, refcount: 1 });
    return texture;
}

/**
 * Декрементит refcount. При достижении 0 — диспозит текстуру и удаляет из кэша.
 */
export function releaseTexture(url: string): void {
    const entry = _cache.get(url);
    if (!entry) return;
    entry.refcount--;
    if (entry.refcount <= 0) {
        entry.texture.dispose();
        _cache.delete(url);
    }
}

/**
 * Принудительно очищает весь кэш. Используется при полной очистке сцены
 * (например, при выходе из игры).
 */
export function clearAllTextures(): void {
    _cache.forEach(entry => entry.texture.dispose());
    _cache.clear();
}

/** Для диагностики: текущее количество кэшированных текстур. */
export function cachedTextureCount(): number {
    return _cache.size;
}

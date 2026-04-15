/**
 * qualityPresets.ts — Центральный модуль управления качеством графики
 *
 * Паттерн Quality Profile: экраны не знают об уровнях Low/Medium/High,
 * а получают конкретные числовые параметры через getProfile().
 *
 * Подписка через onQualityChange() позволяет экранам реагировать
 * на смену качества мгновенно (без перезагрузки страницы).
 */

// ── Типы ────────────────────────────────────────────────────────────────────

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
    // Renderer
    pixelRatio: number;
    antialias: boolean;

    // Starfield (threeScene.ts — фон главного меню и других сцен)
    starfieldCount: number;

    // Asteroid Belt (threeScene.ts — пояс астероидов)
    asteroidBeltCount: number;

    // Galaxy Map
    mapStarsCount: number;
    nebulaParticles: number;
    nebulaSparks: number;
    glowTextureSize: number;
    planetSegments: [number, number];
    planetRingSegments: number;

    // Flight
    flightStarfieldCount: number;
    spawnChancePerFrame: number;
}

// ── Профили ─────────────────────────────────────────────────────────────────

const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

const PRESETS: Record<QualityLevel, QualityProfile> = {
    low: {
        pixelRatio:           1,
        antialias:            false,
        starfieldCount:       500,
        asteroidBeltCount:    25,
        mapStarsCount:        500,
        nebulaParticles:      200,
        nebulaSparks:         30,
        glowTextureSize:      64,
        planetSegments:       [12, 8],
        planetRingSegments:   16,
        flightStarfieldCount: 800,
        spawnChancePerFrame:  0.025,
    },
    medium: {
        pixelRatio:           Math.min(dpr, 1.5),
        antialias:            true,
        starfieldCount:       1500,
        asteroidBeltCount:    60,
        mapStarsCount:        1500,
        nebulaParticles:      600,
        nebulaSparks:         80,
        glowTextureSize:      128,
        planetSegments:       [24, 18],
        planetRingSegments:   32,
        flightStarfieldCount: 2500,
        spawnChancePerFrame:  0.04,
    },
    high: {
        pixelRatio:           Math.min(dpr, 2),
        antialias:            true,
        starfieldCount:       2500,
        asteroidBeltCount:    100,
        mapStarsCount:        2500,
        nebulaParticles:      1000,
        nebulaSparks:         150,
        glowTextureSize:      256,
        planetSegments:       [32, 24],
        planetRingSegments:   48,
        flightStarfieldCount: 4000,
        spawnChancePerFrame:  0.06,
    },
};

// ── Внутреннее состояние ────────────────────────────────────────────────────

let _currentLevel: QualityLevel = 'medium';
let _currentProfile: QualityProfile = { ...PRESETS.medium };

type QualityChangeCallback = (profile: Readonly<QualityProfile>, level: QualityLevel) => void;
const _listeners: Set<QualityChangeCallback> = new Set();

// ── API ─────────────────────────────────────────────────────────────────────

/** Возвращает текущий профиль качества (только для чтения) */
export function getProfile(): Readonly<QualityProfile> {
    return _currentProfile;
}

/** Возвращает текущий уровень качества */
export function getQualityLevel(): QualityLevel {
    return _currentLevel;
}

/**
 * Устанавливает уровень качества и оповещает подписчиков.
 * Если уровень не изменился — ничего не происходит.
 */
export function setQuality(level: QualityLevel): void {
    if (level === _currentLevel) return;
    if (!PRESETS[level]) {
        console.warn(`[QualityPresets] Unknown quality level: "${level}", falling back to "medium"`);
        level = 'medium';
    }
    _currentLevel = level;
    _currentProfile = { ...PRESETS[level] };
    console.log(`[QualityPresets] Quality set to "${level}"`);

    _listeners.forEach(cb => {
        try { cb(_currentProfile, level); }
        catch (e) { console.error('[QualityPresets] Listener error:', e); }
    });
}

/**
 * Инициализирует уровень качества без вызова подписчиков.
 * Используется при старте до создания рендерера.
 */
export function initQuality(level: QualityLevel): void {
    if (!PRESETS[level]) level = 'medium';
    _currentLevel = level;
    _currentProfile = { ...PRESETS[level] };
}

/**
 * Подписка на изменение качества.
 * Коллбэк вызывается ТОЛЬКО при реальной смене уровня.
 */
export function onQualityChange(cb: QualityChangeCallback): void {
    _listeners.add(cb);
}

/** Отписка от изменений */
export function offQualityChange(cb: QualityChangeCallback): void {
    _listeners.delete(cb);
}

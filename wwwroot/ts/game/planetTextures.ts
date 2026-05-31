/**
 * planetTextures.ts — Реестр профилей текстур для планет.
 *
 * Каждая планета в БД хранит TextureKey (см. Planets.TextureKey).
 * Здесь TextureKey разворачивается в полный профиль: surface, optional clouds,
 * normal-map, цвет атмосферы и скорости вращения слоёв.
 *
 * Файлы текстур лежат в /wwwroot/images/textures/.
 */

export interface TextureProfile {
    /** Базовая карта поверхности (обязательная). */
    surface: string;
    /** Альфа-маска облаков (опц.). Если задана — рендерится отдельной сферой с увеличенным радиусом. */
    clouds?: string;
    /** Нормал-карта рельефа (опц.). */
    normal?: string;
    /** Цвет атмосферного halo вокруг планеты (hex). */
    atmoColor: number;
    /** Скорость вращения поверхности (рад/кадр). */
    surfaceRotSpeed: number;
    /** Скорость вращения облаков (рад/кадр). Параллакс возникает при cloud > surface. */
    cloudRotSpeed: number;
}

const TEXTURE_BASE = '/images/textures/';

// ── Реестр профилей ────────────────────────────────────────────────────────

export const TEXTURE_PROFILES: Readonly<Record<string, TextureProfile>> = {
    // ── Программирование / технологические ──────────────────────────────
    'neptune':        { surface: 'neptune.jpg',       atmoColor: 0x3b6db8, surfaceRotSpeed: 0.0025, cloudRotSpeed: 0.0040 },
    'gasgiant-blue':  { surface: 'gasgiant-blue.png', atmoColor: 0x4fc3f7, surfaceRotSpeed: 0.0030, cloudRotSpeed: 0.0045 },
    'metall':         { surface: 'metall.jpg',        atmoColor: 0x7a8aa0, surfaceRotSpeed: 0.0020, cloudRotSpeed: 0.0035 },
    'glass':          { surface: 'glass.jpg',         atmoColor: 0x9ed8ff, surfaceRotSpeed: 0.0025, cloudRotSpeed: 0.0040 },
    'met2':           { surface: 'met2.jpg',          atmoColor: 0x6e7d92, surfaceRotSpeed: 0.0022, cloudRotSpeed: 0.0036 },
    'zks':            { surface: 'zks.jpg',           atmoColor: 0x5fa0cc, surfaceRotSpeed: 0.0028, cloudRotSpeed: 0.0042 },
    'vortex':         { surface: 'vortex.jpg',        atmoColor: 0x6db4ee, surfaceRotSpeed: 0.0035, cloudRotSpeed: 0.0055 },
    'uvbluesun':      { surface: 'uvbluesun.jpg',     atmoColor: 0x4a9cff, surfaceRotSpeed: 0.0030, cloudRotSpeed: 0.0048 },
    'iceworld2':      { surface: 'iceworld2.jpg',     atmoColor: 0x8fc8e6, surfaceRotSpeed: 0.0022, cloudRotSpeed: 0.0036 },
    'ice':            { surface: 'ice.jpg',           atmoColor: 0xaadbf3, surfaceRotSpeed: 0.0020, cloudRotSpeed: 0.0034 },
    'mh':             { surface: 'mh.jpg',            atmoColor: 0x7a9bbf, surfaceRotSpeed: 0.0024, cloudRotSpeed: 0.0040 },
    'hs':             { surface: 'hs.png',            atmoColor: 0x90b0d0, surfaceRotSpeed: 0.0023, cloudRotSpeed: 0.0038 },

    // ── Медицина / тёплые и газовые ──────────────────────────────────────
    'dgnyre':         { surface: 'dgnyre.jpg',                       clouds: 'dgnyre-clouds.png', atmoColor: 0xd87e5c, surfaceRotSpeed: 0.0025, cloudRotSpeed: 0.0048 },
    'ertaale':        { surface: 'ertaale.jpg',                      atmoColor: 0xc66b48, surfaceRotSpeed: 0.0022, cloudRotSpeed: 0.0036 },
    'gas_yellow':     { surface: 'gas_yellow.jpg',                   atmoColor: 0xe9c66a, surfaceRotSpeed: 0.0030, cloudRotSpeed: 0.0045 },
    'jupiter':        { surface: 'jupiter.jpg',                      atmoColor: 0xd8a06b, surfaceRotSpeed: 0.0032, cloudRotSpeed: 0.0050 },
    'venmap':         { surface: 'venmap.png',                       atmoColor: 0xe6c79b, surfaceRotSpeed: 0.0018, cloudRotSpeed: 0.0030 },
    'mars':           { surface: 'mars.jpg',                         atmoColor: 0xb35c3a, surfaceRotSpeed: 0.0025, cloudRotSpeed: 0.0040 },
    'mars2':          { surface: 'mars2.jpg',                        atmoColor: 0xc06848, surfaceRotSpeed: 0.0025, cloudRotSpeed: 0.0040 },
    'ertaale_ast_2006036_lrg': { surface: 'ertaale_ast_2006036_lrg.jpg', atmoColor: 0xd07050, surfaceRotSpeed: 0.0024, cloudRotSpeed: 0.0040 },
    'hst_saturn_nicmos':       { surface: 'hst_saturn_nicmos.png',       atmoColor: 0xc99770, surfaceRotSpeed: 0.0028, cloudRotSpeed: 0.0044 },

    // ── Геология / каменные ──────────────────────────────────────────────
    'earth':          { surface: 'earth.png',  clouds: 'dgnyre-clouds.png', atmoColor: 0x4fa9e2, surfaceRotSpeed: 0.0030, cloudRotSpeed: 0.0048 },
    'mercury':        { surface: 'mercury.jpg', atmoColor: 0x9a7e62, surfaceRotSpeed: 0.0018, cloudRotSpeed: 0.0030 },
    'moon':           { surface: 'moon.jpg',    atmoColor: 0x9ea7b0, surfaceRotSpeed: 0.0015, cloudRotSpeed: 0.0028 },
    'moon34':         { surface: 'moon34.jpg',  atmoColor: 0xa8b0b8, surfaceRotSpeed: 0.0017, cloudRotSpeed: 0.0030 },
    'pluto':          { surface: 'pluto.jpg',   atmoColor: 0xc8a890, surfaceRotSpeed: 0.0015, cloudRotSpeed: 0.0028 },
};

// Fallback-профиль для незнакомых TextureKey
const FALLBACK_PROFILE: TextureProfile = {
    surface: 'moon.jpg',
    atmoColor: 0x9ea7b0,
    surfaceRotSpeed: 0.0020,
    cloudRotSpeed: 0.0035,
};

// ── API ─────────────────────────────────────────────────────────────────────

/** Возвращает профиль для заданного ключа. Если ключ неизвестен — fallback. */
export function getTextureProfile(key?: string | null): TextureProfile | null {
    if (!key) return null;
    return TEXTURE_PROFILES[key] ?? FALLBACK_PROFILE;
}

/** Полный URL текстуры по имени файла из профиля. */
export function textureUrl(file: string): string {
    return TEXTURE_BASE + file;
}

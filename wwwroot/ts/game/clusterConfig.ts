/**
 * clusterConfig.ts — Единый источник метаданных кластеров (туманностей)
 *
 * Спроектирован как расширяемый: для добавления нового кластера достаточно
 * добавить запись в CLUSTER_REGISTRY и расширить тип ClusterType.
 *
 * Извлечено из screenGalaxyMap.ts, screenPlanetDetail.ts, screenFlight.ts, hudManager.ts
 * для устранения дублирования.
 */

import { ClusterType, CrystalType, ClusterMeta } from './types.js';

// ── Полные метаданные кластера ──────────────────────────────────────────────

export interface ClusterConfig {
    /** Уникальный ID кластера (совпадает с ClusterType) */
    id: ClusterType;
    /** Полное отображаемое название */
    label: string;
    /** Краткое название (для UI-бейджей) */
    shortLabel: string;
    /** Эмодзи-иконка кластера */
    icon: string;
    /** Числовой цвет для Three.js */
    color: number;
    /** HEX-строка цвета для CSS */
    colorHex: string;
    /** Эмодзи кристалла */
    crystalEmoji: string;
    /** Тип кристалла этого кластера */
    crystalType: CrystalType;
    /** Позиция в 3D-пространстве Galaxy Map */
    position: { x: number; y: number; z: number };
}

// ── Реестр кластеров ────────────────────────────────────────────────────────

const CLUSTER_REGISTRY: readonly ClusterConfig[] = [
    {
        id: 'programming',
        label: 'Туманность Кибернетики',
        shortLabel: 'Программирование',
        icon: '💻',
        color: 0x4fc3f7,
        colorHex: '#4fc3f7',
        crystalEmoji: '💎',
        crystalType: 'programming',
        position: { x: -40, y: 5, z: -10 },
    },
    {
        id: 'medicine',
        label: 'Туманность Целителей',
        shortLabel: 'Медицина',
        icon: '⚕',
        color: 0xf87171,
        colorHex: '#f87171',
        crystalEmoji: '❤️',
        crystalType: 'medicine',
        position: { x: 35, y: 15, z: -15 },
    },
    {
        id: 'geology',
        label: 'Туманность Геодезистов',
        shortLabel: 'Геология',
        icon: '🌍',
        color: 0x34d399,
        colorHex: '#34d399',
        crystalEmoji: '🌿',
        crystalType: 'geology',
        position: { x: 10, y: -20, z: 30 },
    },
] as const;

// ── Публичный API ───────────────────────────────────────────────────────────

/** Полный массив зарегистрированных кластеров */
export const CLUSTERS: readonly ClusterConfig[] = CLUSTER_REGISTRY;

/** Быстрый доступ по ID кластера */
export const CLUSTER_MAP: Readonly<Record<ClusterType, ClusterConfig>> =
    Object.fromEntries(CLUSTER_REGISTRY.map(c => [c.id, c])) as Record<ClusterType, ClusterConfig>;

/** Совместимый формат ClusterMeta для Galaxy Map 3D-сцены */
export const CLUSTER_META: Readonly<Record<ClusterType, ClusterMeta>> =
    Object.fromEntries(CLUSTER_REGISTRY.map(c => [c.id, {
        label: c.label,
        icon: c.icon,
        color: c.color,
        colorHex: c.colorHex,
        crystalEmoji: c.crystalEmoji,
        position: c.position,
    }])) as Record<ClusterType, ClusterMeta>;

/**
 * Цветовая конфигурация для экранов Flight и HUD.
 * Формат: { color: number; emoji: string; label: string }
 */
export const CRYSTAL_COLORS: Readonly<Record<string, { color: number; emoji: string; label: string }>> =
    Object.fromEntries(CLUSTER_REGISTRY.map(c => [c.crystalType, {
        color: c.color,
        emoji: c.crystalEmoji,
        label: c.shortLabel,
    }])) as Record<string, { color: number; emoji: string; label: string }>;

/**
 * Иконки для HUD-бейджей кристаллов.
 */
export const CRYSTAL_ICONS: Readonly<Record<string, string>> =
    Object.fromEntries(CLUSTER_REGISTRY.map(c => [c.crystalType, c.crystalEmoji])) as Record<string, string>;

/**
 * Получить конфигурацию кластера по ID.
 * Возвращает undefined если кластер не зарегистрирован.
 */
export function getCluster(id: ClusterType | string): ClusterConfig | undefined {
    return CLUSTER_MAP[id as ClusterType];
}

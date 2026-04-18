// ============================================================
// Р“Р»РѕР±Р°Р»СЊРЅС‹Рµ С‚РёРїС‹ РґР»СЏ Stellar Vocation SPA
// ============================================================

// в”Ђв”Ђ Р­РєСЂР°РЅС‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export const Screen = Object.freeze({
    MAIN_MENU:        'main-menu',
    CHAR_CREATION:    'char-creation',
    ONBOARDING:       'onboarding',
    HUD:              'hud',
    PAUSE:            'pause',
    FLIGHT:           'flight',
    GALAXY_MAP:       'galaxy-map',
    PLANET_DETAIL:    'planet-detail',
    MINIGAME:         'minigame',
    SHIP_UPGRADE:     'ship-upgrade',
    VOCATION_CONST:   'vocation-constellation',
    ACHIEVEMENTS:     'achievements',
    SETTINGS:         'settings',
    GUIDE:            'guide',
    OFFLINE_ERROR:    'offline-error',
} as const);

export type ScreenId = (typeof Screen)[keyof typeof Screen];

// в”Ђв”Ђ DTO: РџР»Р°РЅРµС‚Р° (РєР°С‚Р°Р»РѕРі РїСЂРѕС„РµСЃСЃРёР№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface PlanetDto {
    id: string;
    name: string;
    description: string;
    clusterId: ClusterType;
    clusterName: string;
    crystalType: CrystalType;
    unlockCost: number;
    hardSkills: string[];
    softSkills: string[];
    risks: string[];
    isStarterVisible: boolean;
}

// в”Ђв”Ђ DTO: РљР»Р°СЃС‚РµСЂ (С‚СѓРјР°РЅРЅРѕСЃС‚СЊ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface ClusterDto {
    id: ClusterType;
    name: string;
    displayName: string;
    crystalType: CrystalType;
    description: string;
    planetCount: number;
}

// в”Ђв”Ђ DTO: РќР°СЃС‚СЂРѕР№РєРё РёРіСЂС‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface GameSettingsDto {
    soundVolume: number;
    musicVolume: number;
    graphicsQuality: 'low' | 'medium' | 'high';
    controlScheme: 'keyboard' | 'mouse' | 'touch';
    subtitles: boolean;
    colorblindMode: boolean;
    uiScale: number;
    guideEnabled: boolean;
}

// в”Ђв”Ђ DTO: РќР°РіСЂР°РґР° Р·Р° РјРёРЅРё-РёРіСЂСѓ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface MiniGameRewardDto {
    valid: boolean;
    crystals: Record<CrystalType, number>;
    badges: string[];
}

// в”Ђв”Ђ РўРёРїС‹ РєСЂРёСЃС‚Р°Р»Р»РѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export type CrystalType =
    | 'programming' | 'medicine' | 'geology'
    | 'it' | 'bio' | 'math' | 'eco'
    | 'design' | 'med' | 'neuro' | 'physics';

export type ClusterType = 'programming' | 'medicine' | 'geology';

// в”Ђв”Ђ РРіСЂРѕРє (СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РІ localStorage) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface PlayerState {
    name: string;
    shipColor: string;
    crystals: Record<CrystalType, number>;
    discoveredPlanets: string[];
    appliedUpgrades: string[];
    shipStats: {
        speedBonus: number;
        shieldBonus: number;
        scanRange: number;
        capacity: number;
    };
    stats: {
        scans: number;
        miniGamesPlayed: number;
        totalCrystalsEarned: number;
        flights?: number;
    };
    badges: string[];
}

// в”Ђв”Ђ РђРїРіСЂРµР№Рґ РєРѕСЂР°Р±Р»СЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface UpgradeDto {
    id: string;
    name: string;
    description: string;
    category: 'engine' | 'shield' | 'scanner' | 'capacity';
    cost: Record<CrystalType, number>;
    effect: {
        speedBonus?: number;
        shieldBonus?: number;
        scanRange?: number;
        capacity?: number;
    };
}

// в”Ђв”Ђ Session Data (volatile, С…СЂР°РЅРёС‚СЃСЏ РІ РїР°РјСЏС‚Рё) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface SessionData {
    clusters: ClusterDto[];
    catalog: PlanetDto[];
    upgrades: UpgradeDto[];
    planetId?: string;
    crystalType?: CrystalType;
    regionId?: string;
    errorMessage?: string;
    errorLog?: string;
}

// в”Ђв”Ђ Game Store (РµРґРёРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє РёСЃС‚РёРЅС‹) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface GameStore {
    currentScreen: ScreenId | null;
    previousScreen: ScreenId | null;
    player: PlayerState | null;
    catalog: PlanetDto[];
    upgrades: UpgradeDto[];
    settings: GameSettingsDto | null;
    sessionData: SessionData;
}

// в”Ђв”Ђ Actions в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export type ActionType =
    | 'SET_PLAYER'
    | 'ADD_CRYSTALS'
    | 'SPEND_CRYSTALS'
    | 'DISCOVER_PLANET'
    | 'APPLY_UPGRADE'
    | 'EARN_CRYSTALS'
    | 'SET_SESSION'
    | 'CLEAR_SESSION'
    | 'SET_SETTINGS'
    | 'INCREMENT_STAT'
    | 'ADD_BADGE'
    | 'SCREEN_CHANGED';

export interface ActionPayload {
    SET_PLAYER: Partial<PlayerState>;
    ADD_CRYSTALS: { dir: CrystalType; amount: number };
    SPEND_CRYSTALS: { spent: Record<CrystalType, number> };
    DISCOVER_PLANET: { planetId: string };
    APPLY_UPGRADE: { upgradeId: string };
    EARN_CRYSTALS: { earned: Record<CrystalType, number> };
    SET_SESSION: Partial<SessionData>;
    CLEAR_SESSION: Record<string, never>;
    SET_SETTINGS: Partial<GameSettingsDto>;
    INCREMENT_STAT: { key: string };
    ADD_BADGE: { badge: string };
    SCREEN_CHANGED: { screenId: ScreenId; previousScreen: ScreenId | null };
}

// в”Ђв”Ђ Р­РєСЂР°РЅ-РјРѕРґСѓР»СЊ (init/destroy) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface ScreenModule {
    init: (store: GameStore) => Promise<void> | void;
    destroy?: () => void;
}

// в”Ђв”Ђ РўРµР»РµРјРµС‚СЂРёСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface TelemetryEventDto {
    sessionId: string;
    actionType: string;
    targetId: string | null;
    createdAt: string;
    details: string;
}

export interface TelemetryBatchDto {
    events: TelemetryEventDto[];
}

// в”Ђв”Ђ РњРµС‚Р°-РґР°РЅРЅС‹Рµ РєР»Р°СЃС‚РµСЂР° (РґР»СЏ 3D-СЃС†РµРЅ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface ClusterMeta {
    label: string;
    icon: string;
    color: number;
    colorHex: string;
    crystalEmoji: string;
    position: { x: number; y: number; z: number };
}

// в”Ђв”Ђ Р“Р»РѕР±Р°Р»СЊРЅС‹Рµ window-РѕР±СЉРµРєС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

declare global {
    interface Window {
        THREE: typeof import('three');
        __threeScene: import('three').Scene | null;
        _spa: {
            newGame: () => void;
            continueGame: () => void;
            openSettings: () => void;
            goBack: () => void;
            goto: (screen: ScreenId) => void;
            pause: () => void;
            toggleGuide: () => void;
        };
        _charCreation: {
            nextFromName: () => void;
            backToName: () => void;
            selectShipColor: (btn: HTMLElement) => void;
            submit: () => void;
        };
        _onboarding: {
            nextStep: () => void;
            prevStep: () => void;
            skip: () => void;
        };
        _galaxyMap: {
            backToOverview: () => void;
            resetCamera: () => void;
            flyToRegion: () => void;
            openPlanet: (planetId: string) => void;
        };
        _planetDetail: {
            startMiniGame: () => void;
            unlockPlanet: (planetId: string) => void;
        };
        _miniGame: {
            pause: () => void;
            returnToPlanet: () => void;
            retry: () => void;
        };
        _shipUpgrade: {
            buyUpgrade: (upgradeId: string) => void;
        };
        _vocationConst: {
            exportPdf: () => void;
            showPath: () => void;
        };
        _achievements: {
            exportStats: () => void;
        };
        _settings: {
            update: (key: string, value: string | number) => void;
            saveAndApply: () => void;
        };
        _guide: {
            askHint: (id: string) => void;
        };
        _flightScreen: {
            restart: () => void;
        };
    }
}

export {};


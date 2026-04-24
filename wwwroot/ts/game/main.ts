/**
 * main.ts — Точка входа SPA Stellar Vocation
 *
 * Порядок инициализации:
 *  1. Читаем bootstrap-данные из <script id="game-init-data">
 *  2. Инициализируем Three.js сцену
 *  3. Загружаем сохранение из localStorage (если есть)
 *  4. Регистрируем все модули экранов
 *  5. Переходим на стартовый экран
 */

import {
    Screen,
    ScreenId,
    transition,
    dispatch,
    loadSavedPlayer,
    registerScreen,
    getStore,
    on,
    loadSavedSettings,
} from './stateManager.js';

import { initThreeScene } from './threeScene.js';
import { initGuide }      from './guideManager.js';
import { initHud }        from './hudManager.js';
import { telemetry }      from './telemetryCollector.js';
import { initQuality, QualityLevel } from './qualityPresets.js';
import { ClusterDto, PlanetDto, GameSettingsDto } from './types.js';
import { initAudio, playSfx } from './audioManager.js';
import { init as initInputManager } from './inputManager.js';

// ── Модули экранов ───────────────────────────────────────────────────────────
import * as MainMenu      from './screens/screenMainMenu.js';
import * as CharCreation  from './screens/screenCharCreation.js';
import * as Onboarding    from './screens/screenOnboarding.js';
import * as Flight        from './screens/screenFlight.js';
import * as GalaxyMap     from './screens/screenGalaxyMap.js';
import * as PlanetDetail  from './screens/screenPlanetDetail.js';
import * as MiniGame      from './screens/screenMiniGame.js';
import * as ShipUpgrade   from './screens/screenShipUpgrade.js';
import * as VocationConst from './screens/screenVocationConstellation.js';
import * as Achievements  from './screens/screenAchievements.js';
import * as Settings      from './screens/screenSettings.js';
import * as OfflineError  from './screens/screenOfflineError.js';

// ─────────────────────────────────────────────────────────────────────────────

(async function boot(): Promise<void> {
    // 0. Настройка Fullscreen тумблера
    const btnFullscreen = document.getElementById('btn-fullscreen-toggle');
    const gameRoot = document.getElementById('game-root');
    const syncFullscreenClass = (): void => {
        document.body.classList.toggle('game-fullscreen', !!document.fullscreenElement);
    };
    syncFullscreenClass();
    if (btnFullscreen && gameRoot) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                (gameRoot as HTMLElement).requestFullscreen().catch(err => {
                    console.warn(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            syncFullscreenClass();
            const iconSvg = document.fullscreenElement
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-fullscreen-exit" viewBox="0 0 16 16">
                    <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10.5 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/>
                   </svg>
                   Оконный режим`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrows-fullscreen" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707m4.344 0a.5.5 0 0 1 .707 0l4.096 4.096V11.5a.5.5 0 1 1 1 0v3.975a.5.5 0 0 1-.5.5H11.5a.5.5 0 0 1 0-1h2.768l-4.096-4.096a.5.5 0 0 1 0-.707m0-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707m-4.344 0a.5.5 0 0 1-.707 0L1.025 1.732V4.5a.5.5 0 0 1-1 0V.525a.5.5 0 0 1 .5-.5H4.5a.5.5 0 0 1 0 1H1.732l4.096 4.096a.5.5 0 0 1 0 .707"/>
                   </svg>
                   На весь экран`;

            if (btnFullscreen) btnFullscreen.innerHTML = iconSvg;

            // Заставляем 3d-сцену перерисоваться после изменения размера контейнера
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        });
    }

    // 1. Bootstrap-данные от сервера и статические данные
    const initData = _readInitData();
    let upgradesData: unknown[] = [];
    try {
        const resp = await fetch('/data/upgrades.json');
        if (resp.ok) upgradesData = await resp.json();
    } catch (e) {
        console.warn('[main] Failed to load upgrades.json', e);
    }

    if (initData) {
        dispatch('SET_SESSION', {
            clusters: initData.clusters ?? [],
            catalog:  initData.catalog  ?? [],
            upgrades: upgradesData,
        } as Parameters<typeof dispatch<'SET_SESSION'>>[1]);
        dispatch('SET_SETTINGS', (initData.defaultSettings ?? {}) as Parameters<typeof dispatch<'SET_SETTINGS'>>[1]);
    }

    // Загружаем настройки из localStorage перед инициализацией подсистем
    loadSavedSettings();

    // 2. Инициализация качества графики ДО создания рендерера
    const savedQuality = (getStore().settings?.graphicsQuality ?? 'medium') as QualityLevel;
    initQuality(savedQuality);

    // 2.5. Инициализация менеджера ввода
    initInputManager();

    // 3. Three.js сцена (canvas всегда в DOM)
    try {
        await initThreeScene('game-canvas');
    } catch (e) {
        console.warn('[main] Three.js init failed, continuing without 3D:', e);
    }

    // 4. Глобальные оверлеи: HUD + Guide (независимо от экранов)
    await Promise.allSettled([
        initHud(),
        initGuide(),
    ]);

    // 5. Телеметрия
    telemetry.startSession();
    // Трекинг переходов между экранами
    on('SCREEN_CHANGED', (_s, { screenId, previousScreen }) => {
        telemetry.track('SCREEN_CHANGED', { from: previousScreen, to: screenId });
    });
    on('EARN_CRYSTALS', (_s, { earned }) => {
        telemetry.track('CRYSTALS_EARNED', earned as Record<string, number>);
    });

    // 6. Регистрируем модули экранов
    registerScreen(Screen.MAIN_MENU,      MainMenu);
    registerScreen(Screen.CHAR_CREATION,  CharCreation);
    registerScreen(Screen.ONBOARDING,     Onboarding);
    registerScreen(Screen.FLIGHT,         Flight);
    registerScreen(Screen.GALAXY_MAP,     GalaxyMap);
    registerScreen(Screen.PLANET_DETAIL,  PlanetDetail);
    registerScreen(Screen.MINIGAME,       MiniGame);
    registerScreen(Screen.SHIP_UPGRADE,   ShipUpgrade);
    registerScreen(Screen.VOCATION_CONST, VocationConst);
    registerScreen(Screen.ACHIEVEMENTS,   Achievements);
    registerScreen(Screen.SETTINGS,       Settings);
    registerScreen(Screen.OFFLINE_ERROR,  OfflineError);

    // 7. Восстанавливаем сохранение
    loadSavedPlayer();

    // 8. Определяем стартовый экран
    const hashScreen = _screenFromHash(location.hash);
    const startScreen: ScreenId = hashScreen ?? Screen.MAIN_MENU;

    await transition(startScreen);

    // 9. Аудио (Lazy init)
    document.addEventListener('pointerdown', () => {
        initAudio();
    }, { once: true, passive: true });
    document.addEventListener('keydown', () => {
        initAudio();
    }, { once: true, passive: true });
})();

// ── Глобальный обработчик кликов для SPA-навигации ───────────────────────────
document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-spa]') as HTMLElement;
    if (!btn) return;
    const action = btn.dataset.spa;

    playSfx('ui_click');

    if (action === 'goto') {
        const target = btn.dataset.screen as ScreenId;
        if (target) transition(target);
    } else if (action === 'goBack') {
        import('./stateManager.js').then(m => m.goBack());
    } else if (action === 'toggleGuide') {
        const panel = document.getElementById('guide-panel');
        panel?.classList.toggle('hidden');
    } else if (action === 'pause') {
        transition(Screen.PAUSE ?? Screen.SETTINGS);
    } else if (action === 'newGame') {
        transition(Screen.CHAR_CREATION);
    } else if (action === 'continueGame') {
        transition(Screen.GALAXY_MAP);
    }
});

// ── Хелперы ──────────────────────────────────────────────────────────────────

interface InitData {
    clusters?: ClusterDto[];
    catalog?: PlanetDto[];
    defaultSettings?: GameSettingsDto;
}

function _readInitData(): InitData | null {
    try {
        const el = document.getElementById('game-init-data');
        if (!el) return null;
        return JSON.parse(el.textContent!) as InitData;
    } catch {
        return null;
    }
}

function _screenFromHash(hash: string): ScreenId | null {
    if (!hash || hash.length < 2) return null;
    const id = hash.slice(1) as ScreenId; // убираем #
    return (Object.values(Screen) as string[]).includes(id) ? id : null;
}

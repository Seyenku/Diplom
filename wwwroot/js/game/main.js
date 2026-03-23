/**
 * main.js — Точка входа SPA Stellar Vocation
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
    transition,
    dispatch,
    loadSavedPlayer,
    registerScreen,
    getStore,
} from './stateManager.js';

import { initThreeScene } from './threeScene.js';
import { initGuide }      from './guideManager.js';
import { initHud }        from './hudManager.js';

// ── Модули экранов ───────────────────────────────────────────────────────────
import * as MainMenu      from './screens/screenMainMenu.js';
import * as CharCreation  from './screens/screenCharCreation.js';
import * as Onboarding    from './screens/screenOnboarding.js';
import * as GalaxyMap     from './screens/screenGalaxyMap.js';
import * as NebulaScan    from './screens/screenNebulaScanning.js';
import * as PlanetDetail  from './screens/screenPlanetDetail.js';
import * as MiniGame      from './screens/screenMiniGame.js';
import * as ShipUpgrade   from './screens/screenShipUpgrade.js';
import * as VocationConst from './screens/screenVocationConstellation.js';
import * as Achievements  from './screens/screenAchievements.js';
import * as Settings      from './screens/screenSettings.js';
import * as OfflineError  from './screens/screenOfflineError.js';

// ────────────────────────────────────────────────────────────────────────────

(async function boot() {
    // 1. Bootstrap-данные от сервера
    const initData = _readInitData();
    if (initData) {
        dispatch('SET_SESSION', {
            catalog:  initData.catalog  ?? [],
            upgrades: initData.upgrades ?? [],
        });
        dispatch('SET_SETTINGS', initData.defaultSettings ?? {});
    }

    // 2. Three.js сцена (canvas всегда в DOM)
    try {
        await initThreeScene('game-canvas');
    } catch (e) {
        console.warn('[main] Three.js init failed, continuing without 3D:', e);
    }

    // 3. Глобальные оверлеи: HUD + Guide (независимо от экранов)
    await Promise.allSettled([
        initHud(),
        initGuide(),
    ]);

    // 3. Регистрируем модули экранов
    registerScreen(Screen.MAIN_MENU,      MainMenu);
    registerScreen(Screen.CHAR_CREATION,  CharCreation);
    registerScreen(Screen.ONBOARDING,     Onboarding);
    registerScreen(Screen.GALAXY_MAP,     GalaxyMap);
    registerScreen(Screen.NEBULA_SCAN,    NebulaScan);
    registerScreen(Screen.PLANET_DETAIL,  PlanetDetail);
    registerScreen(Screen.MINIGAME,       MiniGame);
    registerScreen(Screen.SHIP_UPGRADE,   ShipUpgrade);
    registerScreen(Screen.VOCATION_CONST, VocationConst);
    registerScreen(Screen.ACHIEVEMENTS,   Achievements);
    registerScreen(Screen.SETTINGS,       Settings);
    registerScreen(Screen.OFFLINE_ERROR,  OfflineError);

    // 4. Восстанавливаем сохранение
    const hasSave = loadSavedPlayer();

    // 5. Определяем стартовый экран
    //    - есть URL-хэш: пробуем перейти туда
    //    - есть сохранение: главное меню (не создание персонажа)
    //    - иначе: главное меню
    const hashScreen = _screenFromHash(location.hash);
    const startScreen = hashScreen ?? Screen.MAIN_MENU;

    await transition(startScreen);
})();

// ── Хелперы ──────────────────────────────────────────────────────────────────

function _readInitData() {
    try {
        const el = document.getElementById('game-init-data');
        if (!el) return null;
        return JSON.parse(el.textContent);
    } catch {
        return null;
    }
}

function _screenFromHash(hash) {
    if (!hash || hash.length < 2) return null;
    const id = hash.slice(1); // убираем #
    return Object.values(Screen).includes(id) ? id : null;
}

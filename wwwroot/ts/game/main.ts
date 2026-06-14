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
import { initHud }        from './hudManager.js';
import { telemetry }      from './telemetryCollector.js';
import { initQuality, QualityLevel } from './qualityPresets.js';
import { ClusterDto, PlanetDto, GameSettingsDto, LiveOpsDto } from './types.js';
import { initAudio, playSfx } from './audioManager.js';
import { init as initInputManager } from './inputManager.js';

// ── Модули экранов ───────────────────────────────────────────────────────────
// Eager-импорт только для «горячих» экранов, через которые пользователь почти
// гарантированно проходит при старте: главное меню, создание персонажа,
// онбординг, основной игровой контур (полёт/карта/планета), офлайн-фолбэк.
import * as MainMenu      from './screens/screenMainMenu.js';
import * as CharCreation  from './screens/screenCharCreation.js';
import * as Onboarding    from './screens/screenOnboarding.js';
import * as Flight        from './flight/flightScreen.js';
import * as GalaxyMap     from './galaxy/galaxyScreen.js';
import * as PlanetDetail  from './screens/screenPlanetDetail.js';
import * as OfflineError  from './screens/screenOfflineError.js';
// Остальные экраны грузим лениво через dynamic import (см. registerScreen ниже).

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

    // 0a. Системное меню (бургер с «На главную» / «Полный экран»)
    const sysMenu = document.getElementById('game-sys-menu');
    const sysToggle = document.getElementById('btn-sys-toggle');
    if (sysMenu && sysToggle) {
        const setCollapsed = (collapsed: boolean): void => {
            sysMenu.dataset.collapsed = collapsed ? 'true' : 'false';
            sysToggle.setAttribute('aria-expanded', String(!collapsed));
        };
        sysToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            setCollapsed(sysMenu.dataset.collapsed !== 'true');
        });
        document.addEventListener('click', (e) => {
            if (sysMenu.dataset.collapsed === 'true') return;
            if (!sysMenu.contains(e.target as Node)) setCollapsed(true);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sysMenu.dataset.collapsed !== 'true') setCollapsed(true);
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
            liveOps:  initData.liveOps,
        } as Parameters<typeof dispatch<'SET_SESSION'>>[1]);
        dispatch('SET_SETTINGS', (initData.defaultSettings ?? {}) as Parameters<typeof dispatch<'SET_SETTINGS'>>[1]);
    }

    // Загружаем настройки из localStorage перед инициализацией подсистем
    const hadSavedSettings = loadSavedSettings();

    // 2. Инициализация качества графики ДО создания рендерера.
    // Если у пользователя нет сохранённых настроек, выбираем рекомендованный
    // профиль по характеристикам устройства (mobile → low, weak desktop → medium).
    const { recommendedQuality } = await import('./deviceProfile.js');
    const savedQuality = hadSavedSettings
        ? (getStore().settings?.graphicsQuality as QualityLevel | undefined)
        : undefined;
    const initialQuality: QualityLevel = savedQuality ?? recommendedQuality();
    initQuality(initialQuality);
    if (!savedQuality) {
        dispatch('SET_SETTINGS', { graphicsQuality: initialQuality } as Parameters<typeof dispatch<'SET_SETTINGS'>>[1]);
    }

    // 2.5. Инициализация менеджера ввода
    initInputManager();

    // 3. Three.js сцена (canvas всегда в DOM)
    try {
        await initThreeScene('game-canvas');
    } catch (e) {
        console.error('[main] WebGL недоступен:', e);
        _showWebGLUnsupportedError(e);
        return;
    }

    // 4. Глобальный HUD-оверлей (независимо от экранов)
    await Promise.allSettled([
        initHud(),
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
    registerScreen(Screen.OFFLINE_ERROR,  OfflineError);
    // Lazy: грузятся при первом переходе, дальше — из кеша. Каждый — отдельный
    // chunk у бандлера / отдельный fetch у браузера без бандлера.
    registerScreen(Screen.MINIGAME_MEDICINE,    () => import('./screens/screenMiniGameMedicine.js'));
    registerScreen(Screen.MINIGAME_PROGRAMMING, () => import('./screens/screenMiniGameProgramming.js'));
    registerScreen(Screen.MINIGAME_GEOLOGY,     () => import('./screens/screenMiniGameGeology.js'));
    registerScreen(Screen.SHIP_UPGRADE,         () => import('./screens/screenShipUpgrade.js'));
    registerScreen(Screen.VOCATION_CONST,       () => import('./screens/screenVocationConstellation.js'));
    registerScreen(Screen.ACHIEVEMENTS,         () => import('./screens/screenAchievements.js'));
    registerScreen(Screen.SETTINGS,             () => import('./screens/screenSettings.js'));

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
    } else if (action === 'newGame') {
        transition(Screen.CHAR_CREATION);
    } else if (action === 'continueGame') {
        transition(Screen.GALAXY_MAP);
    }
});

// ── data-action / data-action-change мост ────────────────────────────────────
// Заменяет inline onclick=/onchange= обработчики в Razor (которые требуют
// 'unsafe-inline' в CSP).
//
// Конвенция:
//   data-action="ns.method"                     → window._<ns>.<method>()
//   data-arg="x"                                → передать "x" первым аргументом
//   data-pass="element|value|checked"           → ещё один аргумент из элемента
//   data-action="reload"                        → location.reload()
//
// data-action  — для click
// data-action-change — для change
function _invokeAction(el: HTMLElement, action: string): void {
    if (action === 'reload') {
        location.reload();
        return;
    }
    const dot = action.indexOf('.');
    if (dot < 0) return;
    const ns = action.slice(0, dot);
    const method = action.slice(dot + 1);
    const obj = (window as unknown as Record<string, Record<string, unknown> | undefined>)[`_${ns}`];
    const fn = obj?.[method];
    if (typeof fn !== 'function') return;

    const args: unknown[] = [];
    if (el.dataset.arg !== undefined) args.push(el.dataset.arg);
    const pass = el.dataset.pass;
    if (pass === 'element') args.push(el);
    else if (pass === 'value') args.push((el as HTMLInputElement | HTMLSelectElement).value);
    else if (pass === 'checked') args.push((el as HTMLInputElement).checked);

    (fn as (...a: unknown[]) => void).apply(obj, args);
}

document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el) return;
    _invokeAction(el, el.dataset.action!);
});

document.addEventListener('change', (e) => {
    const el = (e.target as HTMLElement).closest('[data-action-change]') as HTMLElement | null;
    if (!el) return;
    _invokeAction(el, el.dataset.actionChange!);
});

document.addEventListener('input', (e) => {
    const el = (e.target as HTMLElement).closest('[data-action-input]') as HTMLElement | null;
    if (!el) return;
    _invokeAction(el, el.dataset.actionInput!);
});

// Submit-обёртки: data-prevent-submit просто отменяет, data-confirm-submit
// показывает confirm() и отменяет при отказе. Заменяют inline onsubmit="..."
// (которые блокируются CSP без 'unsafe-inline').
document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (form.dataset.preventSubmit !== undefined) {
        e.preventDefault();
        return;
    }
    const msg = form.dataset.confirmSubmit;
    if (msg && !confirm(msg)) {
        e.preventDefault();
    }
});

// data-hide-on-error для <img>: error не bubble'ит, поэтому слушаем в capture-фазе.
document.addEventListener('error', (e) => {
    const el = e.target as HTMLElement;
    if (el && 'dataset' in el && el.dataset.hideOnError !== undefined) {
        el.style.display = 'none';
    }
}, true);

// data-clear-error="ID": очищает текст в указанном элементе при любом input
// в источнике (используется на name-input в char-creation).
document.addEventListener('input', (e) => {
    const el = (e.target as HTMLElement).closest('[data-clear-error]') as HTMLElement | null;
    if (!el) return;
    const targetId = el.dataset.clearError;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (target) target.textContent = '';
});

// ── Хелперы ──────────────────────────────────────────────────────────────────

interface InitData {
    clusters?: ClusterDto[];
    catalog?: PlanetDto[];
    defaultSettings?: GameSettingsDto;
    liveOps?: LiveOpsDto;
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

function _showWebGLUnsupportedError(err: unknown): void {
    const root = document.getElementById('game-root');
    if (!root) return;
    const detail = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:2rem;">
            <div style="max-width:560px;text-align:center;display:flex;flex-direction:column;gap:1.25rem;">
                <div style="font-size:4rem;">🛰️</div>
                <h1 class="game-title" style="font-size:1.5rem;color:#f87171;">WebGL недоступен</h1>
                <p style="color:#cbd5e1;line-height:1.7;font-size:0.95rem;">
                    Игра использует трёхмерную графику, но браузер не смог создать WebGL-контекст.
                    Чаще всего это связано с настройками браузера или драйвером видеокарты.
                </p>
                <div style="background:rgba(5,10,26,0.6);border:1px solid #334155;border-radius:8px;padding:1rem;text-align:left;font-size:0.85rem;line-height:1.8;color:#cbd5e1;">
                    <strong style="display:block;margin-bottom:0.5rem;color:#94a3b8;letter-spacing:0.08em;font-size:0.75rem;">ЧТО ПРОВЕРИТЬ:</strong>
                    <ol style="padding-left:1.25rem;margin:0;display:flex;flex-direction:column;gap:0.25rem;">
                        <li>Включи аппаратное ускорение в браузере (Настройки → Производительность).</li>
                        <li>Обнови драйвер видеокарты до актуальной версии.</li>
                        <li>В Firefox открой <code>about:support</code> и проверь раздел «Графика» — WebGL должен быть Hardware accelerated.</li>
                        <li>Попробуй другой браузер (Chrome / Edge).</li>
                    </ol>
                </div>
                <details style="text-align:left;">
                    <summary style="cursor:pointer;color:#94a3b8;font-size:0.8rem;">Технические детали</summary>
                    <pre style="background:rgba(5,10,26,0.8);border:1px solid #334155;border-radius:6px;padding:0.75rem;font-size:0.75rem;color:#94a3b8;overflow:auto;max-height:120px;margin-top:0.5rem;">${detail}</pre>
                </details>
                <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
                    <button class="btn-game btn-primary" onclick="location.reload()">↻ Перезагрузить</button>
                    <a class="btn-game btn-secondary" href="/">🏠 На главную</a>
                </div>
            </div>
        </div>
    `;
}

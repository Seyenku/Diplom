/**
 * Заглушки screen-модулей для экранов без специфической JS-логики.
 * Экспортируют пустые init/destroy следуя контракту ScreenModule.
 */

// ─── MiniGame ────────────────────────────────────────────────────────────────
// screenMiniGame.js
export async function init(store) {
    window._miniGame = {
        pause() { /* TODO: pause loop */ },
        returnToPlanet() { window._spa?.goBack(); },
        retry()  { location.reload(); }
    };
    // Инициализация canvas мини-игры — будет реализована в отдельном модуле
}
export function destroy() { delete window._miniGame; }

/**
 * skeletonLoader.ts — Скелетон-плейсхолдеры при загрузке Partial-экранов
 *
 * Используется в stateManager.transition() для показа анимированного лоадера
 * в контейнере экрана пока грузится HTML через fetch.
 */

const SKELETON_HTML = `
<div class="skeleton-shimmer" style="
    padding:2rem;
    display:flex;
    flex-direction:column;
    gap:1.5rem;
    width:100%;
    height:100%;
    box-sizing:border-box;
    justify-content:center;
    align-items:center;
">
    <div style="width:min(500px,90%);display:flex;flex-direction:column;gap:1.25rem;">
        <div style="display:flex;align-items:center;gap:1rem;">
            <div class="skeleton-circle"></div>
            <div style="flex:1;">
                <div class="skeleton-line" style="width:60%;"></div>
                <div class="skeleton-line" style="width:40%;"></div>
            </div>
        </div>
        <div class="skeleton-line" style="width:90%;"></div>
        <div class="skeleton-line" style="width:75%;"></div>
        <div class="skeleton-line" style="width:80%;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="skeleton-shimmer" style="height:80px;"></div>
            <div class="skeleton-shimmer" style="height:80px;"></div>
        </div>
    </div>
</div>
`;

/**
 * Показывает skeleton-placeholder внутри контейнера
 * @param container — id или элемент
 */
export function showSkeleton(container: string | HTMLElement): void {
    const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
    if (!el) return;
    el.innerHTML = SKELETON_HTML;
}

/**
 * Скрывает skeleton (обычно не нужно — transition заменит innerHTML)
 */
export function hideSkeleton(container: string | HTMLElement): void {
    const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
    if (!el) return;
    const shimmer = el.querySelector('.skeleton-shimmer');
    if (shimmer) shimmer.remove();
}

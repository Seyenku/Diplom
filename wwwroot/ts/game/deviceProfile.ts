/**
 * deviceProfile.ts — Детекция возможностей устройства.
 *
 * Используется для:
 *  - Авто-выбора качества графики (qualityPresets)
 *  - Pixel-ratio cap в рендерерах
 *  - Адаптивных tooltip'ов для тач-устройств
 *  - Frame-rate throttling на слабых GPU
 *
 * Profile вычисляется один раз при загрузке; orientation/viewport-size
 * можно перечитать через refreshOrientation().
 */

export interface DeviceProfile {
    /** Мобильное устройство (телефон или маленький планшет) */
    isMobile: boolean;
    /** Есть тач-ввод (включая ноуты с тачскрином) */
    isTouch: boolean;
    /** pointer: coarse (палец, не мышь) */
    isCoarse: boolean;
    /** Текущая ориентация портретная */
    isPortrait: boolean;
    /** Есть safe-area-inset-top > 0 (notch/island) */
    hasNotch: boolean;
    /** navigator.deviceMemory в ГБ или 4 если не поддерживается */
    deviceMemoryGb: number;
    /** navigator.hardwareConcurrency или 4 */
    hardwareCores: number;
    /** Сырой devicePixelRatio (не зажатый) */
    pixelRatioRaw: number;
    /** Низкая мощность: ≤4 ГБ + ≤4 ядер ИЛИ старый мобильный */
    isLowEnd: boolean;
}

let _profile: DeviceProfile | null = null;

function _hasUserAgentMobile(): boolean | null {
    const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
    return null;
}

function _isMobileUA(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
}

function _measureSafeAreaTop(): number {
    // Создаём временный элемент и читаем env(safe-area-inset-top)
    try {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);height:0;width:0;visibility:hidden;pointer-events:none;';
        document.documentElement.appendChild(probe);
        const top = probe.getBoundingClientRect().top;
        probe.remove();
        return top;
    } catch {
        return 0;
    }
}

function _detect(): DeviceProfile {
    const isCoarse  = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const isTouch   = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isPortrait = window.innerHeight > window.innerWidth;
    const width     = window.innerWidth;
    const pixelRatioRaw = window.devicePixelRatio || 1;

    // Mobile: UA Hints (точно), pointer: coarse + узкий экран, или UA-regex fallback
    let isMobile: boolean;
    const uaMobile = _hasUserAgentMobile();
    if (uaMobile !== null) {
        isMobile = uaMobile;
    } else {
        isMobile = (isCoarse && width <= 900) || (_isMobileUA() && width <= 1024);
    }

    const deviceMemoryGb = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const hardwareCores  = navigator.hardwareConcurrency ?? 4;

    const hasNotch = _measureSafeAreaTop() > 0;

    const isLowEnd =
        (isMobile && (deviceMemoryGb <= 3 || hardwareCores <= 4)) ||
        (deviceMemoryGb <= 2);

    return {
        isMobile,
        isTouch,
        isCoarse,
        isPortrait,
        hasNotch,
        deviceMemoryGb,
        hardwareCores,
        pixelRatioRaw,
        isLowEnd,
    };
}

/** Возвращает кэшированный профиль устройства. Вычисляется при первом вызове. */
export function getDevice(): Readonly<DeviceProfile> {
    if (!_profile) _profile = _detect();
    return _profile;
}

/** Принудительный пересчёт (например, при повороте устройства). */
export function refreshDevice(): Readonly<DeviceProfile> {
    _profile = _detect();
    return _profile;
}

/** Рекомендованный профиль качества графики для текущего устройства. */
export function recommendedQuality(): 'low' | 'medium' | 'high' {
    const d = getDevice();
    if (d.isLowEnd) return 'low';
    if (d.isMobile) return 'low';   // даже на новых мобильных — экономнее
    if (d.deviceMemoryGb <= 4 || d.hardwareCores <= 4) return 'medium';
    return 'high';
}

// Авто-обновление при повороте экрана
if (typeof window !== 'undefined') {
    window.addEventListener('orientationchange', () => { refreshDevice(); });
    window.addEventListener('resize', () => {
        if (_profile) {
            _profile.isPortrait = window.innerHeight > window.innerWidth;
        }
    });
}

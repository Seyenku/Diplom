# Аудит производительности KosmosCore

**Дата:** 2026-06-02
**Скоуп:** SPA-игра Stellar Vocation (TypeScript + Three.js клиент) + ASP.NET Razor Pages бэкенд + SQL Server через Dapper.
**Методология:** статический анализ исходных файлов, чтение горячих путей (game loops, render pipeline, DI, репозитории, статическая раздача). Профилировщик не запускался — все выводы основаны на чтении кода. Цифры (FPS, размеры, RT) — оценки, не измерения.

---

## Сводка по серьёзности

| Уровень | Кол-во | Что значит |
|---------|--------|------------|
| 🔴 **CRITICAL** | 7 | Заметно влияют на FPS / TTI / стоимость хостинга / могут вызывать видимые лаги. Чинить в первую очередь. |
| 🟠 **HIGH** | 11 | Деградация на слабых устройствах, лишний трафик, спайки GC. |
| 🟡 **MEDIUM** | 13 | Code smell с реальной, но небольшой ценой. Накапливаются. |
| 🟢 **LOW** | 8 | Мелочи / готовность к росту проекта. |
| 🛡 **SECURITY** | 4 | Не про скорость, но всплыли по пути — стоит знать. |

Полный список — ниже по разделам.

---

## 🔴 CRITICAL

### C-1. Игра не бандлится: 47+ ESM-модулей загружаются по одному

**Файлы:** [tsconfig.json](tsconfig.json), [Pages/Game.cshtml:101](Pages/Game.cshtml:101), [wwwroot/ts/game/main.ts:33-46](wwwroot/ts/game/main.ts:33).

**Что:** `tsc` компилирует каждый `.ts` в отдельный `.js` (`outDir: "./wwwroot/js/game"`). В [main.ts](wwwroot/ts/game/main.ts) на верхнем уровне eager-импорт **всех 14 экранных модулей** + ядро. Каждый модуль тянет свои зависимости (Three, утилиты, типы). В сумме браузер на холодном старте `/game` фетчит несколько десятков мелких файлов.

**Импакт:** TTI и FCP страдают, особенно на мобильной 4G. Каждый модуль — отдельный HTTP запрос (даже на HTTP/2 это RTT × N для resolve dependency graph). Скорее всего реальная цифра — 60–120 запросов на /game с холодным кэшем.

**Что сделать:**
1. Бандлер: esbuild (быстрый, ничего не настраивает) или Vite. `npm i -D esbuild` + `esbuild wwwroot/ts/game/main.ts --bundle --format=esm --outfile=wwwroot/js/game/main.bundle.js --minify --splitting --external:three`.
2. Three.js оставить как `external` и подгружать через importmap (как сейчас), либо включить в бандл (вырастет, но без CDN-зависимости).
3. Включить code-splitting: dynamic `import()` для редко используемых экранов (Settings, Achievements, ShipUpgrade) — они не нужны при старте.
4. `screenMiniGameMedicine/Programming/Geology` тоже выносить в dynamic chunks — три тяжёлых 3D-катсцены, которые используются по очереди.

**Ожидаемый эффект:** TTI -50–70%, особенно мобильные. Параллельно убирает зависимость от внешнего CDN (см. C-2).

---

### C-2. Three.js тянется из jsdelivr на каждый заход

**Файлы:** [Pages/Game.cshtml:11-18](Pages/Game.cshtml:11), [_Layout.cshtml:16](Pages/Shared/_Layout.cshtml:16) (CSP включает jsdelivr).

**Что:** importmap указывает на `https://cdn.jsdelivr.net/npm/three@0.183.2/...`. В Game.cshtml нет `preconnect` к jsdelivr (только к Google Fonts). При первом заходе пользователь делает DNS + TLS на jsdelivr **синхронно перед запуском игры** — main.js ждёт импорта `three`.

**Импакт:**
- ~200–400 ms на холодный DNS+TLS до jsdelivr (зависит от сети).
- Точка отказа: CDN недоступен → игра не запускается, причём не отдаст внятную ошибку (`_showWebGLUnsupportedError` ловит только WebGL, не network).
- Нет SRI (Subresource Integrity) — теоретически CDN может вернуть скомпрометированный код.

**Что сделать:**
- Идеал: `npm i three@0.183.2` и бандлить локально (см. C-1). Раздавать с того же домена → автоматический HTTP/2 multiplexing, общий TLS, нет третьей стороны.
- Минимум: `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />` в `<head>`.
- Кэширование: jsdelivr ставит длинные max-age, но `app.MapStaticAssets()` своего проекта даёт **гарантированный** SWR-кэш.

---

### C-3. `particleEffects` плодит requestAnimationFrame на каждую частицу

**Файл:** [wwwroot/ts/game/systems/particleEffects.ts:89-104](wwwroot/ts/game/systems/particleEffects.ts:89).

**Что:** функция `_animateParticle` запускает свой `requestAnimationFrame(tick)` на каждую частицу. `spawnHitParticles` создаёт 8 частиц → 8 параллельных raf-циклов. При нескольких ударах подряд их десятки.

Дополнительно:
- `vel.clone().multiplyScalar(dt)` — Vector3 аллокация **на каждый кадр на каждую частицу**.
- `const dt = 0.016` хардкод — не зависит от реального dt, неправильно работает при 30Hz cap или при стартерах кадров.
- `new THREE.SphereGeometry(particleSize, 4, 4)` + `MeshBasicMaterial` создаются на каждый burst, освобождаются `setTimeout`-ом → постоянная аллокация/диспоз GPU-ресурсов.

**Импакт:**
- GC давление и JS-аллокации в горячей фазе боя.
- Браузер не объединяет независимые raf — каждый сам по себе.
- При 5 ударах в секунду × 8 частиц × 0.6 сек жизнь = 24 одновременных raf-цикла одновременно.

**Что сделать:**
1. Один общий update-loop в подсистеме частиц. Все частицы хранятся в Float32Array (`positions`, `velocities`, `lives`), один `THREE.Points` (`THREE.InstancedMesh` хуже для billboard-частиц) — рендер один draw call.
2. Object-pool частиц: фикс-размер пула, кольцевая запись.
3. Геометрия/материал — singleton, переиспользуется. Создаются один раз при init подсистемы.
4. Реальный dt от родительского цикла, а не `0.016`.

Это критично: `flightCollisions` ([flightCollisions.ts:128](wwwroot/ts/game/flight/flightCollisions.ts:128)) дёргает `spawnHitParticles` на каждое попадание.

---

### C-4. `flightScreen._moveObjects` — пересоздаёт массивы и тригонометрит магнит на всех кристаллах

**Файл:** [wwwroot/ts/game/flight/flightScreen.ts:482-535](wwwroot/ts/game/flight/flightScreen.ts:482).

**Что:**
1. **`_asteroids = _asteroids.filter(...)`** — на **каждом кадре** создаётся новый массив для астероидов, кристаллов и бонусов. Три аллокации/кадр + три прохода `O(N)`.
2. **`obj.position.distanceTo(sp)`** считает `sqrt` для **каждого** кристалла, даже если он за 200 единиц от корабля.
3. `dx*dx + dy*dy + dz*dz` + `Math.sqrt` — тот же sqrt + умножение каждый кадр на каждый магнитный кристалл.
4. `sp.clone().sub(obj.position).normalize()` в блоке бонусов — клонирование Vector3 на каждый бонус каждый кадр.

**Импакт:** не критично пока на сцене 10–20 объектов. Но `_moveObjects` бежит ~60 раз/сек, и логика растёт. При 30 кристаллах + 10 бонусов это уже сотни аллокаций/сек и десятки sqrt.

**Что сделать:**
- Замена filter на in-place: пройти массив с конца, `splice(i, 1)` (или swap-pop) при удалении.
- Сравнивать `distSquared < magnetRadius * magnetRadius` **до** взятия sqrt. Если за пределами — `continue`.
- Скоростной хелпер: `const dx = sp.x - obj.position.x; ...` без Vector3 clone'ов. Уже почти так делается для кристаллов; для бонусов переписать аналогично.

```ts
// Сейчас (бонусы):
const dist = obj.position.distanceTo(sp);
if (dist < magnetRadius && dist > 0.1) {
    const pull = (1 - dist / magnetRadius) * 10 * dt;
    const dir = sp.clone().sub(obj.position).normalize();
    obj.position.add(dir.multiplyScalar(pull));
}

// Должно быть:
const dx = sp.x - obj.position.x;
const dy = sp.y - obj.position.y;
const dz = sp.z - obj.position.z;
const distSq = dx*dx + dy*dy + dz*dz;
const magnetSq = magnetRadius * magnetRadius;
if (distSq < magnetSq && distSq > 0.01) {
    const dist = Math.sqrt(distSq);
    const pull = (1 - dist / magnetRadius) * 10 * dt / dist;
    obj.position.x += dx * pull;
    obj.position.y += dy * pull;
    obj.position.z += dz * pull;
}
```

---

### C-5. `galaxyNebulae.updateNebulae` — тяжёлый pass на каждый кадр, без LOD

**Файл:** [wwwroot/ts/game/galaxy/galaxyNebulae.ts:307-390](wwwroot/ts/game/galaxy/galaxyNebulae.ts:307).

**Что:** на каждом кадре галактической карты:
- `Object.values(state.meshes)` — аллокация массива.
- Для каждой туманности (3 штуки) — итерация по детям (4–5 объектов).
- Для шейдерного ядра — `Math.sin(time * pulseSpeed)`, `Math.sin(time * 1.5)`, lerp текущих значений, set uniforms, set scale.
- Для нэбула-облака — lerp opacity.
- Sparks — `rotation.y += 0.003` (framerate-dependent, см. M-3).

Плюс на оверхеаде сидит `EffectComposer` с `UnrealBloomPass` (см. [galaxyRenderer.ts:48-52](wwwroot/ts/game/galaxy/galaxyRenderer.ts:48)) — bloom это два отдельных gauss-pass'а в half-resolution.

**Импакт:** на medium/high профиле — fillrate-bound на мобилках. Туманности, находящиеся за камерой при focused state, всё равно обновляются. Bloom рисует всё в offscreen и блюрит.

**Что сделать:**
- Skip update для туманностей в `targetOpacityMultiplier ≈ 0` (когда `cameraState !== 'overview' && cluster !== focused`). Сейчас всё равно лерпит к 0, но при достижении 0.01 можно полностью пропускать.
- Кешировать `Object.values(state.meshes)` в массив один раз при `buildNebulae`.
- Frustum-cull (`THREE.Frustum.intersectsObject`) для туманностей в focused state, когда камера зашла в одну.
- Сделать bloom отключаемым по умолчанию на низком профиле (сейчас `useBloom` берётся из settings, см. [galaxyScreen.ts:295](wwwroot/ts/game/galaxy/galaxyScreen.ts:295)). Профиль `low` не задаёт `useBloom: false` явно.

---

### C-6. `ResponseCompression` без MIME types — JS и CSS летят несжатыми

**Файл:** [Program.cs:54-58](Program.cs:54).

**Что:**
```cs
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});
```
По умолчанию `ResponseCompression` сжимает только `text/plain`, `text/css`, `text/html`, `application/xml`, `text/xml`, `application/json`, `text/json`. **Не входят:** `application/javascript`, `text/javascript`, `image/svg+xml`, `application/wasm`, `application/font-woff*`.

При том что у проекта **47+ JS-файлов** (см. C-1), это значит они летят сырыми. Three.js (~600KB raw) — тоже не сжат на ответе.

**Импакт:** на /game трафик может вырасти в 2–4 раза по сравнению с gzip/brotli. Особенно болезненно на мобильном тарификации.

**Что сделать:**
```cs
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/javascript",
        "text/javascript",
        "image/svg+xml",
        "application/wasm",
        "application/font-woff",
        "application/font-woff2",
    });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.SmallestSize);
```

Ещё лучше — статическое pre-compression: после `tsc`/бандлинга прогонять `.js`/`.css` через brotli и складывать `.br` файлы рядом; `MapStaticAssets()` сам подхватит. Тогда CPU сервера на сжатие не тратится.

---

### C-7. Mock-камера / `recreateRenderer` при смене качества пересоздаёт WebGL контекст

**Файл:** [wwwroot/ts/game/threeScene.ts:79-105](wwwroot/ts/game/threeScene.ts:79).

**Что:** при изменении настройки качества (`onQualityChange` → `recreateRenderer()`):
1. Отменяется raf.
2. Текущая сцена диспозится.
3. `_renderer.dispose()` — освобождает WebGL контекст.
4. `new THREE.WebGLRenderer(...)` — **создаётся новый контекст**.
5. Сцена ребилдится через builder.

**Импакт:** при переключении preset'ов user видит чёрный экран на 200–500 мс, потеря всех загруженных текстур, перезагрузка корабля/планет.

**Что сделать:**
- Большинство параметров качества можно применять без пересоздания рендерера:
  - `pixelRatio` → `renderer.setPixelRatio(profile.pixelRatio)` (без dispose).
  - `antialias` — увы, требует пересоздания (это аргумент конструктора WebGLRenderer). Но это редко меняется в рантайме.
- Если меняется только `pixelRatio` или количество частиц / звёзд — не дёргать `recreateRenderer`.
- Введён бы флаг `requiresRebuild` в `setQuality` или сравнение профилей, и только при изменении critical-полей (antialias) делать полную перестройку.

---

## 🟠 HIGH

### H-1. `requestAnimationFrame` без cancel при компилируемом dispose в нескольких местах

**Файлы:** [threeScene.ts:152-163](wwwroot/ts/game/threeScene.ts:152), [flightScreen.ts:_gameLoop](wwwroot/ts/game/flight/flightScreen.ts:319), [galaxyScreen.ts:_mapRenderLoop](wwwroot/ts/game/galaxy/galaxyScreen.ts:233).

**Что:** все три места корректно отменяют raf через `cancelAnimationFrame`, но между моментом перехода (transition() → destroy() старого экрана) и dispose может проскочить ещё один кадр старого loop'а, рисующий в **новой** сцене или дёргающий nulled-state. Защита есть (`if (_state !== ...) return`), но в `galaxyScreen` проверка только на `if (!_rendererState || !_cameraState ...) return;` — если destroy происходит мидрейм, можно рисовать в null.

**Импакт:** редкие краш-стектрейсы при быстрой навигации.

**Что сделать:** в каждом `_renderLoop` первой строкой `if (_destroyed) return;` где `_destroyed` ставится в `destroy()` ДО любых null'ов.

---

### H-2. `localStorage.setItem(player)` синхронно в дебаунсе

**Файл:** [stateManager.ts:368-374](wwwroot/ts/game/stateManager.ts:368).

**Дизайн-контекст:** прогресс игрока хранится **только в браузере** (localStorage), серверного сохранения нет и не планируется. На сервер уходит только телеметрия. Поэтому любые решения здесь должны оставаться в рамках браузера.

**Что:** `_persistPlayer` синхронно вызывает `localStorage.setItem(SAVE_KEY, JSON.stringify(_store.player))`. JSON.stringify крупного `player` (apply'd upgrades, discoveredPlanets, stats, crystals) + блокирующий I/O в localStorage может занимать 5–20 мс на медленных устройствах.

Дебаунс 300 мс есть — это смягчает. Но `beforeunload` тоже синхронно вызывает `_persistPlayer` — это блокирует выгрузку.

**Импакт:** микро-фриз при сохранении (после каждого `EARN_CRYSTALS`, `APPLY_UPGRADE` и т.д.).

**Что сделать (в браузере):**
- Дебаунс уже есть; для in-flight сохранений запускать `_persistPlayer` через `requestIdleCallback` (fallback на `setTimeout`) — пишет в idle-окне, не конкурируя с raf-циклом игры.
- Минимизировать payload: не сохранять то, что можно восстановить детерминированно. `shipStats` — это derived от `appliedUpgrades` (есть `computeShipStats`), сохранять не нужно. Аналогично можно ужать `stats`-объект (агрегаты пересчитываются).
- Подумать о partial save: при `EARN_CRYSTALS` сериализовать только `player.crystals` в отдельный ключ, не весь объект. Полный snapshot — только в `beforeunload`.
- `beforeunload` оставлять синхронным (sendBeacon бесполезен без серверного endpoint'а; асинхронное сохранение не успеет до выгрузки). Минимизация payload здесь главное.

---

### H-3. `Game.cshtml.cs.OnGetAsync` делает 3 SQL запроса последовательно

**Файл:** [Pages/Game.cshtml.cs:35-39](Pages/Game.cshtml.cs:35).

```cs
var planetList  = await _planets.GetAllAsync();
var clusterList = await _planets.GetClustersAsync();
var settings    = await _gameSettings.GetAllAsync();
```

**Что:** три await серийно. Каждый — отдельный round-trip к SQL Server.

**Импакт:** в холодную (кеш пуст) +~3 RTT, ~30–60 мс. После прогрева — обращения к `IMemoryCache`, серийность не страшна.

**Что сделать:**
```cs
var planetsTask  = _planets.GetAllAsync();
var clustersTask = _planets.GetClustersAsync();
var settingsTask = _gameSettings.GetAllAsync();
await Task.WhenAll(planetsTask, clustersTask, settingsTask);
var planetList = planetsTask.Result;
// ...
```
⚠ Параллельные запросы через один `IDbConnection` могут не сработать (Dapper требует одно соединение на запрос). Текущий DI делает `AddScoped<IDbConnection>` — **один экземпляр на запрос**. Параллельные `db.QueryAsync` через один SqlConnection упадут в "There is already an open DataReader". Решения:
- Сменить регистрацию: `AddTransient<IDbConnection>` или фабрику `Func<IDbConnection>` — каждый репозиторий создаёт своё соединение (плюс правильный `using`).
- Или оставить серийность для разных репозиториев и параллелить только independent внутри одного.

---

### H-4. `OnGetAsync` считает `PlanetCount` через `planetList.Count(... lambda)` для каждого кластера

**Файл:** [Pages/Game.cshtml.cs:50](Pages/Game.cshtml.cs:50).

**Что:**
```cs
Clusters = clusterList.Select(c => new ClusterDto
{
    // ...
    PlanetCount = planetList.Count(p => p.ClusterId == c.Id)
}).ToList()
```
Для каждого кластера — полный проход по `planetList`. Это O(K × P) где K = кластеры, P = планеты. При 3 кластерах и 30 планетах ничего не значит. При 50 кластерах и 500 планетах — 25000 сравнений.

**Что сделать:**
```cs
var planetsByCluster = planetList.GroupBy(p => p.ClusterId).ToDictionary(g => g.Key, g => g.Count());
Clusters = clusterList.Select(c => new ClusterDto
{
    PlanetCount = planetsByCluster.GetValueOrDefault(c.Id, 0)
});
```

---

### H-5. `OnPostTelemetry` обрабатывает группы сессий синхронно

**Файл:** [Pages/Game.cshtml.cs:135-181](Pages/Game.cshtml.cs:135).

**Что:** `foreach (var sessionGroup in batch.Events.GroupBy(...))` — серийно для каждой группы вызывает `EnsureSessionExistsAsync`, `InsertActionLogsAsync`, `UpdateSessionEndAsync`. При batch'е из 200 событий по 5 сессиям — 15 DB round-trips сверху + Cliente ждёт всё это.

Кроме того, телеметрия — write-heavy, append-only. Идеал — fire-and-forget с очередью.

**Что сделать:**
- Введите `Channel<TelemetryBatchDto>` и `BackgroundService`, который читает из канала и пишет в БД. Endpoint просто кладёт в канал и возвращает 202 Accepted мгновенно.
- Альтернатива: SqlBulkCopy для `ActionLog` (если репо ещё не делает batch insert) — несколько тысяч строк в одной транзакции.

---

### H-6. `PlanetRepository.GetByIdAsync` через `GetAllAsync().FirstOrDefault`

**Файл:** [Data/Repositories/Implementations/PlanetRepository.cs:71-75](Data/Repositories/Implementations/PlanetRepository.cs:71).

**Что:**
```cs
public async Task<Planet?> GetByIdAsync(int id, CancellationToken ct = default)
{
    var all = await GetAllAsync(ct);
    return all.FirstOrDefault(p => p.Id == id);
}
```

Идея понятна: кеш `GetAllAsync` сэкономит SQL для прогретого запроса. Но при холодном кеше выполняется **всё JSON-агрегирование skills/risks для всех планет** ради одной. SQL в `GetAllAsync` — это коррелированные подзапросы со `STRING_AGG` и `STRING_ESCAPE` (см. строки 24-54 файла).

**Что сделать:** добавить отдельный SQL для одной планеты:
```sql
SELECT ..., (SELECT '[' + STRING_AGG(...)) AS HardSkills, ...
FROM dbo.Planets p
LEFT JOIN dbo.Clusters c ON p.ClusterId = c.Id
WHERE p.Id = @Id
```
И, если кеш прогрет — брать из него. Если нет — узкий запрос.

---

### H-7. CSP разрешает `unsafe-inline` для скриптов

**Файл:** [Pages/Shared/_Layout.cshtml:16](Pages/Shared/_Layout.cshtml:16).

```
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net http://localhost:* https://localhost:*;
```

**Что:** `unsafe-inline` нужен из-за inline-скриптов (theme toggle, fullscreen handler в main.ts через `requestFullscreen`). Но он полностью обнуляет XSS-защиту CSP.

**Импакт:** не perf, а security. Но если xUI XSS через user-generated content (имя персонажа, etc.) — атакующий может выполнять `<script>`.

**Что сделать:**
- Вынести inline `<script>(() => { ... })()</script>` блоки в отдельные `.js` файлы.
- Использовать **nonce-based CSP**: middleware генерирует nonce, в Razor подставляет `<script nonce="@Model.CspNonce">`, CSP содержит `script-src 'self' 'nonce-...'`.
- Тогда `'unsafe-inline'` можно убрать.

---

### H-8. `IDbConnection` зарегистрирован Scoped — конкурентность ограничена

**Файл:** [Program.cs:15](Program.cs:15).

**Что:** один `SqlConnection` на весь HTTP request. Если в одном запросе несколько репозиториев делают параллельные `await`'ы — `MultipleActiveResultSets=false` (дефолт) уронит запрос. Текущий код почти не делает parallel SQL (см. H-3), но при попытке оптимизации этим — наткнёмся.

**Что сделать:**
- Регистрировать **`Func<IDbConnection>`** как фабрику Scoped:
```cs
builder.Services.AddScoped<Func<IDbConnection>>(_ => () => new SqlConnection(connectionString));
```
И в репозиториях получать новое соединение на каждый вызов через `using`.
- Либо `MultipleActiveResultSets=True;` в connection string (но это даёт overhead).
- Перевод на `Microsoft.Data.Sqlite` или PostgreSQL/Npgsql решит вопрос проще.

---

### H-9. Bootstrap CSS грузится на странице игры (но почти не используется)

**Файл:** [Pages/Game.cshtml:23](Pages/Game.cshtml:23).

**Что:** `<link rel="stylesheet" href="~/css/bootstrap.min.css" asp-append-version="true" />` подключён на /game. Я просмотрел разметку игры — она использует свои `game.css`, `flight.css`, `galaxy.css` и т.д. Bootstrap нужен только утилитарным классам в нескольких местах.

**Импакт:** Bootstrap minified ~25KB gzipped, +парсинг CSS, +лишний reflow при cascade.

**Что сделать:**
- Аудитировать использование bootstrap-классов в _Game-cshtml. Если осталось 3–4 утилиты (`d-flex`, `text-center`) — заменить кастомным CSS и убрать bootstrap из game-страницы.
- Или подключать tree-shaken Bootstrap через @use в Sass.

---

### H-10. `showNotification` пишет огромный inline CSS на каждый тост

**Файл:** [wwwroot/ts/game/stateManager.ts:441-522](wwwroot/ts/game/stateManager.ts:441).

**Что:** функция при создании каждого toast строит `style.cssText = "..."` с ~20 свойствами, plus градиенты для контейнера. Каждый тост — DOM node + ~500 байт inline стилей.

**Импакт:** небольшой, но это шаблон, который засасывает реальные CSS-правила в JS-код и портит CSP (см. H-7).

**Что сделать:** перенести стили в `wwwroot/css/game/notifications.css` с классами `.game-toast--info/.success/.warning/.error`, JS только подставляет класс и текст.

---

### H-11. Eager-импорт всех экранных модулей в `main.ts`

**Файл:** [wwwroot/ts/game/main.ts:33-46](wwwroot/ts/game/main.ts:33).

**Что:** при старте игры в память загружается код всех 14 экранов, включая 3 мини-игры (`MiniGameMed`, `MiniGameProg`, `MiniGameGeo`), которые тянут свои 3D катсцены (`medCutscene3d`, `progCutscene3d`, `geoCutscene3d`).

**Импакт:** Inline в C-1. Здесь дублирую, потому что фикс отдельный — даже **до** введения бандлера можно перевести редкие экраны на `import()`:

```ts
const screenLoaders: Record<ScreenId, () => Promise<ScreenModule>> = {
    [Screen.MAIN_MENU]: () => import('./screens/screenMainMenu.js'),
    [Screen.FLIGHT]:    () => import('./flight/flightScreen.js'),
    // ...
};

export async function transition(screenId: ScreenId, ...) {
    const mod = await screenLoaders[screenId]();
    // ...
}
```

ESM dynamic import — нативный, не требует бандлера. Каждый экран — отдельный сетевой запрос при первом открытии, но потом кэшируется.

---

## 🟡 MEDIUM

### M-1. `flightVfx._updateSpeedLines` ставит `needsUpdate = true` каждый кадр

**Файл:** [flightVfx.ts:224](wwwroot/ts/game/flight/flightVfx.ts:224).

Speed lines всегда движутся — поэтому `needsUpdate = true` корректно. Но при `throttle === 0` (ещё не разогнались) speed-lines не нужны вообще, а массив всё равно обновляется. Можно скипать body цикла при `throttle < 0.01`.

---

### M-2. `_starfieldPoints.rotation.y += 0.00015` — framerate-зависимо

**Файл:** [threeScene.ts:159](wwwroot/ts/game/threeScene.ts:159).

На 144Hz звёздное поле крутится в 2.4 раза быстрее, чем на 60Hz. Надо умножать на реальное dt.

```ts
let _lastRafTs = 0;
function render(ts: number): void {
    const dt = _lastRafTs ? (ts - _lastRafTs) / 1000 : 0.016;
    _lastRafTs = ts;
    if (_starfieldPoints) _starfieldPoints.rotation.y += 0.009 * dt; // 0.009 rad/sec = 0.00015 @ 60fps
    // ...
}
```

---

### M-3. `galaxyScreen.updatePlanets(_planetsState, 0.016)` — хардкод dt

**Файл:** [galaxyScreen.ts:264](wwwroot/ts/game/galaxy/galaxyScreen.ts:264).

Аналогично M-2. Передавать реальное dt из `_mapRenderLoop`, посчитав через `performance.now()` discount от предыдущего.

То же самое в `updateNebulae` ([galaxyNebulae.ts:314, 372, 383](wwwroot/ts/game/galaxy/galaxyNebulae.ts:314)): `group.rotation.y += 0.001`, `mesh.rotation.z += layerUd.rotSpeed`, `sparks.rotation.y += 0.003` — все framerate-зависимые.

---

### M-4. `Object.values(state.meshes)` per frame в галактических циклах

**Файлы:** [galaxyNebulae.ts:313](wwwroot/ts/game/galaxy/galaxyNebulae.ts:313), [galaxyScreen.ts:272](wwwroot/ts/game/galaxy/galaxyScreen.ts:272).

Кэшировать в массив один раз при build/init. Изменения редкие (только при cluster switch).

---

### M-5. `audioManager._audioEl.crossOrigin = 'anonymous'` для same-origin MP3

**Файл:** [audioManager.ts:44](wwwroot/ts/game/audioManager.ts:44).

`crossOrigin` нужен только для cross-origin ресурсов. Для `/audio/ambient-space-texture.mp3` (same-origin) он избыточен и заставляет браузер дополнительно делать CORS pre-flight assertion.

Поставить `_audioEl.crossOrigin = null` (или просто не присваивать).

---

### M-6. Магические fade-out таймеры через `setTimeout`

**Файлы:** [flightScreen.ts:288](wwwroot/ts/game/flight/flightScreen.ts:288), [galaxyScreen.ts:171, 255](wwwroot/ts/game/galaxy/galaxyScreen.ts:171), [stateManager.ts:518](wwwroot/ts/game/stateManager.ts:518).

`setTimeout(() => el.classList.add('hidden'), 600)` накапливает таймеры — если экран сменился раньше, таймер всё равно сработает, может тронуть удалённый или новый DOM-нод. В простых случаях безопасно, но потенциальный источник флапов.

Лучше использовать `transitionend` event с одноразовым `{ once: true }` listener.

---

### M-7. `flightUi.updateShieldBar/updateEnergyBar` устанавливают `style.background` строкой каждый раз

**Файл:** [flightUi.ts:111-117, 126-132](wwwroot/ts/game/flight/flightUi.ts:111).

```ts
bar.style.background = 'linear-gradient(90deg, #4fc3f7, #818cf8)';
```
Это перезаписывается каждое обновление HUD, даже если зона не сменилась (>60%). Браузеру приходится переразбирать строку и заново применять стиль.

**Что сделать:** добавить 3 CSS-класса `.flight-bar--healthy`, `.flight-bar--warning`, `.flight-bar--critical`, JS только тогглит классы.

---

### M-8. `_createGlowTexture` с CanvasTexture не использует `colorSpace`

**Файл:** [galaxyNebulae.ts:408-428](wwwroot/ts/game/galaxy/galaxyNebulae.ts:408).

В Three 0.183 для текстур, идущих в SRGB color пайплайн, нужно `texture.colorSpace = THREE.SRGBColorSpace`. Иначе цвета будут немного «выцветать» (это уже не perf, но визуальное качество может тратить лишний цвет на бoost).

Также: текстуры используются как `map: glowTexture` в `PointsMaterial`. Если quality `low` отключает antialias, эти glow-плашки будут жёстко пикселить. Можно поставить `texture.minFilter = THREE.LinearMipmapLinearFilter` и `texture.generateMipmaps = true` (по дефолту так).

---

### M-9. Дублирующийся builder canvas-текстуры в `galaxyScreen._focusCluster`

**Файл:** [galaxyScreen.ts:365-378](wwwroot/ts/game/galaxy/galaxyScreen.ts:365).

```ts
buildPlanetsForCluster(_planetsState, ..., (s, c, soft) => {
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(...);
    // ...
    return new THREE.CanvasTexture(canvas);
});
```

Это **точная копия** `_createGlowTexture` из galaxyNebulae. Должна быть утилита `createGlowTexture(size, color, softness)` в `threeUtils.ts`.

При фокусе на разные кластеры — текстуры пересоздаются каждый раз без кэша.

---

### M-10. SQL запросы используют `SELECT * FROM dbo.Clusters` без явных колонок

**Файл:** [PlanetRepository.cs:85](Data/Repositories/Implementations/PlanetRepository.cs:85).

`SELECT * FROM dbo.Clusters ORDER BY Id` — типичный анти-паттерн. Если кто-то добавит BLOB-колонку, мы её начнём тянуть. Заменить на явные имена:

```sql
SELECT Id, Name, DisplayName, CrystalType, Description FROM dbo.Clusters ORDER BY Id
```

---

### M-11. `Roboto Slab` грузится с Google Fonts с весами 100..900 целиком

**Файл:** [_Layout.cshtml:31](Pages/Shared/_Layout.cshtml:31).

```html
<link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@100..900&display=swap" rel="stylesheet" />
```

Variable font — это хорошо, **но** загружается полный диапазон. Если в стиле реально используются только 400/700 — взять `wght@400;700`.

Также `Tektur:wght@400..900` грузится на /game ([Game.cshtml:22](Pages/Game.cshtml:22)) — то же замечание.

---

### M-12. `wwwroot/css/bootstrap.min.css` ссылается на относительный путь без `asp-append-version` consistency check

Это nit, но bootstrap.min.css имеет два места подключения (Layout и Game.cshtml) и оба с `asp-append-version="true"`. Хорошо. Но `~/css/main.css` подключён только в Layout, а Game.cshtml его скрывает `display: none` через переопределение — то есть main.css едет в браузер бесполезно. На /game его не подгружать (например, через секцию Head или условную логику).

---

### M-13. Inline SVG в `main.ts` для fullscreen toggle

**Файл:** [main.ts:72-79](wwwroot/ts/game/main.ts:72).

Длинные SVG-строки внутри JS — раздувают main bundle. Вынести в HTML (один раз в Game.cshtml, переключать через CSS-класс) или загрузить как файлы из `/wwwroot/images/icons/`.

---

## 🟢 LOW

### L-1. Импорт `FIELD_W, FIELD_H` в `flightScreen.ts` не используется

[flightScreen.ts:21](wwwroot/ts/game/flight/flightScreen.ts:21). Не вредит, но кода больше — `import { SpawnerState, initSpawner, spawnWave, disposeSpawner } from './flightSpawner.js';` достаточно.

### L-2. Прокинутый `window._flightScreen`, `window._galaxyMap` через `any`

[flightScreen.ts:150](wwwroot/ts/game/flight/flightScreen.ts:150), [galaxyScreen.ts:48](wwwroot/ts/game/galaxy/galaxyScreen.ts:48). Для onclick-инлайнов в Razor. Безвредно, но мешает code splitting (см. C-1) и нарушает CSP.

### L-3. `recreateRenderer` не сохраняет состояние камеры

Если игрок настраивал камеру (галактика — да, у `GalaxyCamera` есть spherical state), переключение качества сбросит её.

### L-4. `_handlers.forEach(h => h(_store, payload))` в dispatch — нет защиты от модификации Set во время итерации

Если handler вызывает `off()` другого handler'а — Set мутирует. JavaScript Set допускает мутации в forEach, но порядок становится непредсказуемым.

### L-5. `getDevice` тяжёлый? Не проверял, но дёргается из горячих путей

[flightScreen.ts:308](wwwroot/ts/game/flight/flightScreen.ts:308): `if (getDevice().isLowEnd && ...)`. Каждый кадр. Если кеш не помогает — это нагрузка.

### L-6. `_lastSceneName` — string state, без типа

[threeScene.ts:19](wwwroot/ts/game/threeScene.ts:19). При опечатке в имени builder'а нет TS-предупреждения. `type SceneName = 'starfield' | 'flight' | 'galaxy-map' | ...` помог бы.

### L-7. `gltfLoader.ts`, `shipLoader.ts` не смотрел — стоит проверить

Если GLB-модели корабля грузятся без `DRACOLoader`/`MeshoptDecoder` — модели больше, чем могли бы быть. Если они мелкие (<100KB) — не критично.

### L-8. `obj/Debug/net10.0/*.cs` попали в Glob results

Не в git'е (наверное), но напоминаю: `.gitignore` должен включать `bin/`, `obj/`, `wwwroot/js/game/` (если бандлим).

---

## 🛡 SECURITY (не про перф, но всплыло)

### S-1. `[IgnoreAntiforgeryToken]` глобально на `GameModel`

[Pages/Game.cshtml.cs:20](Pages/Game.cshtml.cs:20). Отключает CSRF для **всех** POST endpoint'ов (`MiniGameResult`, `Telemetry`, теоретические будущие). Если cookie-based auth, любой сторонний сайт может POST'ить от имени пользователя.

**Что сделать:** проверять `X-Requested-With: XMLHttpRequest` header + SameSite=Strict cookies. Или генерировать `RequestVerificationToken` и передавать в fetch заголовке.

### S-2. `unsafe-inline` в CSP

См. H-7.

### S-3. CSP allowlist'ит `http://localhost:*` в продакшене

[_Layout.cshtml:16](Pages/Shared/_Layout.cshtml:16). В prod это ослабляет CSP без нужды. Делать CSP environment-зависимым в C# middleware.

### S-4. SQL injection поверхностно защищена параметризованным Dapper'ом

Я не увидел string-конкатенации в SQL — Dapper параметризует. ОК. **Но** SQL в `PlanetRepository.GetAllAsync` использует `STRING_ESCAPE(s.Name, 'json')` — корректно для JSON-сборки. Если в `Skills.Name` влезут кавычки — escape сработает. Это хорошо, обращаю внимание просто как факт.

---

## Быстрые победы (≤1 день каждая)

В порядке окупаемости:

1. **H-3 + H-4** — добавить `Task.WhenAll` + `GroupBy` в `OnGetAsync` (после миграции `IDbConnection` на фабрику). Холодные старты быстрее.
2. **C-6** — расширить MIME-типы для `ResponseCompression`. Один блок кода, эффект мгновенный.
3. **M-2 + M-3 + framerate-нормализация** — пройтись по `rotation.y += const` и умножить на dt. Однотипная правка.
4. **C-3** — пул частиц с общим update loop'ом. Самая «механическая» оптимизация, эффект ощутим в боях.
5. **C-4** — переписать `_moveObjects` на squared distance и in-place filter. Несколько часов.
6. **H-11** — перевести редкие экраны на dynamic import. Не требует бандлера. Часть main.ts чанка перетекает в lazy.

## Стратегические шаги (отдельные тикеты)

7. **C-1 + C-2** — внедрить esbuild/Vite, локально хостить Three.js. Меняет deploy pipeline.
8. **H-5** — Channel + BackgroundService для телеметрии.
9. **C-5** — LOD/cull-логика для туманностей (frustum culling из коробки в Three есть).
10. **H-7 + S-1 + S-3** — починить CSP (nonce-based), убрать `IgnoreAntiforgeryToken`, дифференцировать CSP по environment.

(H-2 — улучшение `_persistPlayer` через `requestIdleCallback` и минимизацию payload — относится к quick-win диапазону внутри стратегии локального сохранения, отдельной инфраструктуры не требует.)

## Что не аудитировано (стоит отдельной сессии)

- `shipLoader.ts` / `gltfLoader.ts` — размер моделей, использование `DRACOLoader` / mesh-optimization.
- `screenPlanetDetail.ts` + `planetTextures.ts` — текстуры планет грузятся из `/images/textures/` (jpg/png). Не проверял размеры, не уверен в кешировании.
- Три мини-игры (`screenMiniGameMedicine`, `Programming`, `Geology`) и их катсцены — 3D сцены на ~3000 строк суммарно. Аналог flight, скорее всего страдают теми же болезнями.
- `galaxyPlanets.ts` — генерация мешей планет.
- Real-world профилирование: Chrome DevTools Performance, FPS на конкретных устройствах, Lighthouse, WebPageTest.
- Memory profiling: detached DOM nodes, retained Three.js geometries, ZW heap snapshots.

Эти участки заслуживают аналогичного прохода. Текущий отчёт — карта самых жирных мест и шаблонов, которые повторяются по проекту: если починить шаблон (например, framerate-нормализация или pool-based частицы), эффект мультиплицируется.

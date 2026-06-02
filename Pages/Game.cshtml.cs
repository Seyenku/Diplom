using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Models;

namespace KosmosCore.Pages;

/// <summary>
/// PageModel для SPA-хоста игры Stellar Vocation.
///  - OnGet()                → начальный bootstrap JSON (кластеры + каталог планет)
///  - OnGetPartial()         → AJAX-подгрузка HTML экрана
///  - OnGetCatalog()         → JSON каталога планет
///  - OnPostMiniGameResult() → расчёт наград
///  - OnPostTelemetry()      → приём батча телеметрии в фоновую очередь
///
/// Прогресс игрока на сервере не сохраняется — он живёт только в браузере
/// (localStorage, см. stateManager._persistPlayer). Сервер хранит лишь телеметрию.
/// </summary>
[IgnoreAntiforgeryToken]
public class GameModel(
    IPlanetRepository planets,
    IGameSettingsRepository gameSettings,
    IMiniGameService miniGameService,
    ITelemetryQueue telemetryQueue,
    ILogger<GameModel> logger) : PageModel
{
    private readonly IPlanetRepository _planets = planets;
    private readonly IGameSettingsRepository _gameSettings = gameSettings;
    private readonly IMiniGameService _miniGameService = miniGameService;
    private readonly ITelemetryQueue _telemetryQueue = telemetryQueue;
    private readonly ILogger<GameModel> _logger = logger;

    /// <summary>JSON-строка начальных данных для клиентского bootstrapping.</summary>
    public string InitialDataJson { get; private set; } = "null";

    // ──────────────────────────────────────────────
    //  GET /game  — страница SPA + начальные данные
    // ──────────────────────────────────────────────
    public async Task OnGetAsync()
    {
        // Параллельный fan-out: 3 независимых запроса в БД, у каждого своё
        // SqlConnection (см. Func<IDbConnection>-фабрика в Program.cs).
        var planetsTask  = _planets.GetAllAsync();
        var clustersTask = _planets.GetClustersAsync();
        var settingsTask = _gameSettings.GetAllAsync();
        await Task.WhenAll(planetsTask, clustersTask, settingsTask);

        var planetList  = planetsTask.Result;
        var clusterList = clustersTask.Result;
        var settings    = settingsTask.Result;

        // Один проход по planetList вместо O(K*P) подсчётов внутри Select.
        var planetCountByCluster = planetList
            .GroupBy(p => p.ClusterId)
            .ToDictionary(g => g.Key, g => g.Count());

        var initData = new GameInitDto
        {
            Clusters        = clusterList.Select(c => new ClusterDto
            {
                Id = c.Id,
                Name = c.Name,
                DisplayName = c.DisplayName,
                CrystalType = c.CrystalType,
                Description = c.Description,
                PlanetCount = planetCountByCluster.TryGetValue(c.Id, out var n) ? n : 0
            }).ToList().AsReadOnly(),
            Catalog         = planetList.Select(MapPlanet).ToList().AsReadOnly(),
            DefaultSettings = GameSettingsDto.Default,
            LiveOps         = BuildLiveOps(settings)
        };

        InitialDataJson          = JsonSerializer.Serialize(initData, JsonOptions);
        ViewData["GameInitData"] = InitialDataJson;
    }

    private static LiveOpsDto BuildLiveOps(IReadOnlyDictionary<string, string> s)
    {
        static int ParseInt(IReadOnlyDictionary<string, string> d, string key, int fallback) =>
            d.TryGetValue(key, out var v) && int.TryParse(v, out var n) ? n : fallback;
        static float ParseFloat(IReadOnlyDictionary<string, string> d, string key, float fallback) =>
            d.TryGetValue(key, out var v) && float.TryParse(v, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : fallback;

        return new LiveOpsDto
        {
            FlightDurationS    = ParseInt(s, "flight_duration_s", 60),
            MinigameDurationS  = ParseInt(s, "minigame_duration_s", 30),
            UnlockBaseCost     = ParseInt(s, "unlock_base_cost", 5),
            CrystalFlightBonus = ParseFloat(s, "crystal_flight_bonus", 1.0f),
        };
    }

    // ──────────────────────────────────────────────
    //  GET /game?handler=Partial&screenId={id}
    // ──────────────────────────────────────────────
    public IActionResult OnGetPartial(string screenId)
    {
        var partialName = screenId switch
        {
            "main-menu"              => "_ScreenMainMenu",
            "char-creation"          => "_ScreenCharCreation",
            "onboarding"             => "_ScreenOnboarding",
            "hud"                    => "_HudOverlay",
            "pause"                  => "_ScreenPause",
            "flight"                 => "_ScreenFlight",
            "galaxy-map"             => "_ScreenGalaxyMap",
            "planet-detail"          => "_ScreenPlanetDetail",
            "minigame-medicine"       => "_ScreenMiniGameMedicine",
            "minigame-programming"    => "_ScreenMiniGameProgramming",
            "minigame-geology"         => "_ScreenMiniGameGeology",
            "ship-upgrade"           => "_ScreenShipUpgrade",
            "vocation-constellation" => "_ScreenVocationConstellation",
            "achievements"           => "_ScreenAchievements",
            "settings"               => "_ScreenSettings",
            "offline-error"          => "_ScreenOfflineError",
            _                        => null
        };

        if (partialName is null)
            return NotFound($"Unknown screenId: '{screenId}'");

        return Partial($"~/Pages/Game/{partialName}.cshtml");
    }

    // ──────────────────────────────────────────────
    //  GET /game?handler=Catalog
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnGetCatalogAsync()
    {
        var planets = await _planets.GetAllAsync();
        return new JsonResult(planets.Select(MapPlanet), JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=MiniGameResult
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostMiniGameResultAsync([FromBody] MiniGameResultDto result)
    {
        if (result is null) return BadRequest("Payload required.");
        _ = int.TryParse(result.PlanetId, out int planetId);
        var allPlanets = await _planets.GetAllAsync();
        var planetModel = allPlanets.FirstOrDefault(p => p.Id == planetId);
        var planetDto = planetModel is not null ? MapPlanet(planetModel) : null;
        var reward = _miniGameService.CalculateReward(result, planetDto);
        return new JsonResult(reward, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=Telemetry
    //  Кладём батч в фоновую очередь — клиент не ждёт DB.
    //  Реальную запись делает TelemetryWorker (BackgroundService).
    // ──────────────────────────────────────────────
    public IActionResult OnPostTelemetry([FromBody] TelemetryBatchDto? batch)
    {
        if (batch?.Events is null || batch.Events.Count == 0)
            return new JsonResult(new { ok = true, count = 0 }, JsonOptions);

        if (!_telemetryQueue.TryEnqueue(batch))
        {
            // Очередь переполнена — backpressure, клиент попробует позже.
            _logger.LogWarning("Telemetry queue full, dropping batch of {Count} events", batch.Events.Count);
            return StatusCode(503, new { ok = false, reason = "telemetry-queue-full" });
        }

        return StatusCode(202, new { ok = true, count = batch.Events.Count });
    }

    // ──────────────────────────────────────────────
    //  Маппинг DB → DTO
    // ──────────────────────────────────────────────
    private static PlanetDto MapPlanet(Planet p)
    {
        static string[] SafeJsonArray(string json)
        {
            try { return JsonSerializer.Deserialize<string[]>(json) ?? []; }
            catch { return []; }
        }

        return new PlanetDto
        {
            Id               = p.Id.ToString(),
            Name             = p.Title ?? "Unknown",
            ClusterId        = p.ClusterName ?? "none",
            ClusterName      = p.ClusterDisplayName ?? p.ClusterName ?? "none",
            CrystalType      = p.CrystalType ?? "programming",
            Description      = p.Description ?? string.Empty,
            HardSkills       = SafeJsonArray(p.HardSkills),
            SoftSkills       = SafeJsonArray(p.SoftSkills),
            Risks            = SafeJsonArray(p.Risks),
            UnlockCost       = p.UnlockCost,
            IsStarterVisible = p.UnlockCost == 0,  // если стоимость 0, значит видна сразу
            TextureKey       = p.TextureKey
        };
    }

    // ──────────────────────────────────────────────
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented        = false
    };
}

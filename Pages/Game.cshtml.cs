using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Models;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Pages;

/// <summary>
/// PageModel для SPA-хоста игры Stellar Vocation.
///  - OnGet()            → начальный bootstrap JSON (кластеры + каталог планет)
///  - OnGetPartial()     → AJAX-подгрузка HTML экрана
///  - OnGetCatalog()     → JSON каталога планет
///  - OnPostMiniGameResult() → расчёт наград
///  - OnPostSaveProgress()   → запись прогресса в game_saves
/// </summary>
[IgnoreAntiforgeryToken]
public class GameModel(IPlanetRepository planets, IMiniGameService miniGameService, ITelemetryRepository telemetry, ILogger<GameModel> logger) : PageModel
{
    private readonly IPlanetRepository _planets = planets;
    private readonly IMiniGameService _miniGameService = miniGameService;
    private readonly ITelemetryRepository _telemetry = telemetry;
    private readonly ILogger<GameModel> _logger = logger;

    /// <summary>JSON-строка начальных данных для клиентского bootstrapping.</summary>
    public string InitialDataJson { get; private set; } = "null";

    // ──────────────────────────────────────────────
    //  GET /game  — страница SPA + начальные данные
    // ──────────────────────────────────────────────
    public async Task OnGetAsync()
    {
        var planetList  = await _planets.GetAllAsync();
        var clusterList = await _planets.GetClustersAsync();

        var initData = new GameInitDto
        {
            Clusters        = clusterList.Select(c => new ClusterDto
            {
                Id = c.Id,
                Name = c.Name,
                DisplayName = c.DisplayName,
                CrystalType = c.CrystalType,
                Description = c.Description,
                PlanetCount = planetList.Count(p => p.ClusterId == c.Id)
            }).ToList().AsReadOnly(),
            Catalog         = planetList.Select(MapPlanet).ToList().AsReadOnly(),
            DefaultSettings = GameSettingsDto.Default
        };

        InitialDataJson          = JsonSerializer.Serialize(initData, JsonOptions);
        ViewData["GameInitData"] = InitialDataJson;
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
            "minigame"               => "_ScreenMiniGame",
            "minigame-medicine"       => "_ScreenMiniGameMedicine",
            "minigame-programming"    => "_ScreenMiniGameProgramming",
            "minigame-geology"         => "_ScreenMiniGameGeology",
            "ship-upgrade"           => "_ScreenShipUpgrade",
            "vocation-constellation" => "_ScreenVocationConstellation",
            "achievements"           => "_ScreenAchievements",
            "settings"               => "_ScreenSettings",
            "offline-error"          => "_ScreenOfflineError",
            "guide"                  => "_GuidePanel",
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
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostTelemetry([FromBody] TelemetryBatchDto? batch)
    {
        if (batch?.Events is null || batch.Events.Count == 0)
            return new JsonResult(new { ok = true, count = 0 }, JsonOptions);

        // Группируем события по сессиям
        foreach (var sessionGroup in batch.Events.GroupBy(e => e.SessionId))
        {
            if (!Guid.TryParse(sessionGroup.Key, out var sessionId)) continue;

            var startEvt = sessionGroup.FirstOrDefault(e => e.ActionType == "SESSION_START");
            var deviceType = "desktop";
            if (startEvt != null && !string.IsNullOrEmpty(startEvt.Details))
            {
                try {
                    using var doc = JsonDocument.Parse(startEvt.Details);
                    if (doc.RootElement.TryGetProperty("deviceType", out var dt))
                        deviceType = dt.GetString() ?? "desktop";
                } catch {}
            }
            
            var firstEventTimeStr = sessionGroup.First().CreatedAt;
            var startTime = DateTime.TryParse(firstEventTimeStr, out var st) ? st : DateTime.UtcNow;

            await _telemetry.EnsureSessionExistsAsync(sessionId, deviceType, startTime);

            var logsToInsert = sessionGroup.Select(e => new ActionLog
            {
                SessionId = sessionId,
                ActionType = e.ActionType ?? "UNKNOWN",
                TargetId = e.TargetId,
                CreatedAt = DateTime.TryParse(e.CreatedAt, out var ct) ? ct : DateTime.UtcNow,
                Details = e.Details ?? "{}"
            }).ToList();

            await _telemetry.InsertActionLogsAsync(logsToInsert);

            var endEvt = sessionGroup.FirstOrDefault(e => e.ActionType == "SESSION_END");
            if (endEvt != null)
            {
                var endTime = DateTime.TryParse(endEvt.CreatedAt, out var et) ? et : DateTime.UtcNow;
                await _telemetry.UpdateSessionEndAsync(sessionId, endTime);
            }
        }

        return new JsonResult(new { ok = true, count = batch.Events.Count }, JsonOptions);
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
            IsStarterVisible = p.UnlockCost == 0  // если стоимость 0, значит видна сразу
        };
    }

    // ──────────────────────────────────────────────
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented        = false
    };
}

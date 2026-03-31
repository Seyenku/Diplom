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
///  - OnGet()            → начальный bootstrap JSON (каталог планет + апгрейдов)
///  - OnGetPartial()     → AJAX-подгрузка HTML экрана
///  - OnGetCatalog()     → JSON каталога планет
///  - OnPostScanNebula() → серверная логика сканирования
///  - OnPostMiniGameResult() → расчёт наград
///  - OnPostSaveProgress()   → запись прогресса в game_saves
/// </summary>
[IgnoreAntiforgeryToken]
public class ProjModel(IPlanetRepository planets, IScanService scanService, IMiniGameService miniGameService, ILogger<ProjModel> logger) : PageModel
{
    private readonly IPlanetRepository _planets = planets;
    private readonly IScanService _scanService = scanService;
    private readonly IMiniGameService _miniGameService = miniGameService;
    private readonly ILogger<ProjModel> _logger = logger;

    /// <summary>JSON-строка начальных данных для клиентского bootstrapping.</summary>
    public string InitialDataJson { get; private set; } = "null";

    // ──────────────────────────────────────────────
    //  GET /game  — страница SPA + начальные данные
    // ──────────────────────────────────────────────
    public async Task OnGetAsync()
    {
        var planetList  = await _planets.GetAllAsync();

        var initData = new GameInitDto
        {
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
            "nebula-scan"            => "_ScreenNebulaScanning",
            "planet-detail"          => "_ScreenPlanetDetail",
            "minigame"               => "_ScreenMiniGame",
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
    //  POST /game?handler=ScanNebula
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostScanNebulaAsync([FromBody] ScanRequestDto request)
    {
        if (request is null) return BadRequest("Payload required.");
        var planets = await _planets.GetAllAsync();
        var dtos = planets.Select(MapPlanet).ToList();
        var result = _scanService.Resolve(request, dtos);
        return new JsonResult(result, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=MiniGameResult
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostMiniGameResultAsync([FromBody] MiniGameResultDto result)
    {
        if (result is null) return BadRequest("Payload required.");
        _ = int.TryParse(result.PlanetId, out int planetId);
        var planetModel = await _planets.GetByIdAsync(planetId);
        var planetDto = planetModel is not null ? MapPlanet(planetModel) : null;
        var reward = _miniGameService.CalculateReward(result, planetDto);
        return new JsonResult(reward, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=Telemetry
    // ──────────────────────────────────────────────
    public IActionResult OnPostTelemetry([FromBody] TelemetryBatchDto? batch)
    {
        if (batch?.Events is null || batch.Events.Count == 0)
            return new JsonResult(new { ok = true, count = 0 }, JsonOptions);

        // Логируем события (в будущем → TelemetryRepository → ActionLogs / PlayerSessions)
        foreach (var evt in batch.Events)
        {
            _logger.LogInformation("[Telemetry] {Session} | {Action} | target={Target} | {Details}",
                evt.SessionId, evt.ActionType, evt.TargetId, evt.Details);
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
            Id          = p.Id.ToString(),
            Name        = p.Title ?? "Unknown",
            Category    = p.ClusterName ?? "none",
            Description = p.Description ?? string.Empty,
            HardSkills  = SafeJsonArray(p.HardSkills),
            SoftSkills  = SafeJsonArray(p.SoftSkills),
            Risks       = SafeJsonArray(p.Risks),
            CrystalRequirements = BuildCrystalDict(p),
            IsStarterVisible    = p.ScanCost == 0 // если сканировать бесплатно, значит видна сразу
        };
    }

    private static Dictionary<string, int> BuildCrystalDict(Planet p)
    {
        var dict = new Dictionary<string, int>();
        if (p.ScanCost > 0) dict["any"] = p.ScanCost;
        return dict;
    }

    // ──────────────────────────────────────────────
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented        = false
    };
}

using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Business;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Models;
using KosmosCore.Models.ViewModels;

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
public class ProjModel : PageModel
{
    private readonly IPlanetRepository      _planets;
    private readonly IShipUpgradeRepository _upgrades;
    private readonly IGameSaveRepository    _saves;

    public ProjModel(
        IPlanetRepository      planets,
        IShipUpgradeRepository upgrades,
        IGameSaveRepository    saves)
    {
        _planets  = planets;
        _upgrades = upgrades;
        _saves    = saves;
    }

    /// <summary>JSON-строка начальных данных для клиентского bootstrapping.</summary>
    public string InitialDataJson { get; private set; } = "null";

    // ──────────────────────────────────────────────
    //  GET /game  — страница SPA + начальные данные
    // ──────────────────────────────────────────────
    public async Task OnGetAsync()
    {
        var planetList  = await _planets.GetAllAsync();
        var upgradeList = await _upgrades.GetAllAsync();

        var initData = new GameInitDto
        {
            Catalog         = planetList.Select(MapPlanet).ToList().AsReadOnly(),
            Upgrades        = upgradeList.Select(MapUpgrade).ToList().AsReadOnly(),
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
        var result = ScanService.Resolve(request, dtos);
        return new JsonResult(result, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=MiniGameResult
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostMiniGameResultAsync([FromBody] MiniGameResultDto result)
    {
        if (result is null) return BadRequest("Payload required.");
        var planetModel = await _planets.GetBySystemIdAsync(result.PlanetId);
        var planetDto = planetModel is not null ? MapPlanet(planetModel) : null;
        var reward = MiniGameService.CalculateReward(result, planetDto);
        return new JsonResult(reward, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  POST /game?handler=SaveProgress
    //  Body: { saveKey: string, playerJson: string }
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnPostSaveProgressAsync([FromBody] SaveProgressDto dto)
    {
        if (dto is null || string.IsNullOrWhiteSpace(dto.SaveKey))
            return BadRequest("saveKey required.");

        await _saves.UpsertAsync(dto.SaveKey, dto.PlayerJson ?? "{}");
        return new JsonResult(new { ok = true }, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  GET /game?handler=LoadProgress&saveKey={key}
    // ──────────────────────────────────────────────
    public async Task<IActionResult> OnGetLoadProgressAsync(string saveKey)
    {
        if (string.IsNullOrWhiteSpace(saveKey))
            return BadRequest("saveKey required.");

        var save = await _saves.GetAsync(saveKey);
        if (save is null) return new JsonResult(null);

        return new JsonResult(new { playerJson = save.PlayerJson, updatedAt = save.UpdatedAt }, JsonOptions);
    }

    // ──────────────────────────────────────────────
    //  Маппинг DB → DTO
    // ──────────────────────────────────────────────
    private static PlanetDto MapPlanet(Planet p)
    {
        string[] SafeJsonArray(string json)
        {
            try { return JsonSerializer.Deserialize<string[]>(json) ?? []; }
            catch { return []; }
        }

        return new PlanetDto
        {
            Id          = p.SystemId,
            Name        = p.Name,
            Category    = p.Category,
            Description = p.Description,
            HardSkills  = SafeJsonArray(p.HardSkills),
            SoftSkills  = SafeJsonArray(p.SoftSkills),
            Risks       = SafeJsonArray(p.Risks),
            CrystalRequirements = BuildCrystalDict(p),
            IsStarterVisible    = p.IsStarterVisible
        };
    }

    private static Dictionary<string, int> BuildCrystalDict(Planet p)
    {
        var dict = new Dictionary<string, int>();
        if (p.CrystalReqIt      > 0) dict["it"]      = p.CrystalReqIt;
        if (p.CrystalReqBio     > 0) dict["bio"]     = p.CrystalReqBio;
        if (p.CrystalReqMath    > 0) dict["math"]    = p.CrystalReqMath;
        if (p.CrystalReqEco     > 0) dict["eco"]     = p.CrystalReqEco;
        if (p.CrystalReqDesign  > 0) dict["design"]  = p.CrystalReqDesign;
        if (p.CrystalReqMed     > 0) dict["med"]     = p.CrystalReqMed;
        if (p.CrystalReqNeuro   > 0) dict["neuro"]   = p.CrystalReqNeuro;
        if (p.CrystalReqPhysics > 0) dict["physics"] = p.CrystalReqPhysics;
        return dict;
    }

    private static UpgradeDto MapUpgrade(ShipUpgrade u) => new()
    {
        Id          = u.SystemId,
        Category    = u.Category,
        Name        = u.Name,
        Description = u.Description,
        Cost        = u.Cost,
        Effect      = new
        {
            speedBonus  = u.EffectSpeedBonus,
            shieldBonus = u.EffectShieldBonus,
            scanRange   = u.EffectScanRange,
            capacity    = u.EffectCapacity
        }
    };

    // ──────────────────────────────────────────────
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented        = false
    };
}

namespace KosmosCore.Models.ViewModels;

// ────────────────────────────────────────────
//  Bootstrap-данные, встраиваемые в <script>
// ────────────────────────────────────────────

public class GameInitDto
{
    public IReadOnlyList<PlanetDto>    Catalog        { get; init; } = [];
    public IReadOnlyList<UpgradeDto>   Upgrades       { get; init; } = [];
    public GameSettingsDto             DefaultSettings { get; init; } = GameSettingsDto.Default;
}

// ────────────────────────────────────────────
//  Планета / Профессия будущего
// ────────────────────────────────────────────

public class PlanetDto
{
    public string Id          { get; init; } = string.Empty;
    public string Name        { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;

    /// <summary>Направление: technology | medicine | ecology | design | …</summary>
    public string Category    { get; init; } = string.Empty;

    /// <summary>Hard skills, необходимые для профессии.</summary>
    public string[] HardSkills { get; init; } = [];

    /// <summary>Soft skills.</summary>
    public string[] SoftSkills { get; init; } = [];

    /// <summary>Вес кристаллов по направлениям для открытия планеты: { "it": 3, "bio": 2 }.</summary>
    public Dictionary<string, int> CrystalRequirements { get; init; } = [];

    /// <summary>Риски профессии (автоматизация, устаревание и т.п.).</summary>
    public string[] Risks { get; init; } = [];

    /// <summary>Открыта ли планета по умолчанию (видна без сканирования).</summary>
    public bool IsStarterVisible { get; init; }
}

// ────────────────────────────────────────────
//  Апгрейды корабля
// ────────────────────────────────────────────

public class UpgradeDto
{
    public string   Id          { get; init; } = string.Empty;
    public string   Category    { get; init; } = string.Empty; // engine | shield | scanner | capacity
    public string   Name        { get; init; } = string.Empty;
    public string   Description { get; init; } = string.Empty;
    public int      Level       { get; init; }
    public int      Cost        { get; init; }  // кристаллы (суммарно)
    public string   CrystalType { get; init; } = "any"; // тип кристаллов
    public object   Effect      { get; init; } = new { speedBonus = 0, shieldBonus = 0, scanRange = 0, capacity = 0 };
}

// ────────────────────────────────────────────
//  Настройки по умолчанию
// ────────────────────────────────────────────

public class GameSettingsDto
{
    public float SoundVolume   { get; init; } = 0.7f;
    public float MusicVolume   { get; init; } = 0.5f;
    public string GraphicsQuality { get; init; } = "medium"; // low | medium | high
    public string ControlScheme { get; init; } = "keyboard"; // keyboard | mouse | gamepad
    public bool Subtitles       { get; init; } = false;
    public bool ColorblindMode  { get; init; } = false;
    public float UiScale        { get; init; } = 1.0f;
    public bool GuideEnabled    { get; init; } = true;

    public static readonly GameSettingsDto Default = new();
}

// ────────────────────────────────────────────
//  Запрос на сканирование туманности
// ────────────────────────────────────────────

public class ScanRequestDto
{
    public string NebulaId { get; init; } = string.Empty;

    /// <summary>Потраченные кристаллы по направлениям: { "it": 10, "bio": 5 }.</summary>
    public Dictionary<string, int> CrystalsSpent { get; init; } = [];
}

/// <summary>Ответ на запрос сканирования.</summary>
public class ScanResultDto
{
    public bool   Success        { get; init; }
    public string? DiscoveredPlanetId { get; init; }
    public string  Message       { get; init; } = string.Empty;
    public float   SuccessChance { get; init; }  // 0.0–1.0 для журнала
}

// ────────────────────────────────────────────
//  Результат мини-игры
// ────────────────────────────────────────────

public class MiniGameResultDto
{
    public string PlanetId { get; init; } = string.Empty;
    public int    Score    { get; init; }
    public int    TimeMs   { get; init; }
    public bool   Passed   { get; init; }
}

/// <summary>Награда за мини-игру (возвращается клиенту для зачисления).</summary>
public class MiniGameRewardDto
{
    public bool   Valid                     { get; init; }
    public Dictionary<string, int> Crystals { get; init; } = [];
    public string[]                Badges   { get; init; } = [];
}

// ────────────────────────────────────────────
//  Запрос на сохранение прогресса
// ────────────────────────────────────────────

public class SaveProgressDto
{
    public string SaveKey    { get; init; } = string.Empty;
    public string PlayerJson { get; init; } = string.Empty;
}

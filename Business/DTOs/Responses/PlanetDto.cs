namespace KosmosCore.Business.DTOs.Responses;

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

namespace KosmosCore.Data.Models;

/// <summary>
/// Планета-профессия: зеркало таблицы dbo.Planets.
/// Используется Dapper при запросах и маппится в PlanetDto для SPA.
/// </summary>
public class Planet
{
    public int    Id           { get; set; }
    public int    ClusterId    { get; set; }              // FK → Clusters
    public string Title        { get; set; } = string.Empty;
    public int?   TextureId    { get; set; }              // FK → Textures (nullable)
    public int    UnlockCost   { get; set; }              // стоимость открытия в кристаллах кластера
    public string Description  { get; set; } = string.Empty;

    /// <summary>Название кластера (заполняется через JOIN при необходимости).</summary>
    public string? ClusterName { get; set; }

    /// <summary>Тип кристалла кластера (programming / medicine / geology).</summary>
    public string? CrystalType { get; set; }

    /// <summary>Отображаемое название кластера.</summary>
    public string? ClusterDisplayName { get; set; }

    // ── Вычисляемые поля (заполняются через SQL-подзапросы в PlanetRepository) ──

    /// <summary>JSON-массив hard skills: ["Python", "SQL"].</summary>
    public string HardSkills   { get; set; } = "[]";

    /// <summary>JSON-массив soft skills: ["Командная работа"].</summary>
    public string SoftSkills   { get; set; } = "[]";

    /// <summary>JSON-массив рисков: ["Автоматизация"].</summary>
    public string Risks        { get; set; } = "[]";
}
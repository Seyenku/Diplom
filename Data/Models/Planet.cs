namespace KosmosCore.Data.Models;

/// <summary>
/// Планета-профессия: зеркало таблицы dbo.planets.
/// Используется Dapper при запросах и маппится в PlanetDto для SPA.
/// </summary>
public class Planet
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ClusterName { get; set; } = string.Empty; // Название кластера
    public string Description { get; set; } = string.Empty;
    public string HardSkills { get; set; } = "[]";
    public string SoftSkills { get; set; } = "[]";
    public string Risks { get; set; } = "[]";

    public int ScanCost { get; set; }
}
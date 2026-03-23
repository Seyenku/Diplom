namespace KosmosCore.Data.Models;

/// <summary>
/// Планета-профессия: зеркало таблицы dbo.planets.
/// Используется Dapper при запросах и маппится в PlanetDto для SPA.
/// </summary>
public class Planet
{
    public int    Id                 { get; set; }
    public string SystemId           { get; set; } = string.Empty;  // 'ai-architect'
    public string Name               { get; set; } = string.Empty;
    public string Category           { get; set; } = string.Empty;  // 'technology','medicine'...
    public string Description        { get; set; } = string.Empty;
    public string HardSkills         { get; set; } = "[]";          // JSON array
    public string SoftSkills         { get; set; } = "[]";
    public string Risks              { get; set; } = "[]";

    // Требования кристаллов по направлениям
    public int CrystalReqIt      { get; set; }
    public int CrystalReqBio     { get; set; }
    public int CrystalReqMath    { get; set; }
    public int CrystalReqEco     { get; set; }
    public int CrystalReqDesign  { get; set; }
    public int CrystalReqMed     { get; set; }
    public int CrystalReqNeuro   { get; set; }
    public int CrystalReqPhysics { get; set; }

    public bool IsStarterVisible { get; set; }
}

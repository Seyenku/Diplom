namespace KosmosCore.Data.Models;

/// <summary>Связь «Планета ↔ Риск» (многие-ко-многим).</summary>
public class PlanetRiskMap
{
    public int PlanetId { get; set; }
    public int RiskId   { get; set; }
}

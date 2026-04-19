namespace KosmosCore.Data.Models;

/// <summary>Связь «Игровая планета ↔ Реальная специальность».</summary>
public class SpecPlanetMap
{
    public string SpecCode { get; set; } = string.Empty;  // FK → BaseSpecializations
    public int    PlanetId { get; set; }                   // FK → Planets
}

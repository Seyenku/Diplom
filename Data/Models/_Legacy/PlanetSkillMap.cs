namespace KosmosCore.Data.Models;

/// <summary>Связь «Планета ↔ Навык» (многие-ко-многим).</summary>
public class PlanetSkillMap
{
    public int PlanetId { get; set; }
    public int SkillId  { get; set; }
}

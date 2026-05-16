namespace KosmosCore.Data.Models;

/// <summary>Связь Программа ↔ Сфера трудоустройства (M:N).</summary>
public class ProgramSphereMap
{
    public int ProgramId { get; set; }
    public int SphereId  { get; set; }
}

namespace KosmosCore.Data.Models;

/// <summary>Связь Программа ↔ Дисциплина (M:N).</summary>
public class ProgramDisciplineMap
{
    public int ProgramId    { get; set; }
    public int DisciplineId { get; set; }
}

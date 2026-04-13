namespace KosmosCore.Data.Models;

/// <summary>Связь «Программа ↔ Предметы» (с минимальным баллом).</summary>
public class ProgramSubjectMap
{
    public int ProgramId { get; set; }
    public int SubjectId { get; set; }
    public int MinScore  { get; set; }
}

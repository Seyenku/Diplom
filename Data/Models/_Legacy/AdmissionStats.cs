namespace KosmosCore.Data.Models;

/// <summary>Статистика приёма на программу (цена, бюджет, проходной балл).</summary>
public class AdmissionStats
{
    public int    ProgramId      { get; set; }
    public int    Year           { get; set; }
    public decimal Price         { get; set; }
    public int    BudgetPlaces   { get; set; }
    public int    MinPassingScore { get; set; }
}

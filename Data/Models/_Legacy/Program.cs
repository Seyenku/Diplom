namespace KosmosCore.Data.Models;

/// <summary>Конкретная образовательная программа вуза.</summary>
public class Program
{
    public int    Id          { get; set; }
    public string SpecCode    { get; set; } = string.Empty;  // FK → BaseSpecializations
    public int    FormId      { get; set; }                  // FK → EduForms
    public float  YearsEduc   { get; set; }
    public string Description { get; set; } = string.Empty;
}

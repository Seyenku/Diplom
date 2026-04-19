namespace KosmosCore.Data.Models;

/// <summary>Базовое направление подготовки (код специальности).</summary>
public class BaseSpecialization
{
    public string Code  { get; set; } = string.Empty;  // PK, e.g. '09.03.03'
    public string Title { get; set; } = string.Empty;
}

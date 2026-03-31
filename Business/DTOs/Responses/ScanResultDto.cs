namespace KosmosCore.Business.DTOs.Responses;

/// <summary>Ответ на запрос сканирования.</summary>
public class ScanResultDto
{
    public bool   Success        { get; init; }
    public string? DiscoveredPlanetId { get; init; }
    public string  Message       { get; init; } = string.Empty;
    public float   SuccessChance { get; init; }  // 0.0–1.0 для журнала
}

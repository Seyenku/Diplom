namespace KosmosCore.Business.DTOs.Responses;

/// <summary>Туманность — образовательный кластер.</summary>
public class ClusterDto
{
    public int    Id          { get; init; }
    public string Name        { get; init; } = string.Empty;  // "programming"
    public string DisplayName { get; init; } = string.Empty;  // "Туманность Кибернетики"
    public string CrystalType { get; init; } = string.Empty;  // "programming"
    public string Description { get; init; } = string.Empty;
    public int    PlanetCount { get; init; }
}

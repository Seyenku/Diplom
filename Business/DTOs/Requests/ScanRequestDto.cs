namespace KosmosCore.Business.DTOs.Requests;

public class ScanRequestDto
{
    public string NebulaId { get; init; } = string.Empty;

    /// <summary>Потраченные кристаллы по направлениям: { "it": 10, "bio": 5 }.</summary>
    public Dictionary<string, int> CrystalsSpent { get; init; } = [];
}

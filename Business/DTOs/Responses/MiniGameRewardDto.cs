namespace KosmosCore.Business.DTOs.Responses;

/// <summary>Награда за мини-игру (возвращается клиенту для зачисления).</summary>
public class MiniGameRewardDto
{
    public bool   Valid                     { get; init; }
    public Dictionary<string, int> Crystals { get; init; } = [];
    public string[]                Badges   { get; init; } = [];
}

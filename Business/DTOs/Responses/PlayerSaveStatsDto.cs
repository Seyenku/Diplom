namespace KosmosCore.Business.DTOs.Responses;

/// <summary>Сводная аналитика по синхронизированным сохранениям игроков.</summary>
public sealed class PlayerSaveStatsDto
{
    public int TotalSaves { get; init; }
    public int UniqueDevices { get; init; }
    public int NamedPlayers { get; init; }
    public IReadOnlyDictionary<string, int> ByShipColor { get; init; } = new Dictionary<string, int>();
}


namespace KosmosCore.Data.Models;

/// <summary>Серверная запись сохранения игрока для синхронизации и аналитики.</summary>
public sealed class PlayerSaveRecord
{
    public string DeviceId { get; set; } = string.Empty;
    public string SaveJson { get; set; } = string.Empty;
    public string? PlayerName { get; set; }
    public string? ShipColor { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}


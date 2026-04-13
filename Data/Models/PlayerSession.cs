namespace KosmosCore.Data.Models;

/// <summary>Игровая сессия игрока (создаётся клиентом).</summary>
public class PlayerSession
{
    public Guid   SessionId           { get; set; }
    public DateTime StartTime         { get; set; }
    public DateTime? EndTime          { get; set; }
    public int    TotalPlayTimeSeconds { get; set; }
    public string DeviceType          { get; set; } = string.Empty;
    public string ConstellationResult { get; set; } = string.Empty; // JSON
}

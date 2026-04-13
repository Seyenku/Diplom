namespace KosmosCore.Data.Models;

/// <summary>Лог действия внутри игровой сессии.</summary>
public class ActionLog
{
    public long   Id         { get; set; }
    public Guid   SessionId  { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public int?   TargetId   { get; set; }
    public DateTime CreatedAt { get; set; }
    public string Details    { get; set; } = string.Empty; // JSON
}

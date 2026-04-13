namespace KosmosCore.Data.Models;

/// <summary>Глобальные настройки игры (LiveOps).</summary>
public class GameSetting
{
    public string KeyName     { get; set; } = string.Empty;  // PK
    public string Value       { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

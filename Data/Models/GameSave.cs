namespace KosmosCore.Data.Models;

/// <summary>
/// Сохранение прогресса игрока: зеркало таблицы dbo.game_saves.
/// save_key — UUID, генерируется на клиенте и хранится в localStorage.
/// </summary>
public class GameSave
{
    public int      Id         { get; set; }
    public string   SaveKey    { get; set; } = string.Empty;  // UUID
    public string   PlayerJson { get; set; } = "{}";          // JSON прогресса
    public DateTime CreatedAt  { get; set; }
    public DateTime UpdatedAt  { get; set; }
}

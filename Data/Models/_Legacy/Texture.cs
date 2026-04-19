namespace KosmosCore.Data.Models;

/// <summary>Справочник текстур/ассетов для 3D-движка.</summary>
public class Texture
{
    public int    Id        { get; set; }
    public string FileName  { get; set; } = string.Empty;
    public string AssetType { get; set; } = string.Empty; // 'Planet', 'Asteroid' и т.д.
}

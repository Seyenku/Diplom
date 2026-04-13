namespace KosmosCore.Data.Models;

/// <summary>Астероидный пояс (образовательное направление).</summary>
public class Cluster
{
    public int    Id          { get; set; }
    public string Name        { get; set; } = string.Empty; // 'technology', 'medicine', ...
    public string Description { get; set; } = string.Empty;
}

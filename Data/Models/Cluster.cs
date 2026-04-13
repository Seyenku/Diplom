namespace KosmosCore.Data.Models;

/// <summary>Туманность (образовательный кластер: программирование / медицина / геология).</summary>
public class Cluster
{
    public int    Id          { get; set; }
    public string Name        { get; set; } = string.Empty; // 'programming', 'medicine', 'geology'
    public string DisplayName { get; set; } = string.Empty; // «Туманность Кибернетики»
    public string CrystalType { get; set; } = string.Empty; // тип кристалла для региона
    public string Description { get; set; } = string.Empty;
}

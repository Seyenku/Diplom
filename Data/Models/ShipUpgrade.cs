namespace KosmosCore.Data.Models;

/// <summary>Апгрейд корабля: зеркало таблицы dbo.ship_upgrades.</summary>
public class ShipUpgrade
{
    public int    Id                 { get; set; }
    public string SystemId           { get; set; } = string.Empty;  // 'engine-1'
    public string Category           { get; set; } = string.Empty;  // 'engine','shield','scanner','capacity'
    public string Name               { get; set; } = string.Empty;
    public string Description        { get; set; } = string.Empty;
    public int    Cost               { get; set; }
    public int    EffectSpeedBonus   { get; set; }
    public int    EffectShieldBonus  { get; set; }
    public int    EffectScanRange    { get; set; }
    public int    EffectCapacity     { get; set; }
}

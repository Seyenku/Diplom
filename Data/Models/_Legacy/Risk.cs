namespace KosmosCore.Data.Models;

/// <summary>Риск профессии (автоматизация, выгорание и т.д.).</summary>
public class Risk
{
    public int    Id          { get; set; }
    public string Name        { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

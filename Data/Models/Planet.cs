namespace KosmosCore.Data.Models;

public class Planet
{
    public int IdP { get; set; }
    public string PlanetName { get; set; } = string.Empty; // Maps to planet
    public int R { get; set; }
    public int Ws { get; set; }
    public int Hs { get; set; }
    public int X { get; set; } = 0;
    public int Y { get; set; } = 0;
    public int Z { get; set; } = 0;
    public int IdS { get; set; } // Foreign key to Constellation
    public int Texture { get; set; }
}

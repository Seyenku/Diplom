namespace KosmosCore.Business.DTOs.Requests;

public class MiniGameResultDto
{
    public string PlanetId { get; init; } = string.Empty;
    public int    Score    { get; init; }
    public int    TimeMs   { get; init; }
    public bool   Passed   { get; init; }
}

namespace KosmosCore.Business.DTOs.Requests;

public class AdminPlanetInputDto
{
    public int Id { get; set; }
    public int ClusterId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int? TextureId { get; set; }
    public int UnlockCost { get; set; }
    public string? Description { get; set; }
}

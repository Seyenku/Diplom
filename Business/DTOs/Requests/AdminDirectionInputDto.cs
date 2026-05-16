namespace KosmosCore.Business.DTOs.Requests;

public class AdminDirectionInputDto
{
    public int ProgramId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int FormId { get; set; }
    public float YearsEduc { get; set; }
    public string? Description { get; set; }
    public List<string> Disciplines { get; set; } = new();
    public List<string> Spheres { get; set; } = new();
}

using System.ComponentModel.DataAnnotations;

namespace KosmosCore.Business.DTOs.Requests;

public class ConstellationCreateRequest
{
    [Required(ErrorMessage = "Введите название созвездия")]
    [StringLength(100, MinimumLength = 1, ErrorMessage = "Название от 1 до 100 символов")]
    public string ConstellationName { get; set; } = string.Empty;

    [Range(0, int.MaxValue)]
    public int GalaxyId { get; set; }
}

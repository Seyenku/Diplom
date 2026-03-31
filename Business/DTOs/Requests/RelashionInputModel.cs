using System.ComponentModel.DataAnnotations;

namespace KosmosCore.Business.DTOs.Requests;

public class RelashionInputModel
{
    [Required(ErrorMessage = "Выберите направление")]
    [Range(1, int.MaxValue, ErrorMessage = "Выберите направление")]
    public int SpecId { get; set; }

    [Required(ErrorMessage = "Выберите профессию")]
    [Range(1, int.MaxValue, ErrorMessage = "Выберите профессию")]
    public int PlanetId { get; set; }
}

using System.ComponentModel.DataAnnotations;

namespace KosmosCore.Business.DTOs.Requests;

public class PlanetCreateRequest
{
    [Required(ErrorMessage = "Введите название планеты")]
    [StringLength(100, MinimumLength = 1, ErrorMessage = "Название от 1 до 100 символов")]
    public string PlanetName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Введите радиус")]
    [Range(1, 10000, ErrorMessage = "Радиус от 1 до 10000")]
    public int Radius { get; set; }

    [Required(ErrorMessage = "Введите WS")]
    [Range(0, 10000)]
    public int Ws { get; set; }

    [Required(ErrorMessage = "Введите HS")]
    [Range(0, 10000)]
    public int Hs { get; set; }

    [Range(0, 100)]
    public int Texture { get; set; }

    [Range(1, int.MaxValue, ErrorMessage = "Выберите созвездие")]
    public int IdS { get; set; }
}

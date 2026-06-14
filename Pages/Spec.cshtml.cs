using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages;

public class SpecModel : PageModel
{
    private readonly ISpecRepository _specRepository;
    private readonly IConfiguration _configuration;

    public SpecModel(ISpecRepository specRepository, IConfiguration configuration)
    {
        _specRepository = specRepository;
        _configuration = configuration;
    }

    public IReadOnlyList<SpecDirectionDto> Directions { get; private set; } = Array.Empty<SpecDirectionDto>();

    /// <summary>Портал подачи документов СГУ (appsettings University:AdmissionUrl).</summary>
    public string AdmissionUrl => _configuration["University:AdmissionUrl"] ?? "https://postupi.syktsu.ru/";

    public async Task OnGetAsync(CancellationToken ct)
    {
        Directions = await _specRepository.GetAllDirectionsAsync(ct);
    }
}

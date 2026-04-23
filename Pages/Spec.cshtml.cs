using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages;

public class SpecModel : PageModel
{
    private readonly ISpecRepository _specRepository;

    public SpecModel(ISpecRepository specRepository)
    {
        _specRepository = specRepository;
    }

    public IReadOnlyList<SpecDirectionDto> Directions { get; private set; } = Array.Empty<SpecDirectionDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        Directions = await _specRepository.GetAllDirectionsAsync(ct);
    }
}

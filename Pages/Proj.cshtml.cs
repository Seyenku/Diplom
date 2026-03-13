using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Pages;

public class ProjModel : PageModel
{
    private readonly IPlanetRepository _planetRepository;
    private readonly IConstellationRepository _constellationRepository;

    public ProjModel(IPlanetRepository planetRepository, IConstellationRepository constellationRepository)
    {
        _planetRepository = planetRepository;
        _constellationRepository = constellationRepository;
    }

    public IReadOnlyList<PlanetResponse> Planets { get; set; } = [];
    public IReadOnlyList<string> Constellations { get; set; } = [];

    public async Task OnGetAsync(CancellationToken ct)
    {
        var planets = await _planetRepository.GetPlanetsAsync(ct);

        Planets = planets.Select(p => new PlanetResponse
        {
            Name = p.PlanetName,
            R = p.R,
            Ws = p.Ws,
            Hs = p.Hs,
            Texture = p.Texture,
            IdS = p.IdS
        }).ToList();

        var constellations = await _constellationRepository.GetConstellationsForPlanetsAsync(ct);
        Constellations = constellations.ToList();
    }
}

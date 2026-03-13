using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Models;
using KosmosCore.Business.DTOs.Requests;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class PlanetsAddModel : PageModel
{
    private readonly IPlanetRepository _planetRepository;

    public PlanetsAddModel(IPlanetRepository planetRepository)
    {
        _planetRepository = planetRepository;
    }

    [BindProperty]
    public PlanetCreateRequest Input { get; set; } = new();

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        var planet = new Planet
        {
            PlanetName = Input.PlanetName,
            R = Input.Radius,
            Ws = Input.Ws,
            Hs = Input.Hs,
            Texture = Input.Texture,
            IdS = Input.IdS
        };

        await _planetRepository.AddPlanetAsync(planet, ct);
        return RedirectToPage("/Admin/planets_view");
    }
}

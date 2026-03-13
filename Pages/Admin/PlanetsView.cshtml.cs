using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class PlanetsViewModel : PageModel
{
    private readonly IPlanetRepository _planetRepository;

    public PlanetsViewModel(IPlanetRepository planetRepository)
    {
        _planetRepository = planetRepository;
    }

    public void OnGet()
    {
        // Fetch and bind data
    }
}

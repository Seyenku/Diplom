using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Business.DTOs.Requests;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class ConstellationAddModel : PageModel
{
    private readonly IConstellationRepository _constellationRepository;

    public ConstellationAddModel(IConstellationRepository constellationRepository)
    {
        _constellationRepository = constellationRepository;
    }

    [BindProperty]
    public ConstellationCreateRequest Input { get; set; } = new();

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        await _constellationRepository.AddConstellationAsync(Input.ConstellationName, Input.GalaxyId, ct);
        return RedirectToPage("/Admin/spec_view");
    }
}

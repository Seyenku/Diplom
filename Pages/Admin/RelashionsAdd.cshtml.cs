using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Business.DTOs.Requests;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class RelashionsAddModel : PageModel
{
    private readonly ISpecSkillRepository _specSkillRepository;

    public RelashionsAddModel(ISpecSkillRepository specSkillRepository)
    {
        _specSkillRepository = specSkillRepository;
    }

    [BindProperty]
    public RelashionCreateRequest Input { get; set; } = new();

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        await _specSkillRepository.AddSpecSkillAsync(Input.SpecId, Input.PlanetId, ct);
        return RedirectToPage("/Admin/relashions_view");
    }
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class SpecViewModel : PageModel
{
    private readonly ISpecSkillRepository _specSkillRepository;

    public SpecViewModel(ISpecSkillRepository specSkillRepository)
    {
        _specSkillRepository = specSkillRepository;
    }

    public void OnGet()
    {
        // Fetch and bind data
    }
}

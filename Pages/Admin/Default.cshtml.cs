using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class DefaultModel : PageModel
{
    public void OnGet()
    {
    }
}

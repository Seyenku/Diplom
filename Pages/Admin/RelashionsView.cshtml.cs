using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class RelashionsViewModel : PageModel
{
    public void OnGet()
    {
        // Fetch and bind data
    }
}

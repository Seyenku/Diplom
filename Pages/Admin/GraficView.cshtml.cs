using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "admin")]
public class GraficViewModel : PageModel
{
    public void OnGet()
    {
    }
}

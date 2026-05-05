using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "Admin,SuperAdmin")]
public class GraphicViewModel : PageModel
{
    public void OnGet()
    {
    }
}

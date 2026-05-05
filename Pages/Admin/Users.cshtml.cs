using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "SuperAdmin")]
public class UsersModel(IUserRepository userRepository, IPasswordHasher passwordHasher) : PageModel
{
    public IReadOnlyList<User> Admins { get; private set; } = [];
    public IReadOnlyList<AdminRole> Roles { get; private set; } = [];

    [BindProperty]
    public AdminForm Input { get; set; } = new();

    [TempData]
    public string? StatusMessage { get; set; }

    public async Task OnGetAsync(int? editId, CancellationToken ct)
    {
        await LoadAsync(ct);

        if (editId is null) return;

        var admin = Admins.FirstOrDefault(x => x.Id == editId);
        if (admin is null) return;

        Input = new AdminForm
        {
            Id = admin.Id,
            Login = admin.Login,
            RoleId = admin.RoleId
        };
    }

    public async Task<IActionResult> OnPostSaveAsync(CancellationToken ct)
    {
        await LoadAsync(ct);

        if (Input.Id <= 0 && string.IsNullOrWhiteSpace(Input.Password))
            ModelState.AddModelError("Input.Password", "Укажите пароль для нового администратора");

        if (!ModelState.IsValid)
            return Page();

        var login = Input.Login.Trim();
        var passwordHash = string.IsNullOrWhiteSpace(Input.Password)
            ? null
            : passwordHasher.HashPassword(Input.Password);

        if (Input.Id > 0)
        {
            await userRepository.UpdateAdminAsync(Input.Id, login, Input.RoleId, passwordHash, ct);
            StatusMessage = "Администратор обновлен.";
        }
        else
        {
            if (await userRepository.UserExistsAsync(login, ct))
            {
                ModelState.AddModelError("Input.Login", "Администратор с таким логином уже существует");
                return Page();
            }

            await userRepository.CreateAdminAsync(login, passwordHash!, Input.RoleId, ct);
            StatusMessage = "Администратор создан.";
        }

        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostDeleteAsync(int id, CancellationToken ct)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (currentUserId == id.ToString())
        {
            StatusMessage = "Нельзя удалить текущую учетную запись.";
            return RedirectToPage();
        }

        await userRepository.DeleteAdminAsync(id, ct);
        StatusMessage = "Администратор удален.";
        return RedirectToPage();
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Admins = await userRepository.GetAllAsync(ct);
        Roles = await userRepository.GetRolesAsync(ct);
    }

    public class AdminForm
    {
        public int Id { get; set; }

        [Required(ErrorMessage = "Укажите логин")]
        [StringLength(255, MinimumLength = 3)]
        public string Login { get; set; } = string.Empty;

        [StringLength(100, MinimumLength = 4)]
        public string? Password { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Выберите роль")]
        public int RoleId { get; set; }
    }
}

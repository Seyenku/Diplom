using System.ComponentModel.DataAnnotations;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "SuperAdmin")]
public class PlanetsModel(IPlanetRepository planetRepository) : PageModel
{
    public IReadOnlyList<Planet> Planets { get; private set; } = [];
    public IReadOnlyList<Cluster> Clusters { get; private set; } = [];

    [BindProperty]
    public PlanetForm Input { get; set; } = new();

    [TempData]
    public string? StatusMessage { get; set; }

    public async Task OnGetAsync(int? editId, CancellationToken ct)
    {
        await LoadAsync(ct);

        if (editId is null) return;

        var planet = Planets.FirstOrDefault(x => x.Id == editId);
        if (planet is null) return;

        Input = new PlanetForm
        {
            Id = planet.Id,
            ClusterId = planet.ClusterId,
            Title = planet.Title,
            TextureId = planet.TextureId,
            UnlockCost = planet.UnlockCost,
            Description = planet.Description
        };
    }

    public async Task<IActionResult> OnPostSaveAsync(CancellationToken ct)
    {
        await LoadAsync(ct);

        if (!ModelState.IsValid)
            return Page();

        var dto = new AdminPlanetInputDto
        {
            Id = Input.Id,
            ClusterId = Input.ClusterId,
            Title = Input.Title.Trim(),
            TextureId = Input.TextureId,
            UnlockCost = Input.UnlockCost,
            Description = Input.Description?.Trim()
        };

        if (dto.Id > 0)
        {
            await planetRepository.UpdatePlanetAsync(dto, ct);
            StatusMessage = "Планета обновлена.";
        }
        else
        {
            await planetRepository.CreatePlanetAsync(dto, ct);
            StatusMessage = "Планета создана.";
        }

        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostDeleteAsync(int id, CancellationToken ct)
    {
        await planetRepository.DeletePlanetAsync(id, ct);
        StatusMessage = "Планета удалена.";
        return RedirectToPage();
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Planets = await planetRepository.GetAllAsync(ct);
        Clusters = await planetRepository.GetClustersAsync(ct);
    }

    public class PlanetForm
    {
        public int Id { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Выберите туманность")]
        public int ClusterId { get; set; }

        [Required(ErrorMessage = "Укажите название планеты")]
        [StringLength(255)]
        public string Title { get; set; } = string.Empty;

        public int? TextureId { get; set; }

        [Range(0, 9999, ErrorMessage = "Стоимость не может быть отрицательной")]
        public int UnlockCost { get; set; }

        public string? Description { get; set; }
    }
}

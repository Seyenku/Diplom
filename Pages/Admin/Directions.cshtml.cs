using System.ComponentModel.DataAnnotations;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace KosmosCore.Pages.Admin;

[Authorize(Roles = "Admin,SuperAdmin")]
public class DirectionsModel(ISpecRepository specRepository) : PageModel
{
    public IReadOnlyList<SpecDirectionDto> Directions { get; private set; } = [];
    public IReadOnlyList<EduForm> EduForms { get; private set; } = [];

    [BindProperty]
    public DirectionForm Input { get; set; } = new();

    [TempData]
    public string? StatusMessage { get; set; }

    public async Task OnGetAsync(int? editId, CancellationToken ct)
    {
        await LoadAsync(ct);

        if (editId is null) return;

        var direction = Directions.FirstOrDefault(x => x.ProgramId == editId);
        if (direction is null) return;

        var form = EduForms.FirstOrDefault(x => x.Name == direction.EduForm);
        Input = new DirectionForm
        {
            ProgramId = direction.ProgramId,
            Code = direction.Code,
            Title = direction.Title,
            FormId = form?.Id ?? EduForms.FirstOrDefault()?.Id ?? 0,
            YearsEduc = direction.YearsEduc,
            Description = direction.Description,
            Disciplines = direction.Disciplines,
            Spheres = direction.Spheres
        };
    }

    public async Task<IActionResult> OnPostSaveAsync(CancellationToken ct)
    {
        await LoadAsync(ct);

        if (!ModelState.IsValid)
            return Page();

        var dto = new AdminDirectionInputDto
        {
            ProgramId = Input.ProgramId,
            Code = Input.Code.Trim(),
            Title = Input.Title.Trim(),
            FormId = Input.FormId,
            YearsEduc = Input.YearsEduc,
            Description = Input.Description?.Trim(),
            Disciplines = Input.Disciplines?.Trim(),
            Spheres = Input.Spheres?.Trim()
        };

        if (dto.ProgramId > 0)
        {
            await specRepository.UpdateDirectionAsync(dto, ct);
            StatusMessage = "Направление обновлено.";
        }
        else
        {
            await specRepository.CreateDirectionAsync(dto, ct);
            StatusMessage = "Направление создано.";
        }

        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostDeleteAsync(int programId, CancellationToken ct)
    {
        await specRepository.DeleteDirectionAsync(programId, ct);
        StatusMessage = "Направление удалено.";
        return RedirectToPage();
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Directions = await specRepository.GetAllDirectionsAsync(ct);
        EduForms = await specRepository.GetEduFormsAsync(ct);
    }

    public class DirectionForm
    {
        public int ProgramId { get; set; }

        [Required(ErrorMessage = "Укажите код направления")]
        [StringLength(50)]
        public string Code { get; set; } = string.Empty;

        [Required(ErrorMessage = "Укажите название")]
        [StringLength(255)]
        public string Title { get; set; } = string.Empty;

        [Range(1, int.MaxValue, ErrorMessage = "Выберите форму обучения")]
        public int FormId { get; set; }

        [Range(0.5, 10, ErrorMessage = "Укажите срок обучения")]
        public float YearsEduc { get; set; } = 4;

        public string? Description { get; set; }
        public string? Disciplines { get; set; }
        public string? Spheres { get; set; }
    }
}

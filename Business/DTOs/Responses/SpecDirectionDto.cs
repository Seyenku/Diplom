namespace KosmosCore.Business.DTOs.Responses;

/// <summary>DTO для отображения одного направления подготовки на странице «Направления».</summary>
public class SpecDirectionDto
{
    // Из BaseSpecializations
    public string Code  { get; set; } = string.Empty;  // Шифр (09.03.01)
    public string Title { get; set; } = string.Empty;  // Название направления

    // Из Programs + EduForms
    public int    ProgramId   { get; set; }             // ID программы (для привязки AdmissionStats)
    public string EduForm     { get; set; } = string.Empty;
    public float  YearsEduc   { get; set; }
    public string? Description  { get; set; }
    public string? Disciplines  { get; set; }           // Читаемые дисциплины
    public string? Spheres      { get; set; }           // Сферы трудоустройства

    // Вычисляемые через JOIN
    public string? Exams       { get; set; }            // Вступительные испытания (STRING_AGG)
    public string? Professions { get; set; }            // Профессии будущего (STRING_AGG из Planets)

    // Статистика приёма (заполняется отдельно)
    public List<AdmissionYearDto> AdmissionHistory { get; set; } = new();
}

/// <summary>Статистика приёма за один год.</summary>
public class AdmissionYearDto
{
    public int     Year            { get; set; }
    public decimal Price           { get; set; }
    public int     BudgetPlaces    { get; set; }
    public int     MinPassingScore { get; set; }
    public double? AvgEgeScore     { get; set; }
}

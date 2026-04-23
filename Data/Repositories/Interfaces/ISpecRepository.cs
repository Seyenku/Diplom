using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface ISpecRepository
{
    /// <summary>Возвращает все направления подготовки с агрегированными данными.</summary>
    Task<IReadOnlyList<SpecDirectionDto>> GetAllDirectionsAsync(CancellationToken ct = default);
}

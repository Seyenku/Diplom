using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface ISpecRepository
{
    /// <summary>Возвращает все направления подготовки с агрегированными данными.</summary>
    Task<IReadOnlyList<SpecDirectionDto>> GetAllDirectionsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<EduForm>> GetEduFormsAsync(CancellationToken ct = default);
    Task CreateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default);
    Task UpdateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default);
    Task DeleteDirectionAsync(int programId, CancellationToken ct = default);
}

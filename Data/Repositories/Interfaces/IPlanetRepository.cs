using KosmosCore.Data.Models;
using KosmosCore.Business.DTOs.Requests;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IPlanetRepository
{
    /// <summary>Возвращает все планеты-профессии (кэшируется в памяти).</summary>
    Task<IReadOnlyList<Planet>> GetAllAsync(CancellationToken ct = default);

    /// <summary>Возвращает конкретную планету по числовому ID.</summary>
    Task<Planet?> GetByIdAsync(int id, CancellationToken ct = default);

    /// <summary>Возвращает все туманности-кластеры.</summary>
    Task<IReadOnlyList<Cluster>> GetClustersAsync(CancellationToken ct = default);
    Task CreatePlanetAsync(AdminPlanetInputDto planet, CancellationToken ct = default);
    Task UpdatePlanetAsync(AdminPlanetInputDto planet, CancellationToken ct = default);
    Task DeletePlanetAsync(int id, CancellationToken ct = default);
}

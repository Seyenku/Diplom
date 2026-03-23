using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IPlanetRepository
{
    /// <summary>Возвращает все планеты-профессии (кэшируется в памяти).</summary>
    Task<IReadOnlyList<Planet>> GetAllAsync(CancellationToken ct = default);

    /// <summary>Возвращает конкретную планету по system_id ('ai-architect').</summary>
    Task<Planet?> GetBySystemIdAsync(string systemId, CancellationToken ct = default);
}

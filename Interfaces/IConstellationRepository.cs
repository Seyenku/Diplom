using KosmosCore.Models;

namespace KosmosCore.Interfaces;

public interface IConstellationRepository
{
    Task<IEnumerable<string>> GetConstellationsForPlanetsAsync(CancellationToken ct = default);
    Task AddConstellationAsync(string name, int galaxyId, CancellationToken ct = default);
}

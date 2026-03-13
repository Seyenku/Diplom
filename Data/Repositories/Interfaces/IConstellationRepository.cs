namespace KosmosCore.Data.Repositories.Interfaces;

public interface IConstellationRepository
{
    Task<IEnumerable<string>> GetConstellationsForPlanetsAsync(CancellationToken ct = default);
    Task AddConstellationAsync(string name, int galaxyId, CancellationToken ct = default);
}

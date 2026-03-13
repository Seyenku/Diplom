using KosmosCore.Models;

namespace KosmosCore.Interfaces;

public interface IPlanetRepository
{
    Task<IEnumerable<Planet>> GetPlanetsAsync(CancellationToken ct = default);
    Task<IEnumerable<Planet>> GetPlanetsByConstellationAsync(int sozvezdId, CancellationToken ct = default);
    Task AddPlanetAsync(Planet planet, CancellationToken ct = default);
}

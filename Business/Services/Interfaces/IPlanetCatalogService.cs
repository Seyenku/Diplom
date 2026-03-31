using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Business.Services.Interfaces;

public interface IPlanetCatalogService
{
    IReadOnlyList<PlanetDto> GetAll();
    PlanetDto? GetById(string id);
}

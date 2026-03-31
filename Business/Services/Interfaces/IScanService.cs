using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Business.Services.Interfaces;

public interface IScanService
{
    ScanResultDto Resolve(ScanRequestDto request, IEnumerable<PlanetDto> catalog);
}

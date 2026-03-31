using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;

namespace KosmosCore.Business.Services.Interfaces;

public interface IMiniGameService
{
    MiniGameRewardDto CalculateReward(MiniGameResultDto result, PlanetDto? planet);
}

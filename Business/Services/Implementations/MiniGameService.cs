using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Service validates mini-game result and returns reward payload.
/// For trial landing mini-game crystals are not granted.
/// </summary>
public class MiniGameService : IMiniGameService
{
    // Anti-cheat validation bounds.
    private const int MaxScore = 1000;
    private const int MinTimeMs = 3_000;

    public MiniGameRewardDto CalculateReward(MiniGameResultDto result, PlanetDto? planet)
    {
        if (!result.Passed)
            return Invalid();

        if (result.Score < 0 || result.Score > MaxScore)
            return Invalid();

        if (result.TimeMs < MinTimeMs)
            return Invalid();

        if (planet is null)
            return Invalid();

        // No crystal rewards for landing.
        var crystals = new Dictionary<string, int>();

        // Achievement badges are still supported.
        var badges = new List<string>();
        if (result.Score == MaxScore) badges.Add("perfect-run");
        if (result.TimeMs < 15_000 && result.Score >= 800) badges.Add("speed-master");

        return new MiniGameRewardDto
        {
            Valid = true,
            Crystals = crystals,
            Badges = [.. badges]
        };
    }

    private static MiniGameRewardDto Invalid() => new()
    {
        Valid = false,
        Crystals = [],
        Badges = []
    };
}

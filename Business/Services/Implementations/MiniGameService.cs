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

    // Формула счёта — зеркало клиентской (wwwroot/ts/game/screens/minigameShared.ts):
    // первые 45 секунд (чтение условия) бесплатны, дальше −5 очков/с, пол 400.
    // Бейджи считаются от СЕРВЕРНОГО счёта по timeMs — клиентскому score не доверяем.
    private const int ScoreGraceMs = 45_000;
    private const int ScoreDecayPerSec = 5;
    private const int ScoreFloor = 400;
    private const int SpeedMasterMaxMs = 25_000;

    private static int ComputeScore(int timeMs)
    {
        if (timeMs <= ScoreGraceMs) return MaxScore;
        var overSec = (timeMs - ScoreGraceMs) / 1000.0;
        return Math.Max(ScoreFloor, (int)Math.Round(MaxScore - overSec * ScoreDecayPerSec));
    }

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

        // Achievement badges: perfect-run = решение в пределах грейса (≤45 с),
        // speed-master = быстрое уверенное решение (≤25 с).
        var serverScore = ComputeScore(result.TimeMs);
        var badges = new List<string>();
        if (serverScore == MaxScore) badges.Add("perfect-run");
        if (result.TimeMs <= SpeedMasterMaxMs) badges.Add("speed-master");

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

using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Сервис проверки и расчёта наград за мини-игры.
/// Сервер валидирует результат pervasive cheat-detection.
/// </summary>
public class MiniGameService : IMiniGameService
{
    // Максимально возможный счёт за мини-игру (защита от читов)
    private const int MaxScore   = 1000;
    // Минимальное время прохождения, мс (слишком быстро = подозрительно)
    private const int MinTimeMs  = 3_000;

    /// <summary>
    /// Рассчитывает награду в кристаллах за пройденную мини-игру.
    /// Невалидные результаты возвращают Valid=false без наград.
    /// </summary>
    public MiniGameRewardDto CalculateReward(MiniGameResultDto result, PlanetDto? planet)
    {
        // Базовая валидация
        if (!result.Passed)
            return Invalid();

        if (result.Score < 0 || result.Score > MaxScore)
            return Invalid();

        if (result.TimeMs < MinTimeMs)
            return Invalid(); // пройдено подозрительно быстро

        // Если планета не найдена по ID — награду вычислить нельзя
        if (planet is null)
            return Invalid();

        // Базовая награда: 2–10 кристаллов основного типа направления
        float ratio = Math.Clamp(result.Score / (float)MaxScore, 0f, 1f);
        int baseReward = (int)Math.Round(2 + ratio * 8); // 2..10

        // Тип кристаллов = первый ключ из CrystalRequirements планеты
        // string crystalType = planet.CrystalRequirements.Keys.FirstOrDefault() ?? "any";

        // var crystals = new Dictionary<string, int> { [crystalType] = baseReward };

        // Ачивки
        var badges = new List<string>();
        if (result.Score == MaxScore) badges.Add("perfect-run");
        if (result.TimeMs < 15_000 && result.Score >= 800) badges.Add("speed-master");

        return new MiniGameRewardDto
        {
            Valid    = true,
            // Crystals = crystals,
            Badges   = [.. badges]
        };
    }

    private static MiniGameRewardDto Invalid() => new()
    {
        Valid    = false,
        Crystals = [],
        Badges   = []
    };
}

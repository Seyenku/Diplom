using KosmosCore.Models.ViewModels;

namespace KosmosCore.Business;

/// <summary>
/// Сервис логики сканирования туманностей.
/// Вычисляет шанс открытия планеты на основе потраченных кристаллов
/// и требований планеты.
/// </summary>
public static class ScanService
{
    /// <summary>
    /// Разрешает результат сканирования.
    /// Алгоритм: сравниваем потраченные кристаллы с CrystalRequirements кандидатов.
    /// Шанс = min(1.0, Σ(spent[dir] / required[dir]) / count(dirs)).
    /// </summary>
    public static ScanResultDto Resolve(ScanRequestDto request, IEnumerable<PlanetDto> catalog)
    {
        // Находим кандидат-планеты для данной туманности
        var candidates = catalog
            .Where(p => !p.IsStarterVisible)
            .ToList();

        if (candidates.Count == 0)
            return Fail("Туманность пуста — все профессии уже открыты.");

        // Выбираем лучшего кандидата по совпадению кристаллов
        PlanetDto? best = null;
        float bestScore = 0f;

        foreach (var planet in candidates)
        {
            float score = CalculateMatchScore(request.CrystalsSpent, planet.CrystalRequirements);
            if (score > bestScore)
            {
                bestScore = score;
                best = planet;
            }
        }

        // Рандомизация: шанс открытия = score (0–1), добавляем немного случайности
        var rng = Random.Shared;
        float roll = (float)rng.NextDouble();
        bool success = best is not null && roll <= bestScore;

        if (success && best is not null)
        {
            return new ScanResultDto
            {
                Success = true,
                DiscoveredPlanetId = best.Id,
                Message = $"Сканирование успешно! Открыта планета: «{best.Name}».",
                SuccessChance = bestScore
            };
        }

        return new ScanResultDto
        {
            Success = false,
            Message = "Сигнал слишком слабый. Нужно больше кристаллов подходящих направлений.",
            SuccessChance = bestScore
        };
    }

    private static float CalculateMatchScore(
        Dictionary<string, int> spent,
        Dictionary<string, int> required)
    {
        if (required.Count == 0) return 0.5f;

        float total = 0f;
        foreach (var (dir, req) in required)
        {
            float have = spent.TryGetValue(dir, out int v) ? v : 0;
            total += Math.Min(1f, have / (float)req);
        }
        return total / required.Count;
    }

    private static ScanResultDto Fail(string message) => new()
    {
        Success = false,
        Message = message,
        SuccessChance = 0f
    };
}

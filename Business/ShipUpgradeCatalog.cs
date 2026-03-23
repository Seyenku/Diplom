using KosmosCore.Models.ViewModels;

namespace KosmosCore.Business;

/// <summary>
/// Статический каталог апгрейдов корабля «Профориентатор».
/// Три ветки: Engine, Shield, Scanner. Каждая — 3 уровня.
/// </summary>
public static class ShipUpgradeCatalog
{
    private static readonly List<UpgradeDto> _upgrades =
    [
        // ── Двигатель ──────────────────────────────────
        new UpgradeDto
        {
            Id = "engine-1", Category = "engine", Name = "Форсаж I",
            Description = "Увеличивает скорость корабля на 20%. Быстрее долетаешь до астероидов.",
            Level = 1, Cost = 5, CrystalType = "any",
            Effect = new { speedBonus = 20, shieldBonus = 0, scanRange = 0, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "engine-2", Category = "engine", Name = "Форсаж II",
            Description = "Скорость +40% от базы. Открывает дальние области пояса.",
            Level = 2, Cost = 15, CrystalType = "any",
            Effect = new { speedBonus = 40, shieldBonus = 0, scanRange = 0, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "engine-3", Category = "engine", Name = "Квантовый двигатель",
            Description = "Скорость +70%. Возможность быстрого переключения между поясами.",
            Level = 3, Cost = 35, CrystalType = "any",
            Effect = new { speedBonus = 70, shieldBonus = 0, scanRange = 0, capacity = 0 }
        },

        // ── Щиты ─────────────────────────────────────
        new UpgradeDto
        {
            Id = "shield-1", Category = "shield", Name = "Щит I",
            Description = "Защита +15%. Меньше урона от космического мусора.",
            Level = 1, Cost = 5, CrystalType = "any",
            Effect = new { speedBonus = 0, shieldBonus = 15, scanRange = 0, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "shield-2", Category = "shield", Name = "Щит II",
            Description = "Защита +35%. Позволяет выжить при двух столкновениях без потери прогресса.",
            Level = 2, Cost = 15, CrystalType = "any",
            Effect = new { speedBonus = 0, shieldBonus = 35, scanRange = 0, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "shield-3", Category = "shield", Name = "Голографический барьер",
            Description = "Защита +60%. Первое смертельное столкновение — автоотражение.",
            Level = 3, Cost = 35, CrystalType = "any",
            Effect = new { speedBonus = 0, shieldBonus = 60, scanRange = 0, capacity = 0 }
        },

        // ── Сканер ───────────────────────────────────
        new UpgradeDto
        {
            Id = "scanner-1", Category = "scanner", Name = "Сканер I",
            Description = "Дальность сканирования +1 туманность. Открывает ближние профессии.",
            Level = 1, Cost = 8, CrystalType = "it",
            Effect = new { speedBonus = 0, shieldBonus = 0, scanRange = 1, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "scanner-2", Category = "scanner", Name = "Сканер II",
            Description = "Дальность сканирования +2. Открывает редкие профессии 2-го уровня.",
            Level = 2, Cost = 20, CrystalType = "it",
            Effect = new { speedBonus = 0, shieldBonus = 0, scanRange = 2, capacity = 0 }
        },
        new UpgradeDto
        {
            Id = "scanner-3", Category = "scanner", Name = "Нейросканер",
            Description = "Дальность +4. Открывает все скрытые туманности галактики.",
            Level = 3, Cost = 45, CrystalType = "it",
            Effect = new { speedBonus = 0, shieldBonus = 0, scanRange = 4, capacity = 0 }
        },

        // ── Вместимость кристаллов ────────────────────
        new UpgradeDto
        {
            Id = "capacity-1", Category = "capacity", Name = "Расширитель трюма I",
            Description = "Максимальный запас каждого типа кристаллов +20.",
            Level = 1, Cost = 6, CrystalType = "any",
            Effect = new { speedBonus = 0, shieldBonus = 0, scanRange = 0, capacity = 20 }
        },
        new UpgradeDto
        {
            Id = "capacity-2", Category = "capacity", Name = "Расширитель трюма II",
            Description = "Максимальный запас +50.",
            Level = 2, Cost = 18, CrystalType = "any",
            Effect = new { speedBonus = 0, shieldBonus = 0, scanRange = 0, capacity = 50 }
        },
    ];

    public static IReadOnlyList<UpgradeDto> GetAll() => _upgrades.AsReadOnly();
}

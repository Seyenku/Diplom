using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IGameSaveRepository
{
    /// <summary>Загружает сохранение по UUID-ключу.</summary>
    Task<GameSave?> GetAsync(string saveKey, CancellationToken ct = default);

    /// <summary>Создаёт или обновляет сохранение.</summary>
    Task UpsertAsync(string saveKey, string playerJson, CancellationToken ct = default);

    /// <summary>Возвращает все сохранения (для кабинета администратора).</summary>
    Task<IReadOnlyList<GameSave>> GetAllAsync(CancellationToken ct = default);
}

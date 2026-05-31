namespace KosmosCore.Data.Repositories.Interfaces;

public interface IGameSettingsRepository
{
    Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default);
}

using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class GameSettingsRepository(Func<IDbConnection> dbFactory, IMemoryCache cache, ILogger<GameSettingsRepository> logger) : IGameSettingsRepository
{
    private const string CacheKey = "game_settings";

    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, string>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = "SELECT KeyName, Value FROM dbo.GameSettings";
            using var db = dbFactory();
            var rows = await db.QueryAsync<GameSetting>(new CommandDefinition(sql, cancellationToken: ct));

            var dict = rows.ToDictionary(r => r.KeyName, r => r.Value);
            IReadOnlyDictionary<string, string> ro = dict;

            cache.Set(CacheKey, ro, TimeSpan.FromMinutes(30));
            return ro;
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error in GameSettingsRepository.GetAllAsync");
            return new Dictionary<string, string>();
        }
    }
}

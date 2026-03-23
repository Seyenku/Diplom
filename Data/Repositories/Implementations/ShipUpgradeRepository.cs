using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class ShipUpgradeRepository : IShipUpgradeRepository
{
    private const string CacheKey = "ship_upgrade_catalog";

    private readonly IDbConnection _db;
    private readonly IMemoryCache  _cache;
    private readonly ILogger<ShipUpgradeRepository> _logger;

    public ShipUpgradeRepository(IDbConnection db, IMemoryCache cache, ILogger<ShipUpgradeRepository> logger)
    {
        _db     = db;
        _cache  = cache;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ShipUpgrade>> GetAllAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CacheKey, out IReadOnlyList<ShipUpgrade>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = @"
                SELECT id                   AS Id,
                       system_id            AS SystemId,
                       category             AS Category,
                       name                 AS Name,
                       description          AS Description,
                       cost                 AS Cost,
                       effect_speed_bonus   AS EffectSpeedBonus,
                       effect_shield_bonus  AS EffectShieldBonus,
                       effect_scan_range    AS EffectScanRange,
                       effect_capacity      AS EffectCapacity
                FROM dbo.ship_upgrades
                ORDER BY id";

            var result = (await _db.QueryAsync<ShipUpgrade>(
                new CommandDefinition(sql, cancellationToken: ct))).ToList();

            var list = result.AsReadOnly();
            _cache.Set(CacheKey, list, TimeSpan.FromMinutes(30));
            return list;
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error in ShipUpgradeRepository.GetAllAsync");
            throw;
        }
    }
}

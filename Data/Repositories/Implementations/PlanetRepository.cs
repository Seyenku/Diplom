using System.Data;
using System.Data.Common;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class PlanetRepository(IDbConnection db, IMemoryCache cache, ILogger<PlanetRepository> logger) : IPlanetRepository
{
    private const string CacheKey = "planet_catalog";

    public async Task<IReadOnlyList<Planet>> GetAllAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyList<Planet>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = @"
                SELECT p.Id                AS Id,
                       p.Title             AS Title,
                       c.Name              AS ClusterName,
                       pd.Description      AS Description,
                       pd.HardSkills       AS HardSkills,
                       pd.SoftSkills       AS SoftSkills,
                       pd.Risks            AS Risks,
                       p.ScanCost          AS ScanCost
                FROM dbo.Planets p
                LEFT JOIN dbo.Clusters c ON p.ClusterId = c.Id
                LEFT JOIN dbo.PlanetDetails pd ON p.Id = pd.PlanetId
                ORDER BY p.Id";

            var result = (await db.QueryAsync<Planet>(
                new CommandDefinition(sql, cancellationToken: ct))).ToList();

            var list = result.AsReadOnly();

            cache.Set(CacheKey, list, TimeSpan.FromMinutes(30));
            return list;
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error in PlanetRepository.GetAllAsync");
            throw;
        }
    }

    public async Task<Planet?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        var all = await GetAllAsync(ct);
        return all.FirstOrDefault(p => p.Id == id);
    }
}

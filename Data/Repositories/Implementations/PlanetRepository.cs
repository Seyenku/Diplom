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
                       p.ClusterId         AS ClusterId,
                       c.Name              AS ClusterName,
                       c.DisplayName       AS ClusterDisplayName,
                       c.CrystalType       AS CrystalType,
                       p.Title             AS Title,
                       p.TextureId         AS TextureId,
                       p.UnlockCost        AS UnlockCost,
                       p.Description       AS Description,
                       ISNULL((
                           SELECT '[' + STRING_AGG('""' + STRING_ESCAPE(s.Name, 'json') + '""', ',') + ']'
                           FROM dbo.Planet_Skills_Map psm
                           JOIN dbo.Skills s ON psm.SkillId = s.Id
                           WHERE psm.PlanetId = p.Id AND s.SkillType = 'Hard'
                       ), '[]') AS HardSkills,
                       ISNULL((
                           SELECT '[' + STRING_AGG('""' + STRING_ESCAPE(s.Name, 'json') + '""', ',') + ']'
                           FROM dbo.Planet_Skills_Map psm
                           JOIN dbo.Skills s ON psm.SkillId = s.Id
                           WHERE psm.PlanetId = p.Id AND s.SkillType = 'Soft'
                       ), '[]') AS SoftSkills,
                       ISNULL((
                           SELECT '[' + STRING_AGG('""' + STRING_ESCAPE(r.Name, 'json') + '""', ',') + ']'
                           FROM dbo.Planet_Risks_Map prm
                           JOIN dbo.Risks r ON prm.RiskId = r.Id
                           WHERE prm.PlanetId = p.Id
                       ), '[]') AS Risks
                FROM dbo.Planets p
                LEFT JOIN dbo.Clusters c ON p.ClusterId = c.Id
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

    public async Task<IReadOnlyList<Cluster>> GetClustersAsync(CancellationToken ct = default)
    {
        var cacheKey = "clusters_catalog";
        if (cache.TryGetValue(cacheKey, out IReadOnlyList<Cluster>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = "SELECT * FROM dbo.Clusters ORDER BY Id";
            var result = (await db.QueryAsync<Cluster>(
                new CommandDefinition(sql, cancellationToken: ct))).ToList().AsReadOnly();

            cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error in PlanetRepository.GetClustersAsync");
            throw;
        }
    }
}

using System.Data;
using System.Data.Common;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class PlanetRepository(Func<IDbConnection> dbFactory, IMemoryCache cache, ILogger<PlanetRepository> logger) : IPlanetRepository
{
    private const string CacheKey = "planet_catalog";

    // Общий блок проекций — переиспользуется в GetAllAsync и GetByIdAsync,
    // чтобы не дублировать тяжёлые JSON-агрегации skills/risks.
    private const string PlanetSelectBlock = @"
        p.Id                AS Id,
        p.ClusterId         AS ClusterId,
        c.Name              AS ClusterName,
        c.DisplayName       AS ClusterDisplayName,
        c.CrystalType       AS CrystalType,
        p.Title             AS Title,
        p.UnlockCost        AS UnlockCost,
        p.Description       AS Description,
        p.TextureKey        AS TextureKey,
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
        ), '[]') AS Risks";

    public async Task<IReadOnlyList<Planet>> GetAllAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyList<Planet>? cached) && cached is not null)
            return cached;

        try
        {
            var sql = $@"
                SELECT {PlanetSelectBlock}
                FROM dbo.Planets p
                LEFT JOIN dbo.Clusters c ON p.ClusterId = c.Id
                ORDER BY p.Id";

            using var db = dbFactory();
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
        // Fast path: кеш каталога прогрет — отдаём из памяти.
        if (cache.TryGetValue(CacheKey, out IReadOnlyList<Planet>? cached) && cached is not null)
            return cached.FirstOrDefault(p => p.Id == id);

        // Cold path: узкий запрос вместо JSON-агрегации по всей таблице ради одной планеты.
        try
        {
            var sql = $@"
                SELECT {PlanetSelectBlock}
                FROM dbo.Planets p
                LEFT JOIN dbo.Clusters c ON p.ClusterId = c.Id
                WHERE p.Id = @Id";

            using var db = dbFactory();
            return await db.QuerySingleOrDefaultAsync<Planet>(
                new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error in PlanetRepository.GetByIdAsync (id={Id})", id);
            throw;
        }
    }

    public async Task<IReadOnlyList<Cluster>> GetClustersAsync(CancellationToken ct = default)
    {
        var cacheKey = "clusters_catalog";
        if (cache.TryGetValue(cacheKey, out IReadOnlyList<Cluster>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = @"
                SELECT Id, Name, DisplayName, CrystalType, Description
                FROM dbo.Clusters
                ORDER BY Id";
            using var db = dbFactory();
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

    public async Task CreatePlanetAsync(AdminPlanetInputDto planet, CancellationToken ct = default)
    {
        const string sql = @"
            INSERT INTO dbo.Planets (ClusterId, Title, UnlockCost, Description, TextureKey)
            VALUES (@ClusterId, @Title, @UnlockCost, @Description, @TextureKey);";

        using var db = dbFactory();
        await db.ExecuteAsync(new CommandDefinition(sql, planet, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    public async Task UpdatePlanetAsync(AdminPlanetInputDto planet, CancellationToken ct = default)
    {
        const string sql = @"
            UPDATE dbo.Planets
               SET ClusterId = @ClusterId,
                   Title = @Title,
                   UnlockCost = @UnlockCost,
                   Description = @Description,
                   TextureKey = @TextureKey
             WHERE Id = @Id;";

        using var db = dbFactory();
        await db.ExecuteAsync(new CommandDefinition(sql, planet, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    public async Task DeletePlanetAsync(int id, CancellationToken ct = default)
    {
        const string sql = "DELETE FROM dbo.Planets WHERE Id = @Id";
        using var db = dbFactory();
        await db.ExecuteAsync(new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
        cache.Remove(CacheKey);
    }
}

using System.Data;
using System.Data.Common;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class PlanetRepository : IPlanetRepository
{
    private const string CacheKey = "planet_catalog";

    private readonly IDbConnection    _db;
    private readonly IMemoryCache     _cache;
    private readonly ILogger<PlanetRepository> _logger;

    public PlanetRepository(IDbConnection db, IMemoryCache cache, ILogger<PlanetRepository> logger)
    {
        _db     = db;
        _cache  = cache;
        _logger = logger;
    }

    public async Task<IReadOnlyList<Planet>> GetAllAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CacheKey, out IReadOnlyList<Planet>? cached) && cached is not null)
            return cached;

        try
        {
            const string sql = @"
                SELECT id             AS Id,
                       system_id      AS SystemId,
                       name           AS Name,
                       category       AS Category,
                       description    AS Description,
                       hard_skills    AS HardSkills,
                       soft_skills    AS SoftSkills,
                       risks          AS Risks,
                       crystal_req_it      AS CrystalReqIt,
                       crystal_req_bio     AS CrystalReqBio,
                       crystal_req_math    AS CrystalReqMath,
                       crystal_req_eco     AS CrystalReqEco,
                       crystal_req_design  AS CrystalReqDesign,
                       crystal_req_med     AS CrystalReqMed,
                       crystal_req_neuro   AS CrystalReqNeuro,
                       crystal_req_physics AS CrystalReqPhysics,
                       is_starter_visible  AS IsStarterVisible
                FROM dbo.planets
                ORDER BY id";

            var result = (await _db.QueryAsync<Planet>(
                new CommandDefinition(sql, cancellationToken: ct))).ToList();

            var list = result.AsReadOnly();

            _cache.Set(CacheKey, list, TimeSpan.FromMinutes(30));
            return list;
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error in PlanetRepository.GetAllAsync");
            throw;
        }
    }

    public async Task<Planet?> GetBySystemIdAsync(string systemId, CancellationToken ct = default)
    {
        var all = await GetAllAsync(ct);
        return all.FirstOrDefault(p => p.SystemId == systemId);
    }
}

using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Interfaces;

namespace KosmosCore.Repositories;

public class SpecSkillRepository : ISpecSkillRepository
{
    private readonly IDbConnection _dbConnection;
    private readonly ILogger<SpecSkillRepository> _logger;

    public SpecSkillRepository(IDbConnection dbConnection, ILogger<SpecSkillRepository> logger)
    {
        _dbConnection = dbConnection;
        _logger = logger;
    }

    public async Task AddSpecSkillAsync(int specId, int planetId, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT INTO spec_skill (spec, planet) 
                VALUES (@SpecId, @PlanetId)";

            await _dbConnection.ExecuteAsync(
                new CommandDefinition(sql, new { SpecId = specId, PlanetId = planetId }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while adding spec_skill for spec {SpecId} and planet {PlanetId}.", specId, planetId);
            throw;
        }
    }
}

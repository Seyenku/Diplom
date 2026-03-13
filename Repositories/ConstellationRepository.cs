using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Interfaces;

namespace KosmosCore.Repositories;

public class ConstellationRepository : IConstellationRepository
{
    private readonly IDbConnection _dbConnection;
    private readonly ILogger<ConstellationRepository> _logger;

    public ConstellationRepository(IDbConnection dbConnection, ILogger<ConstellationRepository> logger)
    {
        _dbConnection = dbConnection;
        _logger = logger;
    }

    public async Task<IEnumerable<string>> GetConstellationsForPlanetsAsync(CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT DISTINCT s.sozvezd 
                FROM sozvezd s
                INNER JOIN planets p ON s.idS = p.id_s";

            return await _dbConnection.QueryAsync<string>(
                new CommandDefinition(sql, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while fetching distinct constellations for planets.");
            throw;
        }
    }

    public async Task AddConstellationAsync(string name, int galaxyId, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT INTO sozvezd (sozvezd, galaxy) 
                VALUES (@Name, @GalaxyId)";

            await _dbConnection.ExecuteAsync(
                new CommandDefinition(sql, new { Name = name, GalaxyId = galaxyId }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while adding constellation {Name}.", name);
            throw;
        }
    }
}

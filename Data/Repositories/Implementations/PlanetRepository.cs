using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Repositories.Interfaces;
using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Implementations;

public class PlanetRepository : IPlanetRepository
{
    private readonly IDbConnection _dbConnection;
    private readonly ILogger<PlanetRepository> _logger;

    public PlanetRepository(IDbConnection dbConnection, ILogger<PlanetRepository> logger)
    {
        _dbConnection = dbConnection;
        _logger = logger;
    }

    public async Task<IEnumerable<Planet>> GetPlanetsAsync(CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT idP, planet AS PlanetName, r, ws, hs, texture, id_s AS IdS 
                FROM planets";

            return await _dbConnection.QueryAsync<Planet>(
                new CommandDefinition(sql, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while fetching all planets.");
            throw;
        }
    }

    public async Task<IEnumerable<Planet>> GetPlanetsByConstellationAsync(int sozvezdId, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT idP, planet AS PlanetName, r, ws, hs, x, y, z, texture, id_s AS IdS 
                FROM planets 
                WHERE id_s = @SozvezdId";

            return await _dbConnection.QueryAsync<Planet>(
                new CommandDefinition(sql, new { SozvezdId = sozvezdId }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while fetching planets for constellation {SozvezdId}.", sozvezdId);
            throw;
        }
    }

    public async Task AddPlanetAsync(Planet planet, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT INTO planets (planet, r, ws, hs, id_s, texture) 
                VALUES (@PlanetName, @R, @Ws, @Hs, @IdS, @Texture)";

            await _dbConnection.ExecuteAsync(
                new CommandDefinition(sql, planet, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while adding planet {PlanetName}.", planet.PlanetName);
            throw;
        }
    }
}

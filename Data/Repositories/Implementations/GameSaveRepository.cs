using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class GameSaveRepository : IGameSaveRepository
{
    private readonly IDbConnection _db;
    private readonly ILogger<GameSaveRepository> _logger;

    public GameSaveRepository(IDbConnection db, ILogger<GameSaveRepository> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task<GameSave?> GetAsync(string saveKey, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT id          AS Id,
                       save_key    AS SaveKey,
                       player_json AS PlayerJson,
                       created_at  AS CreatedAt,
                       updated_at  AS UpdatedAt
                FROM dbo.game_saves
                WHERE save_key = @SaveKey";

            return await _db.QuerySingleOrDefaultAsync<GameSave>(
                new CommandDefinition(sql, new { SaveKey = saveKey }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error in GameSaveRepository.GetAsync for key {Key}", saveKey);
            throw;
        }
    }

    public async Task UpsertAsync(string saveKey, string playerJson, CancellationToken ct = default)
    {
        try
        {
            // MERGE — создаёт или обновляет запись
            const string sql = @"
                MERGE dbo.game_saves AS target
                USING (VALUES (@SaveKey, @PlayerJson)) AS src (save_key, player_json)
                ON target.save_key = src.save_key
                WHEN MATCHED THEN
                    UPDATE SET player_json = src.player_json,
                               updated_at  = SYSUTCDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (save_key, player_json, created_at, updated_at)
                    VALUES (src.save_key, src.player_json, SYSUTCDATETIME(), SYSUTCDATETIME());";

            await _db.ExecuteAsync(
                new CommandDefinition(sql, new { SaveKey = saveKey, PlayerJson = playerJson }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error in GameSaveRepository.UpsertAsync for key {Key}", saveKey);
            throw;
        }
    }

    public async Task<IReadOnlyList<GameSave>> GetAllAsync(CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT id, save_key AS SaveKey, player_json AS PlayerJson,
                       created_at AS CreatedAt, updated_at AS UpdatedAt
                FROM dbo.game_saves
                ORDER BY updated_at DESC";

            var result = await _db.QueryAsync<GameSave>(
                new CommandDefinition(sql, cancellationToken: ct));
            return result.ToList().AsReadOnly();
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error in GameSaveRepository.GetAllAsync");
            throw;
        }
    }
}

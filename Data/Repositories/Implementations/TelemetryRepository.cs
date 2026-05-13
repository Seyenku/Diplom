using System.Data;
using Dapper;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class TelemetryRepository(IDbConnection db) : ITelemetryRepository
{
    private readonly IDbConnection _db = db;

    public async Task EnsureSessionExistsAsync(Guid sessionId, string deviceType, DateTime startTime)
    {
        var sql = @"
            IF NOT EXISTS (SELECT 1 FROM PlayerSessions WHERE SessionId = @SessionId)
            BEGIN
                INSERT INTO PlayerSessions (SessionId, StartTime, DeviceType)
                VALUES (@SessionId, @StartTime, @DeviceType)
            END
        ";
        await _db.ExecuteAsync(sql, new { SessionId = sessionId, StartTime = startTime, DeviceType = deviceType });
    }

    public async Task InsertActionLogsAsync(IEnumerable<ActionLog> logs)
    {
        if (!logs.Any()) return;
        
        var sql = @"
            INSERT INTO ActionLogs (SessionId, ActionType, TargetId, CreatedAt, Details)
            VALUES (@SessionId, @ActionType, @TargetId, @CreatedAt, @Details)
        ";
        await _db.ExecuteAsync(sql, logs);
    }

    public async Task UpdateSessionEndAsync(Guid sessionId, DateTime endTime)
    {
        var sql = @"
            UPDATE PlayerSessions
            SET EndTime = @EndTime, 
                TotalPlayTimeSeconds = DATEDIFF(SECOND, StartTime, @EndTime)
            WHERE SessionId = @SessionId AND (EndTime IS NULL OR EndTime < @EndTime)
        ";
        await _db.ExecuteAsync(sql, new { SessionId = sessionId, EndTime = endTime });
    }
}

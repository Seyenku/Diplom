using System.Data;
using Dapper;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class TelemetryRepository(Func<IDbConnection> dbFactory) : ITelemetryRepository
{
    public async Task EnsureSessionExistsAsync(Guid sessionId, string deviceType, DateTime startTime)
    {
        const string sql = @"
            IF NOT EXISTS (SELECT 1 FROM PlayerSessions WHERE SessionId = @SessionId)
            BEGIN
                INSERT INTO PlayerSessions (SessionId, StartTime, DeviceType)
                VALUES (@SessionId, @StartTime, @DeviceType)
            END
        ";
        using var db = dbFactory();
        await db.ExecuteAsync(sql, new { SessionId = sessionId, StartTime = startTime, DeviceType = deviceType });
    }

    public async Task InsertActionLogsAsync(IEnumerable<ActionLog> logs)
    {
        if (!logs.Any()) return;

        const string sql = @"
            INSERT INTO ActionLogs (SessionId, ActionType, TargetId, CreatedAt, Details)
            VALUES (@SessionId, @ActionType, @TargetId, @CreatedAt, @Details)
        ";
        using var db = dbFactory();
        await db.ExecuteAsync(sql, logs);
    }

    public async Task UpdateSessionEndAsync(Guid sessionId, DateTime endTime)
    {
        const string sql = @"
            UPDATE PlayerSessions
            SET EndTime = @EndTime,
                TotalPlayTimeSeconds = DATEDIFF(SECOND, StartTime, @EndTime)
            WHERE SessionId = @SessionId AND (EndTime IS NULL OR EndTime < @EndTime)
        ";
        using var db = dbFactory();
        await db.ExecuteAsync(sql, new { SessionId = sessionId, EndTime = endTime });
    }
}

namespace KosmosCore.Data.Repositories.Interfaces;

using KosmosCore.Data.Models;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

public interface ITelemetryRepository
{
    Task EnsureSessionExistsAsync(Guid sessionId, string deviceType, DateTime startTime);
    Task InsertActionLogsAsync(IEnumerable<ActionLog> logs);
    Task UpdateSessionEndAsync(Guid sessionId, DateTime endTime);
}

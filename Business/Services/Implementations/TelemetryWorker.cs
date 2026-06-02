using System.Text.Json;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.Services.Interfaces;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Фоновый сервис, разгребающий очередь телеметрии и пишущий в БД.
/// Каждый батч обрабатывается в собственном DI-scope, т.к. репозиторий и
/// IDbConnection — Scoped.
/// </summary>
public class TelemetryWorker(
    ITelemetryQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<TelemetryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("TelemetryWorker started");

        await foreach (var batch in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await ProcessBatchAsync(batch, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                // Не валим воркер из-за одного плохого батча — пишем в лог и едем дальше.
                logger.LogError(ex, "TelemetryWorker: failed to persist batch (events: {Count})", batch.Events.Count);
            }
        }

        logger.LogInformation("TelemetryWorker stopping");
    }

    private async Task ProcessBatchAsync(TelemetryBatchDto batch, CancellationToken ct)
    {
        if (batch.Events.Count == 0) return;

        using var scope = scopeFactory.CreateScope();
        var telemetry = scope.ServiceProvider.GetRequiredService<ITelemetryRepository>();

        foreach (var sessionGroup in batch.Events.GroupBy(e => e.SessionId))
        {
            if (ct.IsCancellationRequested) return;
            if (!Guid.TryParse(sessionGroup.Key, out var sessionId)) continue;

            var deviceType = ExtractDeviceType(sessionGroup);
            var firstEventTimeStr = sessionGroup.First().CreatedAt;
            var startTime = DateTime.TryParse(firstEventTimeStr, out var st) ? st : DateTime.UtcNow;

            await telemetry.EnsureSessionExistsAsync(sessionId, deviceType, startTime);

            var logs = sessionGroup.Select(e => new ActionLog
            {
                SessionId  = sessionId,
                ActionType = e.ActionType ?? "UNKNOWN",
                TargetId   = e.TargetId,
                CreatedAt  = DateTime.TryParse(e.CreatedAt, out var ct2) ? ct2 : DateTime.UtcNow,
                Details    = e.Details ?? "{}"
            }).ToList();

            await telemetry.InsertActionLogsAsync(logs);

            var endEvt = sessionGroup.FirstOrDefault(e => e.ActionType == "SESSION_END");
            if (endEvt != null)
            {
                var endTime = DateTime.TryParse(endEvt.CreatedAt, out var et) ? et : DateTime.UtcNow;
                await telemetry.UpdateSessionEndAsync(sessionId, endTime);
            }
        }
    }

    private static string ExtractDeviceType(IEnumerable<TelemetryEventDto> sessionEvents)
    {
        var startEvt = sessionEvents.FirstOrDefault(e => e.ActionType == "SESSION_START");
        if (startEvt is null || string.IsNullOrEmpty(startEvt.Details)) return "desktop";
        try
        {
            using var doc = JsonDocument.Parse(startEvt.Details);
            if (doc.RootElement.TryGetProperty("deviceType", out var dt))
                return dt.GetString() ?? "desktop";
        }
        catch { }
        return "desktop";
    }
}

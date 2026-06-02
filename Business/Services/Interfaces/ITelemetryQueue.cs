using KosmosCore.Business.DTOs.Requests;

namespace KosmosCore.Business.Services.Interfaces;

/// <summary>
/// Неблокирующая очередь для приёма телеметрии от клиента.
/// Endpoint OnPostTelemetry кладёт батчи сюда и сразу отвечает 202 Accepted,
/// а TelemetryWorker (BackgroundService) разгребает их в фоне.
/// </summary>
public interface ITelemetryQueue
{
    /// <summary>
    /// Попытаться положить батч в очередь.
    /// Возвращает false, если очередь переполнена (backpressure) — endpoint
    /// может в этом случае вернуть 503, чтобы клиент попробовал позже.
    /// </summary>
    bool TryEnqueue(TelemetryBatchDto batch);

    /// <summary>Асинхронно читает следующий батч (для воркера).</summary>
    IAsyncEnumerable<TelemetryBatchDto> ReadAllAsync(CancellationToken ct);
}

using System.Threading.Channels;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Bounded-канал для батчей телеметрии. Singleton — один shared instance
/// для эндпоинта и для TelemetryWorker.
/// </summary>
public class TelemetryQueue : ITelemetryQueue
{
    // 1024 пакетов — около ~30 МБ при типичном размере батча 30 КБ.
    // Если переполнено — TryEnqueue вернёт false, endpoint отдаст 503.
    private const int CAPACITY = 1024;

    private readonly Channel<TelemetryBatchDto> _channel = Channel.CreateBounded<TelemetryBatchDto>(
        new BoundedChannelOptions(CAPACITY)
        {
            FullMode = BoundedChannelFullMode.DropWrite, // переполненный канал не блокирует писателя
            SingleReader = true,
            SingleWriter = false,
        });

    public bool TryEnqueue(TelemetryBatchDto batch) => _channel.Writer.TryWrite(batch);

    public IAsyncEnumerable<TelemetryBatchDto> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}

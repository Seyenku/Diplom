namespace KosmosCore.Business.DTOs.Requests;

/// <summary>Пакет событий телеметрии от клиента.</summary>
public class TelemetryBatchDto
{
    public List<TelemetryEventDto> Events { get; init; } = [];
}

/// <summary>Одно событие телеметрии.</summary>
public class TelemetryEventDto
{
    public string  SessionId  { get; init; } = string.Empty;
    public string  ActionType { get; init; } = string.Empty;
    public int?    TargetId   { get; init; }
    public string? CreatedAt  { get; init; }
    public string? Details    { get; init; }
}

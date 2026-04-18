namespace KosmosCore.Business.DTOs.Requests;

/// <summary>Payload для синхронизации сохранения с клиента.</summary>
public sealed class PlayerSaveSyncRequestDto
{
    public string DeviceId { get; init; } = string.Empty;
    public string SaveJson { get; init; } = string.Empty;
}


namespace KosmosCore.Business.DTOs.Responses;

/// <summary>
/// Серверно-настраиваемые параметры баланса (LiveOps).
/// Читаются из таблицы GameSettings и прокидываются на клиент в бутстрапе.
/// </summary>
public class LiveOpsDto
{
    public int FlightDurationS   { get; init; } = 60;
    public int MinigameDurationS { get; init; } = 30;
    public int UnlockBaseCost    { get; init; } = 5;
    public float CrystalFlightBonus { get; init; } = 1.0f;
}

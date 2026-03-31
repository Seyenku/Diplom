using System.Collections.Generic;

namespace KosmosCore.Business.DTOs.Responses;

public class GameInitDto
{
    public IReadOnlyList<PlanetDto>    Catalog        { get; init; } = [];
    public GameSettingsDto             DefaultSettings { get; init; } = GameSettingsDto.Default;
}

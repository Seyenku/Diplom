using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IPlayerSaveStore
{
    Task<PlayerSaveRecord> UpsertAsync(string deviceId, string saveJson, CancellationToken ct = default);
    Task<PlayerSaveRecord?> GetByDeviceIdAsync(string deviceId, CancellationToken ct = default);
    Task<IReadOnlyList<PlayerSaveRecord>> GetRecentAsync(int take = 100, bool includePayload = false, CancellationToken ct = default);
    Task<PlayerSaveStatsDto> GetStatsAsync(CancellationToken ct = default);
}


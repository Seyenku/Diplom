using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IShipUpgradeRepository
{
    /// <summary>Возвращает все апгрейды корабля (кэшируется в памяти).</summary>
    Task<IReadOnlyList<ShipUpgrade>> GetAllAsync(CancellationToken ct = default);
}

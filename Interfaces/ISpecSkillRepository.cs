using KosmosCore.Models;

namespace KosmosCore.Interfaces;

public interface ISpecSkillRepository
{
    Task AddSpecSkillAsync(int specId, int planetId, CancellationToken ct = default);
}

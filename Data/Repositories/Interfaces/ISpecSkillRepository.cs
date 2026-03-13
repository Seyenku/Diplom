namespace KosmosCore.Data.Repositories.Interfaces;

public interface ISpecSkillRepository
{
    Task AddSpecSkillAsync(int specId, int planetId, CancellationToken ct = default);
}

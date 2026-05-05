using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

/// <summary>
/// Репозиторий единственного admin-аккаунта.
/// Регистрация не предусмотрена — CreateUserAsync удалён.
/// </summary>
public interface IUserRepository
{
    Task<User?> GetUserByUsernameAsync(string username, CancellationToken ct = default);
    Task<bool>  UserExistsAsync(string username, CancellationToken ct = default);
    Task<IReadOnlyList<User>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<AdminRole>> GetRolesAsync(CancellationToken ct = default);
    Task CreateAdminAsync(string login, string passwordHash, int roleId, CancellationToken ct = default);
    Task UpdateAdminAsync(int id, string login, int roleId, string? passwordHash = null, CancellationToken ct = default);
    Task DeleteAdminAsync(int id, CancellationToken ct = default);
}

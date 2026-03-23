using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

/// <summary>
/// Репозиторий единственного admin-аккаунта.
/// Регистрация не предусмотрена — CreateUserAsync удалён.
/// </summary>
public interface IUserRepository
{
    Task<User?> AuthenticateAsync(string username, string passwordHash, CancellationToken ct = default);
    Task<bool>  UserExistsAsync(string username, CancellationToken ct = default);
}

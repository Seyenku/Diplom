using KosmosCore.Data.Models;

namespace KosmosCore.Data.Repositories.Interfaces;

public interface IUserRepository
{
    Task<User?> AuthenticateAsync(string username, string passwordHash, CancellationToken ct = default);
    Task<bool> UserExistsAsync(string username, CancellationToken ct = default);
    Task CreateUserAsync(string username, string passwordHash, int role = 0, CancellationToken ct = default);
}

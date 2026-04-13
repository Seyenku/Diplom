using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class UserRepository(IDbConnection db, ILogger<UserRepository> logger) : IUserRepository
{

    public async Task<User?> AuthenticateAsync(string username, string passwordHash, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT Id           AS Id,
                       Login        AS Login,
                       PasswordHash AS PasswordHash,
                       RoleId       AS RoleId
                FROM dbo.Admins
                WHERE Login = @Username AND PasswordHash = @PasswordHash";

            return await db.QuerySingleOrDefaultAsync<User>(
                new CommandDefinition(sql, new { Username = username, PasswordHash = passwordHash }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while authenticating user {Username}", username);
            throw;
        }
    }

    public async Task<bool> UserExistsAsync(string username, CancellationToken ct = default)
    {
        try
        {
            const string sql = "SELECT COUNT(1) FROM dbo.Admins WHERE Login = @Username";
            var count = await db.ExecuteScalarAsync<int>(
                new CommandDefinition(sql, new { Username = username }, cancellationToken: ct));
            return count > 0;
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while checking user existence {Username}", username);
            throw;
        }
    }
}

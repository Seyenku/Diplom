using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class UserRepository(IDbConnection db, ILogger<UserRepository> logger) : IUserRepository
{

    public async Task<User?> GetUserByUsernameAsync(string username, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT a.Id           AS Id,
                       a.Login        AS Login,
                       a.PasswordHash AS PasswordHash,
                       a.RoleId       AS RoleId,
                       r.RoleName     AS RoleName
                FROM dbo.Admins a
                LEFT JOIN dbo.AdminRoles r ON a.RoleId = r.Id
                WHERE a.Login = @Username";

            return await db.QuerySingleOrDefaultAsync<User>(
                new CommandDefinition(sql, new { Username = username }, cancellationToken: ct));
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

    public async Task<IReadOnlyList<User>> GetAllAsync(CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT a.Id           AS Id,
                       a.Login        AS Login,
                       a.PasswordHash AS PasswordHash,
                       a.RoleId       AS RoleId,
                       r.RoleName     AS RoleName
                FROM dbo.Admins a
                LEFT JOIN dbo.AdminRoles r ON a.RoleId = r.Id
                ORDER BY a.Id";

            var result = await db.QueryAsync<User>(
                new CommandDefinition(sql, cancellationToken: ct));
            return result.ToList().AsReadOnly();
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while loading admin users");
            throw;
        }
    }

    public async Task<IReadOnlyList<AdminRole>> GetRolesAsync(CancellationToken ct = default)
    {
        try
        {
            const string sql = "SELECT Id, RoleName FROM dbo.AdminRoles ORDER BY Id";
            var result = await db.QueryAsync<AdminRole>(
                new CommandDefinition(sql, cancellationToken: ct));
            return result.ToList().AsReadOnly();
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while loading admin roles");
            throw;
        }
    }

    public async Task CreateAdminAsync(string login, string passwordHash, int roleId, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT INTO dbo.Admins (Login, PasswordHash, RoleId)
                VALUES (@Login, @PasswordHash, @RoleId);";

            await db.ExecuteAsync(new CommandDefinition(sql, new { Login = login, PasswordHash = passwordHash, RoleId = roleId }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while creating admin user {Login}", login);
            throw;
        }
    }

    public async Task UpdateAdminAsync(int id, string login, int roleId, string? passwordHash = null, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                UPDATE dbo.Admins
                   SET Login = @Login,
                       RoleId = @RoleId,
                       PasswordHash = COALESCE(@PasswordHash, PasswordHash)
                 WHERE Id = @Id;";

            await db.ExecuteAsync(new CommandDefinition(sql, new { Id = id, Login = login, RoleId = roleId, PasswordHash = passwordHash }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while updating admin user {Id}", id);
            throw;
        }
    }

    public async Task DeleteAdminAsync(int id, CancellationToken ct = default)
    {
        try
        {
            const string sql = "DELETE FROM dbo.Admins WHERE Id = @Id";
            await db.ExecuteAsync(new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error while deleting admin user {Id}", id);
            throw;
        }
    }
}

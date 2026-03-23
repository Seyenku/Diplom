using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class UserRepository : IUserRepository
{
    private readonly IDbConnection _db;
    private readonly ILogger<UserRepository> _logger;

    public UserRepository(IDbConnection db, ILogger<UserRepository> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task<User?> AuthenticateAsync(string username, string passwordHash, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT id        AS Id,
                       login     AS Login,
                       pass_hash AS PassHash,
                       role      AS Role
                FROM dbo.users
                WHERE login = @Username AND pass_hash = @PasswordHash";

            return await _db.QuerySingleOrDefaultAsync<User>(
                new CommandDefinition(sql, new { Username = username, PasswordHash = passwordHash }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error while authenticating user {Username}", username);
            throw;
        }
    }

    public async Task<bool> UserExistsAsync(string username, CancellationToken ct = default)
    {
        try
        {
            const string sql = "SELECT COUNT(1) FROM dbo.users WHERE login = @Username";
            var count = await _db.ExecuteScalarAsync<int>(
                new CommandDefinition(sql, new { Username = username }, cancellationToken: ct));
            return count > 0;
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "SQL error while checking user existence {Username}", username);
            throw;
        }
    }
}

using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Logging;
using KosmosCore.Interfaces;
using KosmosCore.Models;

namespace KosmosCore.Repositories;

public class UserRepository : IUserRepository
{
    private readonly IDbConnection _dbConnection;
    private readonly ILogger<UserRepository> _logger;

    public UserRepository(IDbConnection dbConnection, ILogger<UserRepository> logger)
    {
        _dbConnection = dbConnection;
        _logger = logger;
    }

    public async Task<User?> AuthenticateAsync(string username, string passwordHash, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                SELECT id AS Id, login AS Login, pass AS Pass, role AS Role
                FROM users 
                WHERE login = @Username AND pass = @PasswordHash";

            return await _dbConnection.QuerySingleOrDefaultAsync<User>(
                new CommandDefinition(sql, new { Username = username, PasswordHash = passwordHash }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while authenticating user {Username}.", username);
            throw;
        }
    }

    public async Task<bool> UserExistsAsync(string username, CancellationToken ct = default)
    {
        try
        {
            const string sql = "SELECT COUNT(1) FROM users WHERE login = @Username";
            var count = await _dbConnection.ExecuteScalarAsync<int>(
                new CommandDefinition(sql, new { Username = username }, cancellationToken: ct));
            return count > 0;
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while checking if user {Username} exists.", username);
            throw;
        }
    }

    public async Task CreateUserAsync(string username, string passwordHash, int role = 0, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT INTO users (login, pass, role) 
                VALUES (@Username, @PasswordHash, @Role)";

            await _dbConnection.ExecuteAsync(
                new CommandDefinition(sql, new { Username = username, PasswordHash = passwordHash, Role = role }, cancellationToken: ct));
        }
        catch (DbException ex)
        {
            _logger.LogError(ex, "A SQL error occurred while creating user {Username}.", username);
            throw;
        }
    }
}

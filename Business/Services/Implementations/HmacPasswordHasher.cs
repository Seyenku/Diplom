using System.Security.Cryptography;
using System.Text;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

public class HmacPasswordHasher : IPasswordHasher
{
    private readonly byte[] _key;

    public HmacPasswordHasher(IConfiguration configuration)
    {
        var hmacKey = configuration["Security:HmacKey"]
            ?? throw new InvalidOperationException("Security:HmacKey is not configured.");
        _key = Encoding.UTF8.GetBytes(hmacKey);
    }

    public string HashPassword(string password)
    {
        using var hmac = new HMACSHA256(_key);
        byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(password));
        var sb = new StringBuilder(hash.Length * 2);
        foreach (byte b in hash)
            sb.AppendFormat("{0:x2}", b);
        return sb.ToString();
    }

    public bool VerifyPassword(string password, string hash)
    {
        var computed = HashPassword(password);
        return string.Equals(computed, hash, StringComparison.OrdinalIgnoreCase);
    }
}

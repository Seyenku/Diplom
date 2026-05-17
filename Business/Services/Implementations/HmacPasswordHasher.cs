using System.Security.Cryptography;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Хеширование паролей по алгоритму PBKDF2 с HMAC-SHA256 (600 000 итераций).
/// Формат хранения: Base64(salt[16] + hash[32]) — 64 байта → 88 символов Base64.
/// </summary>
public class HmacPasswordHasher : IPasswordHasher
{
    private const int SaltSize = 16;       // 128 бит
    private const int HashSize = 32;       // 256 бит
    private const int Iterations = 600_000; // OWASP рекомендация для HMAC-SHA256

    public string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);

        byte[] hash = KeyDerivation.Pbkdf2(
            password: password,
            salt: salt,
            prf: KeyDerivationPrf.HMACSHA256,
            iterationCount: Iterations,
            numBytesRequested: HashSize);

        // salt + hash → единая строка Base64
        byte[] result = new byte[SaltSize + HashSize];
        Buffer.BlockCopy(salt, 0, result, 0, SaltSize);
        Buffer.BlockCopy(hash, 0, result, SaltSize, HashSize);

        return Convert.ToBase64String(result);
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        byte[] decoded;
        try
        {
            decoded = Convert.FromBase64String(storedHash);
        }
        catch (FormatException)
        {
            return false;
        }

        if (decoded.Length != SaltSize + HashSize)
            return false;

        byte[] salt = decoded[..SaltSize];
        byte[] expectedHash = decoded[SaltSize..];

        byte[] actualHash = KeyDerivation.Pbkdf2(
            password: password,
            salt: salt,
            prf: KeyDerivationPrf.HMACSHA256,
            iterationCount: Iterations,
            numBytesRequested: HashSize);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}

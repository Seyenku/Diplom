namespace KosmosCore.Data.Models;

/// <summary>Аккаунт администратора. Используется для входа в кабинет.</summary>
public class User
{
    public int    Id       { get; set; }
    public string Login    { get; set; } = string.Empty;
    public string PassHash { get; set; } = string.Empty;  // HMAC-SHA256 hex
    public int    Role     { get; set; } // 1 = admin
}

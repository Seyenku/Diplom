namespace KosmosCore.Data.Models;

/// <summary>Аккаунт администратора. Используется для входа в кабинет.</summary>
public class User
{
    public int    Id           { get; set; }
    public string Login        { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;  // HMAC-SHA256 hex
    public int    RoleId       { get; set; }
    public string RoleName     { get; set; } = string.Empty;
}

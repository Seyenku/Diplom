namespace KosmosCore.Data.Models;

/// <summary>Роль администратора (SuperAdmin, Admin).</summary>
public class AdminRole
{
    public int    Id       { get; set; }
    public string RoleName { get; set; } = string.Empty; // 'SuperAdmin' | 'Admin'
}

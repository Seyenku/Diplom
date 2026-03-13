namespace KosmosCore.Data.Models;

public class User
{
    public int Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string Pass { get; set; } = string.Empty;
    public int Role { get; set; } // 0 = user, 1 = admin
}

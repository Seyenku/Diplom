namespace KosmosCore.Data.Models;

/// <summary>Навык (Hard или Soft).</summary>
public class Skill
{
    public int    Id        { get; set; }
    public string Name      { get; set; } = string.Empty;
    public string SkillType { get; set; } = string.Empty; // 'Hard' | 'Soft'
}

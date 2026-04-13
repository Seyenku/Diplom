namespace KosmosCore.Business.DTOs.Responses;

public class PlanetDto
{
    public string Id          { get; init; } = string.Empty;
    public string Name        { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;

    /// <summary>Идентификатор кластера: "programming" | "medicine" | "geology".</summary>
    public string ClusterId   { get; init; } = string.Empty;

    /// <summary>Отображаемое название кластера: «Туманность Кибернетики».</summary>
    public string ClusterName { get; init; } = string.Empty;

    /// <summary>Тип кристалла кластера: "programming" | "medicine" | "geology".</summary>
    public string CrystalType { get; init; } = string.Empty;

    /// <summary>Стоимость открытия планеты в кристаллах кластера.</summary>
    public int UnlockCost     { get; init; }

    /// <summary>Hard skills, необходимые для профессии.</summary>
    public string[] HardSkills { get; init; } = [];

    /// <summary>Soft skills.</summary>
    public string[] SoftSkills { get; init; } = [];

    /// <summary>Риски профессии (автоматизация, устаревание и т.п.).</summary>
    public string[] Risks { get; init; } = [];

    /// <summary>Открыта ли планета по умолчанию (видна без оплаты кристаллов).</summary>
    public bool IsStarterVisible { get; init; }
}

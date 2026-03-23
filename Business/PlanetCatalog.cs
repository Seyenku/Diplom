using KosmosCore.Models.ViewModels;

namespace KosmosCore.Business;

/// <summary>
/// Статический каталог планет-профессий будущего.
/// В будущем может быть вынесен в БД через IPlanetRepository.
/// Данные берутся из project.txt (список профессий будущего).
/// </summary>
public static class PlanetCatalog
{
    private static readonly List<PlanetDto> _planets =
    [
        new PlanetDto
        {
            Id = "ai-architect", Name = "AI-архитектор",
            Category = "technology",
            Description = "Проектирует архитектуры искусственного интеллекта, выбирает модели, оркестрирует ML-пайплайны и обеспечивает масштабируемость AI-систем.",
            HardSkills = ["Machine Learning", "System Design", "Python/C++", "MLOps"],
            SoftSkills = ["Системное мышление", "Коммуникация с командой", "Управление неопределённостью"],
            CrystalRequirements = new Dictionary<string, int> { ["it"] = 5, ["math"] = 3 },
            Risks = ["Быстрое устаревание технологий", "Высокая конкуренция"],
            IsStarterVisible = true
        },
        new PlanetDto
        {
            Id = "big-data-analyst", Name = "Big Data Analyst",
            Category = "technology",
            Description = "Анализирует огромные массивы данных, строит модели и выдаёт инсайты для бизнес-решений.",
            HardSkills = ["SQL/NoSQL", "Python/R", "Spark", "Визуализация данных"],
            SoftSkills = ["Аналитическое мышление", "Презентация результатов"],
            CrystalRequirements = new Dictionary<string, int> { ["it"] = 4, ["math"] = 4 },
            Risks = ["Автоматизация базовой аналитики AI-инструментами"]
        },
        new PlanetDto
        {
            Id = "it-geneticist", Name = "ИТ-генетик",
            Category = "biotech",
            Description = "Совмещает биоинформатику и программирование для анализа геномных данных и разработки персонализированных методов лечения.",
            HardSkills = ["Биоинформатика", "Python/R", "CRISPR-аналитика", "Геномика"],
            SoftSkills = ["Этическое мышление", "Межпрофессиональное взаимодействие"],
            CrystalRequirements = new Dictionary<string, int> { ["bio"] = 5, ["it"] = 3 },
            Risks = ["Строгое регулирование отрасли", "Длинный цикл исследований"]
        },
        new PlanetDto
        {
            Id = "quantum-engineer", Name = "Квантовый инженер",
            Category = "technology",
            Description = "Разрабатывает квантовые алгоритмы и аппаратные реализации квантовых вычислений.",
            HardSkills = ["Квантовая физика", "Qiskit/Cirq", "Линейная алгебра", "C++"],
            SoftSkills = ["Абстрактное мышление", "Терпение в исследованиях"],
            CrystalRequirements = new Dictionary<string, int> { ["physics"] = 5, ["math"] = 4, ["it"] = 2 },
            Risks = ["Технология на раннем этапе развития", "Очень высокий порог входа"]
        },
        new PlanetDto
        {
            Id = "cybersecurity-curator", Name = "Куратор информационной безопасности",
            Category = "technology",
            Description = "Выстраивает политику ИБ организации, управляет рисками и реагирует на инциденты.",
            HardSkills = ["Penetration Testing", "SOC", "ISO 27001", "Сети и протоколы"],
            SoftSkills = ["Управление рисками", "Лидерство", "Коммуникация"],
            CrystalRequirements = new Dictionary<string, int> { ["it"] = 4, ["law"] = 2 },
            Risks = ["Постоянное обновление угроз"],
            IsStarterVisible = true
        },
        new PlanetDto
        {
            Id = "ux-designer", Name = "Дизайнер интерфейсов",
            Category = "design",
            Description = "Проектирует пользовательский опыт цифровых продуктов: исследует потребности, создаёт прототипы и тестирует решения.",
            HardSkills = ["Figma/Sketch", "UX-исследования", "Прототипирование", "A/B тестирование"],
            SoftSkills = ["Эмпатия", "Критическое мышление", "Презентация"],
            CrystalRequirements = new Dictionary<string, int> { ["design"] = 5, ["it"] = 2 },
            Risks = ["Автоматизация части задач AI-инструментами"],
            IsStarterVisible = true
        },
        new PlanetDto
        {
            Id = "tissue-engineer", Name = "Тканевый инженер",
            Category = "medicine",
            Description = "Создаёт биоискусственные ткани и органы для трансплантологии и регенеративной медицины.",
            HardSkills = ["Клеточная биология", "3D-биопечать", "Биоматериалы", "Регенеративная медицина"],
            SoftSkills = ["Внимание к деталям", "Работа в лаборатории", "Этика"],
            CrystalRequirements = new Dictionary<string, int> { ["bio"] = 6, ["chem"] = 3 },
            Risks = ["Строгие регуляторные требования", "Долгий путь к применению"]
        },
        new PlanetDto
        {
            Id = "gmo-agronomist", Name = "ГМО-агроном",
            Category = "ecology",
            Description = "Разрабатывает и внедряет генетически модифицированные культуры для устойчивого сельского хозяйства.",
            HardSkills = ["Генетика растений", "CRISPR", "Агрономия", "Экология"],
            SoftSkills = ["Системное мышление", "Работа с данными полевых экспериментов"],
            CrystalRequirements = new Dictionary<string, int> { ["bio"] = 4, ["eco"] = 3 },
            Risks = ["Общественное недоверие", "Правовые ограничения в ряде стран"]
        },
        new PlanetDto
        {
            Id = "personalized-medicine-doctor", Name = "Врач персонифицированной медицины",
            Category = "medicine",
            Description = "Разрабатывает индивидуальные схемы лечения на основе генетического профиля и данных биомаркеров пациента.",
            HardSkills = ["Геномика", "Клиническая медицина", "Биоинформатика", "Фармакогеномика"],
            SoftSkills = ["Эмпатия", "Принятие решений в условиях неопределённости"],
            CrystalRequirements = new Dictionary<string, int> { ["bio"] = 5, ["med"] = 5 },
            Risks = ["Доступность дорогостоящих технологий"]
        },
        new PlanetDto
        {
            Id = "neuroinformatician", Name = "Нейроинформатик",
            Category = "neuroscience",
            Description = "Обрабатывает и интерпретирует данные нейровизуализации (fMRI, ЭЭГ) для понимания работы мозга.",
            HardSkills = ["Python/MATLAB", "Нейровизуализация", "Статистика", "ML"],
            SoftSkills = ["Терпеливость", "Аналитическое мышление"],
            CrystalRequirements = new Dictionary<string, int> { ["neuro"] = 5, ["it"] = 3, ["math"] = 3 },
            Risks = ["Узкая специализация", "Зависимость от грантового финансирования"]
        },
        new PlanetDto
        {
            Id = "data-engineer", Name = "Инженер данных (Data Engineer)",
            Category = "technology",
            Description = "Строит и обслуживает инфраструктуру для сбора, хранения и обработки больших объёмов данных.",
            HardSkills = ["Apache Spark/Kafka", "SQL/NoSQL", "Cloud (AWS/GCP/Azure)", "Python"],
            SoftSkills = ["Надёжность", "Документирование", "Коммуникация с аналитиками"],
            CrystalRequirements = new Dictionary<string, int> { ["it"] = 5, ["math"] = 2 },
            Risks = ["Быстрое изменение технологического ландшафта"],
            IsStarterVisible = false
        },
    ];

    public static IReadOnlyList<PlanetDto> GetAll() => _planets.AsReadOnly();

    public static PlanetDto? GetById(string id)
        => _planets.FirstOrDefault(p => p.Id == id);
}

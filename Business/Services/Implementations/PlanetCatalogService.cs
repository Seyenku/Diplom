using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Business.Services.Interfaces;

namespace KosmosCore.Business.Services.Implementations;

/// <summary>
/// Статический каталог планет-профессий будущего. 3 кластера-туманности:
///   Программирование (14 планет), Медицина (12), Геология (5).
/// Данные берутся из project.txt (список профессий будущего).
/// </summary>
public class PlanetCatalogService : IPlanetCatalogService
{
    // ── Кластеры ────────────────────────────────────────────────────────────

    private static readonly List<ClusterDto> _clusters =
    [
        new ClusterDto { Id = 1, Name = "programming", DisplayName = "Туманность Кибернетики", CrystalType = "programming", Description = "Кластер IT и Data — технологии будущего, ИИ, кибербезопасность и инженерия данных." },
        new ClusterDto { Id = 2, Name = "medicine",    DisplayName = "Туманность Целителей",   CrystalType = "medicine",    Description = "Кластер биомедицины и нейронаук — персонализированная медицина, генетика и нейромоделирование." },
        new ClusterDto { Id = 3, Name = "geology",     DisplayName = "Туманность Геодезистов", CrystalType = "geology",     Description = "Кластер экологии и среды — киберфизические системы, умные среды и виртуальное прототипирование." },
    ];

    // ── Планеты ─────────────────────────────────────────────────────────────

    private static readonly List<PlanetDto> _planets =
    [
        // ═══ Туманность Кибернетики (programming) — 14 планет ═══════════════
        new() {
            Id = "ai-architect", Name = "AI-архитектор",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Проектирует архитектуры искусственного интеллекта, выбирает модели, оркестрирует ML-пайплайны и обеспечивает масштабируемость AI-систем.",
            HardSkills = ["Machine Learning", "System Design", "Python/C++", "MLOps"],
            SoftSkills = ["Системное мышление", "Коммуникация с командой", "Управление неопределённостью"],
            UnlockCost = 5,
            Risks = ["Быстрое устаревание технологий", "Высокая конкуренция"],
            IsStarterVisible = true
        },
        new() {
            Id = "big-data-analyst", Name = "Big Data Analyst",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Анализирует огромные массивы данных, строит модели и выдаёт инсайты для бизнес-решений.",
            HardSkills = ["SQL/NoSQL", "Python/R", "Spark", "Визуализация данных"],
            SoftSkills = ["Аналитическое мышление", "Презентация результатов"],
            UnlockCost = 6,
            Risks = ["Автоматизация базовой аналитики AI-инструментами"]
        },
        new() {
            Id = "info-systems-architect", Name = "Архитектор информационных систем",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Проектирует архитектуру крупных информационных систем, определяет стек технологий и обеспечивает интеграцию компонентов.",
            HardSkills = ["Системный анализ", "UML/BPMN", "Cloud Architecture", "Микросервисы"],
            SoftSkills = ["Стратегическое мышление", "Переговоры с заказчиком"],
            UnlockCost = 7,
            Risks = ["Высокая ответственность за архитектурные решения"]
        },
        new() {
            Id = "ux-designer", Name = "Дизайнер интерфейсов",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Проектирует пользовательский опыт цифровых продуктов: исследует потребности, создаёт прототипы и тестирует решения.",
            HardSkills = ["Figma/Sketch", "UX-исследования", "Прототипирование", "A/B тестирование"],
            SoftSkills = ["Эмпатия", "Критическое мышление", "Презентация"],
            UnlockCost = 4,
            Risks = ["Автоматизация части задач AI-инструментами"],
            IsStarterVisible = true
        },
        new() {
            Id = "it-auditor", Name = "ИТ-аудитор",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Проверяет информационные системы организации на соответствие стандартам безопасности и эффективности.",
            HardSkills = ["ISO 27001", "COBIT", "Сетевые технологии", "Анализ рисков"],
            SoftSkills = ["Внимательность к деталям", "Коммуникация", "Объективность"],
            UnlockCost = 5,
            Risks = ["Рутинность при проверках стандартных систем"]
        },
        new() {
            Id = "data-engineer", Name = "Инженер данных",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Строит и обслуживает инфраструктуру для сбора, хранения и обработки больших объёмов данных.",
            HardSkills = ["Apache Spark/Kafka", "SQL/NoSQL", "Cloud (AWS/GCP/Azure)", "Python"],
            SoftSkills = ["Надёжность", "Документирование", "Коммуникация с аналитиками"],
            UnlockCost = 6,
            Risks = ["Быстрое изменение технологического ландшафта"]
        },
        new() {
            Id = "iot-engineer", Name = "Инженер-разработчик IoT",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Разрабатывает программное и аппаратное обеспечение для Интернета вещей — датчики, контроллеры и облачные платформы.",
            HardSkills = ["Embedded C/C++", "MQTT/CoAP", "Электроника", "Облачные платформы IoT"],
            SoftSkills = ["Инженерная изобретательность", "Работа с датчиками"],
            UnlockCost = 7,
            Risks = ["Уязвимости безопасности IoT-устройств"]
        },
        new() {
            Id = "quantum-engineer", Name = "Квантовый инженер",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Разрабатывает квантовые алгоритмы и аппаратные реализации квантовых вычислений.",
            HardSkills = ["Квантовая физика", "Qiskit/Cirq", "Линейная алгебра", "C++"],
            SoftSkills = ["Абстрактное мышление", "Терпение в исследованиях"],
            UnlockCost = 10,
            Risks = ["Технология на раннем этапе развития", "Очень высокий порог входа"]
        },
        new() {
            Id = "cyberneticist", Name = "Кибернетик",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Исследует и моделирует сложные системы управления — от роботов до экономических моделей, применяя принципы обратной связи.",
            HardSkills = ["Теория управления", "Моделирование систем", "MATLAB/Simulink", "Python"],
            SoftSkills = ["Системное мышление", "Междисциплинарность"],
            UnlockCost = 8,
            Risks = ["Узкая академическая специализация"]
        },
        new() {
            Id = "cybersecurity-curator", Name = "Куратор информационной безопасности",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Выстраивает политику ИБ организации, управляет рисками и реагирует на инциденты.",
            HardSkills = ["Penetration Testing", "SOC", "ISO 27001", "Сети и протоколы"],
            SoftSkills = ["Управление рисками", "Лидерство", "Коммуникация"],
            UnlockCost = 5,
            Risks = ["Постоянное обновление угроз"],
            IsStarterVisible = true
        },
        new() {
            Id = "dispatcher-systems-dev", Name = "Разработчик систем диспетчеризации",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Создаёт системы мониторинга и управления сложными объектами: энергосети, транспорт, производства.",
            HardSkills = ["SCADA", "PLC-программирование", "Сетевые протоколы", "БД реального времени"],
            SoftSkills = ["Ответственность", "Работа в режиме 24/7"],
            UnlockCost = 7,
            Risks = ["Критическая инфраструктура — высокая ответственность"]
        },
        new() {
            Id = "bigdata-model-dev", Name = "Разработчик моделей Big Data",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Создаёт и оптимизирует предиктивные модели для работы с большими данными в бизнес- и научной среде.",
            HardSkills = ["Python/Scala", "TensorFlow/PyTorch", "Feature Engineering", "Статистика"],
            SoftSkills = ["Терпение", "Навык визуализации данных"],
            UnlockCost = 8,
            Risks = ["Зависимость от качества данных"]
        },
        new() {
            Id = "ai-specialist", Name = "Специалист по ИИ",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Разрабатывает и внедряет алгоритмы искусственного интеллекта для автоматизации процессов и принятия решений.",
            HardSkills = ["Deep Learning", "NLP", "Computer Vision", "Python"],
            SoftSkills = ["Научный подход", "Критическое мышление"],
            UnlockCost = 6,
            Risks = ["Этические дилеммы AI", "Регуляторные риски"]
        },
        new() {
            Id = "cv-specialist", Name = "Специалист по компьютерному зрению",
            ClusterId = "programming", ClusterName = "Туманность Кибернетики", CrystalType = "programming",
            Description = "Разрабатывает алгоритмы распознавания и анализа изображений и видео для роботов, медицины и безопасности.",
            HardSkills = ["OpenCV", "Deep Learning (CNN)", "Python/C++", "3D Vision"],
            SoftSkills = ["Визуальное мышление", "Работа с данными"],
            UnlockCost = 7,
            Risks = ["Вопросы приватности и слежки"]
        },

        // ═══ Туманность Целителей (medicine) — 12 планет ════════════════════
        new() {
            Id = "personalized-medicine-doctor", Name = "Врач персонифицированной медицины",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Разрабатывает индивидуальные схемы лечения на основе генетического профиля и данных биомаркеров пациента.",
            HardSkills = ["Геномика", "Клиническая медицина", "Биоинформатика", "Фармакогеномика"],
            SoftSkills = ["Эмпатия", "Принятие решений в условиях неопределённости"],
            UnlockCost = 6,
            Risks = ["Доступность дорогостоящих технологий"],
            IsStarterVisible = true
        },
        new() {
            Id = "genetic-consultant", Name = "Генетический консультант",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Консультирует пациентов и семьи по вопросам генетических заболеваний, интерпретирует результаты генетических тестов.",
            HardSkills = ["Генетика человека", "Молекулярная биология", "Генетические тесты", "Статистика"],
            SoftSkills = ["Эмпатия", "Коммуникация сложной информации", "Этика"],
            UnlockCost = 5,
            Risks = ["Эмоциональная нагрузка", "Стигматизация генетических заболеваний"]
        },
        new() {
            Id = "gerontologist", Name = "Геронтолог",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Исследует процессы старения и разрабатывает методы продления активного долголетия.",
            HardSkills = ["Гериатрия", "Биохимия старения", "Клинические исследования", "Фармакология"],
            SoftSkills = ["Терпение", "Внимание к пожилым пациентам"],
            UnlockCost = 7,
            Risks = ["Длительные циклы исследований"]
        },
        new() {
            Id = "molecular-dietologist", Name = "Молекулярный диетолог",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Составляет персонализированные диеты на основе молекулярного анализа метаболизма и генома пациента.",
            HardSkills = ["Нутригеномика", "Биохимия", "Анализ данных", "Диетология"],
            SoftSkills = ["Индивидуальный подход", "Коммуникация"],
            UnlockCost = 5,
            Risks = ["Недостаток доказательной базы в некоторых областях"]
        },
        new() {
            Id = "neonatologist", Name = "Неонатолог",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Специализируется на лечении и выхаживании новорождённых, особенно недоношенных и с патологиями.",
            HardSkills = ["Неонатология", "Реанимация новорождённых", "УЗИ-диагностика", "Фармакотерапия"],
            SoftSkills = ["Стрессоустойчивость", "Эмпатия к семьям"],
            UnlockCost = 6,
            Risks = ["Высокая эмоциональная нагрузка"]
        },
        new() {
            Id = "medical-robot-operator", Name = "Оператор медицинских роботов",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Управляет роботизированными хирургическими и диагностическими системами в операционных и клиниках.",
            HardSkills = ["Робототехника", "Хирургия", "3D-навигация", "Программирование роботов"],
            SoftSkills = ["Хладнокровие", "Точность", "Командная работа"],
            UnlockCost = 8,
            Risks = ["Технические сбои в критический момент"]
        },
        new() {
            Id = "tissue-engineer", Name = "Тканевый инженер",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Создаёт биоискусственные ткани и органы для трансплантологии и регенеративной медицины.",
            HardSkills = ["Клеточная биология", "3D-биопечать", "Биоматериалы", "Регенеративная медицина"],
            SoftSkills = ["Внимание к деталям", "Работа в лаборатории", "Этика"],
            UnlockCost = 9,
            Risks = ["Строгие регуляторные требования", "Долгий путь к применению"]
        },
        new() {
            Id = "bioinformatician", Name = "Биоинформатик",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Анализирует биологические данные (геномы, протеомы) с помощью вычислительных методов для медицинских исследований.",
            HardSkills = ["Python/R", "Геномика", "Алгоритмы выравнивания", "Базы данных биоданных"],
            SoftSkills = ["Аналитическое мышление", "Междисциплинарность"],
            UnlockCost = 6,
            Risks = ["Нехватка стандартизированных данных"]
        },
        new() {
            Id = "it-geneticist", Name = "ИТ-генетик",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Совмещает биоинформатику и программирование для анализа геномных данных и разработки персонализированных методов лечения.",
            HardSkills = ["Биоинформатика", "Python/R", "CRISPR-аналитика", "Геномика"],
            SoftSkills = ["Этическое мышление", "Межпрофессиональное взаимодействие"],
            UnlockCost = 7,
            Risks = ["Строгое регулирование отрасли", "Длинный цикл исследований"]
        },
        new() {
            Id = "clinical-bioinformatician", Name = "Клинический биоинформатик",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Применяет биоинформатику непосредственно в клинической практике — интерпретация генетических тестов для врачей и пациентов.",
            HardSkills = ["Клиническая генетика", "NGS-анализ", "Базы патогенных вариантов", "Python"],
            SoftSkills = ["Коммуникация с врачами", "Ответственность за диагноз"],
            UnlockCost = 8,
            Risks = ["Ошибки интерпретации могут повлиять на лечение"]
        },
        new() {
            Id = "neuroinformatician", Name = "Нейроинформатик",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Обрабатывает и интерпретирует данные нейровизуализации (fMRI, ЭЭГ) для понимания работы мозга.",
            HardSkills = ["Python/MATLAB", "Нейровизуализация", "Статистика", "ML"],
            SoftSkills = ["Терпеливость", "Аналитическое мышление"],
            UnlockCost = 7,
            Risks = ["Узкая специализация", "Зависимость от грантового финансирования"]
        },
        new() {
            Id = "neuromodeling-specialist", Name = "Специалист по нейромоделированию",
            ClusterId = "medicine", ClusterName = "Туманность Целителей", CrystalType = "medicine",
            Description = "Создаёт компьютерные модели нейронных сетей мозга для исследования когнитивных функций и заболеваний.",
            HardSkills = ["NEURON/NEST", "Python", "Вычислительная нейронаука", "Дифференциальные уравнения"],
            SoftSkills = ["Научная дотошность", "Визуализация сложных данных"],
            UnlockCost = 9,
            Risks = ["Разрыв между моделями и реальной биологией"]
        },

        // ═══ Туманность Геодезистов (geology) — 5 планет ════════════════════
        new() {
            Id = "gmo-agronomist", Name = "ГМО-агроном",
            ClusterId = "geology", ClusterName = "Туманность Геодезистов", CrystalType = "geology",
            Description = "Разрабатывает и внедряет генетически модифицированные культуры для устойчивого сельского хозяйства.",
            HardSkills = ["Генетика растений", "CRISPR", "Агрономия", "Экология"],
            SoftSkills = ["Системное мышление", "Работа с данными полевых экспериментов"],
            UnlockCost = 4,
            Risks = ["Общественное недоверие", "Правовые ограничения в ряде стран"],
            IsStarterVisible = true
        },
        new() {
            Id = "eco-safety-subsoil", Name = "Экологическая безопасность недропользования",
            ClusterId = "geology", ClusterName = "Туманность Геодезистов", CrystalType = "geology",
            Description = "Обеспечивает экологическую безопасность при добыче полезных ископаемых, минимизирует ущерб окружающей среде.",
            HardSkills = ["Экология", "Геология", "Мониторинг среды", "Законодательство в сфере недр"],
            SoftSkills = ["Ответственность", "Работа в полевых условиях"],
            UnlockCost = 5,
            Risks = ["Конфликт экономических и экологических интересов"]
        },
        new() {
            Id = "smart-env-cybertechnician", Name = "Кибертехник умных сред",
            ClusterId = "geology", ClusterName = "Туманность Геодезистов", CrystalType = "geology",
            Description = "Настраивает и обслуживает интеллектуальные системы зданий и городских сред: IoT-датчики, автоматизация, энергосбережение.",
            HardSkills = ["IoT-системы", "Автоматизация зданий", "Сетевые технологии", "Энергоменеджмент"],
            SoftSkills = ["Технический кругозор", "Работа в команде"],
            UnlockCost = 6,
            Risks = ["Зависимость от производителей оборудования"]
        },
        new() {
            Id = "cyberphysical-specialist", Name = "Специалист по киберфизическим системам",
            ClusterId = "geology", ClusterName = "Туманность Геодезистов", CrystalType = "geology",
            Description = "Проектирует системы, объединяющие вычислительные и физические компоненты — от «умных» фабрик до автопилотов.",
            HardSkills = ["Робототехника", "Системы реального времени", "Моделирование", "C/C++"],
            SoftSkills = ["Инженерное мышление", "Междисциплинарность"],
            UnlockCost = 7,
            Risks = ["Безопасность критических систем"]
        },
        new() {
            Id = "virtual-prototyping-specialist", Name = "Специалист по виртуальному прототипированию",
            ClusterId = "geology", ClusterName = "Туманность Геодезистов", CrystalType = "geology",
            Description = "Создаёт цифровые двойники физических объектов для тестирования и оптимизации без затрат на реальные прототипы.",
            HardSkills = ["CAD/CAE", "Симуляция (ANSYS, COMSOL)", "3D-моделирование", "Python"],
            SoftSkills = ["Пространственное мышление", "Точность"],
            UnlockCost = 8,
            Risks = ["Разрыв между моделью и реальным поведением"]
        },
    ];

    public IReadOnlyList<PlanetDto> GetAll() => _planets.AsReadOnly();

    public PlanetDto? GetById(string id)
        => _planets.FirstOrDefault(p => p.Id == id);

    public IReadOnlyList<ClusterDto> GetClusters()
    {
        // Дополняем PlanetCount
        return _clusters.Select(c => new ClusterDto
        {
            Id = c.Id,
            Name = c.Name,
            DisplayName = c.DisplayName,
            CrystalType = c.CrystalType,
            Description = c.Description,
            PlanetCount = _planets.Count(p => p.ClusterId == c.Name)
        }).ToList().AsReadOnly();
    }
}

-- ==============================================================================
-- MIGRATE: Наполнение Spec_Planet_Map по кластерам
-- ==============================================================================
-- Зачем: воронка абитуриента «результат игры -> направления подготовки» работает
-- через поле Professions (STRING_AGG из Planets по Spec_Planet_Map). Исходный сид
-- связывал только 5 планет по захардкоженным Id; здесь каждая планета (профессия)
-- привязывается к направлениям своего кластера:
--   programming -> 09.03.01 (Информатика и ВТ), 01.03.02 (Прикладная математика)
--   medicine    -> 31.05.01 (Лечебное дело),    06.03.01 (Биология)
--   geology     -> 05.03.06 (Экология и природопользование)
-- Идемпотентно: вставляются только отсутствующие пары; ручные правки сохраняются.
-- ==============================================================================

;WITH ClusterSpec AS (
    SELECT ClusterName, SpecCode FROM (VALUES
        (N'programming', N'09.03.01'),
        (N'programming', N'01.03.02'),
        (N'medicine',    N'31.05.01'),
        (N'medicine',    N'06.03.01'),
        (N'geology',     N'05.03.06')
    ) AS m(ClusterName, SpecCode)
)
INSERT INTO dbo.Spec_Planet_Map (SpecCode, PlanetId)
SELECT cs.SpecCode, p.Id
FROM dbo.Planets p
JOIN dbo.Clusters c             ON p.ClusterId = c.Id
JOIN ClusterSpec cs             ON cs.ClusterName = c.Name
JOIN dbo.BaseSpecializations bs ON bs.Code = cs.SpecCode
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Spec_Planet_Map existing
    WHERE existing.SpecCode = cs.SpecCode AND existing.PlanetId = p.Id
);
GO

PRINT N'Spec_Planet_Map filled by cluster mapping';
GO

using System.Data;
using System.Data.Common;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using KosmosCore.Business.DTOs.Requests;
using KosmosCore.Business.DTOs.Responses;
using KosmosCore.Data.Models;
using KosmosCore.Data.Repositories.Interfaces;

namespace KosmosCore.Data.Repositories.Implementations;

public class SpecRepository(IDbConnection db, IMemoryCache cache, ILogger<SpecRepository> logger) : ISpecRepository
{
    private const string CacheKey = "spec_directions";

    public async Task<IReadOnlyList<SpecDirectionDto>> GetAllDirectionsAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyList<SpecDirectionDto>? cached) && cached is not null)
            return cached;

        try
        {
            // 1. Основной запрос: программы + специальности + формы обучения + экзамены + профессии
            const string sqlPrograms = @"
                SELECT
                    bs.Code,
                    bs.Title,
                    p.Id           AS ProgramId,
                    ef.Name        AS EduForm,
                    p.YearsEduc,
                    p.Description,
                    p.Disciplines,
                    p.Spheres,
                    ISNULL((
                        SELECT STRING_AGG(s.Name, ', ')
                        FROM dbo.Program_Subjects_Map psm
                        JOIN dbo.Subjects s ON psm.SubjectId = s.Id
                        WHERE psm.ProgramId = p.Id
                    ), '') AS Exams,
                    ISNULL((
                        SELECT STRING_AGG(pl.Title, ', ')
                        FROM dbo.Spec_Planet_Map spm
                        JOIN dbo.Planets pl ON spm.PlanetId = pl.Id
                        WHERE spm.SpecCode = bs.Code
                    ), '') AS Professions
                FROM dbo.Programs p
                JOIN dbo.BaseSpecializations bs ON p.SpecCode = bs.Code
                JOIN dbo.EduForms ef ON p.FormId = ef.Id
                ORDER BY bs.Code, ef.Name";

            var programs = (await db.QueryAsync<SpecDirectionDto>(
                new CommandDefinition(sqlPrograms, cancellationToken: ct))).ToList();

            if (programs.Count == 0)
            {
                var empty = Array.Empty<SpecDirectionDto>().AsReadOnly();
                cache.Set(CacheKey, (IReadOnlyList<SpecDirectionDto>)empty, TimeSpan.FromMinutes(30));
                return empty;
            }

            // 2. Загружаем всю статистику приёма
            const string sqlStats = @"
                SELECT ProgramId, Year, Price, BudgetPlaces, MinPassingScore, AvgEgeScore
                FROM dbo.AdmissionStats
                ORDER BY ProgramId, Year DESC";

            var stats = (await db.QueryAsync<AdmissionStatsRow>(
                new CommandDefinition(sqlStats, cancellationToken: ct))).ToList();

            // 3. Группируем статистику по ProgramId
            var statsByProgram = stats.GroupBy(s => s.ProgramId)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(s => new AdmissionYearDto
                    {
                        Year            = s.Year,
                        Price           = s.Price,
                        BudgetPlaces    = s.BudgetPlaces,
                        MinPassingScore = s.MinPassingScore,
                        AvgEgeScore     = s.AvgEgeScore
                    }).ToList()
                );

            // 4. Привязываем историю приёма к каждой программе
            foreach (var program in programs)
            {
                if (statsByProgram.TryGetValue(program.ProgramId, out var history))
                    program.AdmissionHistory = history;
            }

            var result = programs.AsReadOnly();
            cache.Set(CacheKey, (IReadOnlyList<SpecDirectionDto>)result, TimeSpan.FromMinutes(30));
            return result;
        }
        catch (DbException ex)
        {
            logger.LogError(ex, "SQL error in SpecRepository.GetAllDirectionsAsync");
            throw;
        }
    }

    /// <summary>Внутренний класс для маппинга строк AdmissionStats через Dapper.</summary>
    public async Task<IReadOnlyList<EduForm>> GetEduFormsAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT Id, Name FROM dbo.EduForms ORDER BY Id";
        var result = await db.QueryAsync<EduForm>(
            new CommandDefinition(sql, cancellationToken: ct));
        return result.ToList().AsReadOnly();
    }

    public async Task CreateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default)
    {
        const string sql = @"
            IF NOT EXISTS (SELECT 1 FROM dbo.BaseSpecializations WHERE Code = @Code)
                INSERT INTO dbo.BaseSpecializations (Code, Title) VALUES (@Code, @Title);
            ELSE
                UPDATE dbo.BaseSpecializations SET Title = @Title WHERE Code = @Code;

            INSERT INTO dbo.Programs (SpecCode, FormId, YearsEduc, Description, Disciplines, Spheres)
            VALUES (@Code, @FormId, @YearsEduc, @Description, @Disciplines, @Spheres);";

        await db.ExecuteAsync(new CommandDefinition(sql, direction, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    public async Task UpdateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default)
    {
        const string sql = @"
            IF NOT EXISTS (SELECT 1 FROM dbo.BaseSpecializations WHERE Code = @Code)
                INSERT INTO dbo.BaseSpecializations (Code, Title) VALUES (@Code, @Title);
            ELSE
                UPDATE dbo.BaseSpecializations SET Title = @Title WHERE Code = @Code;

            UPDATE dbo.Programs
               SET SpecCode = @Code,
                   FormId = @FormId,
                   YearsEduc = @YearsEduc,
                   Description = @Description,
                   Disciplines = @Disciplines,
                   Spheres = @Spheres
             WHERE Id = @ProgramId;";

        await db.ExecuteAsync(new CommandDefinition(sql, direction, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    public async Task DeleteDirectionAsync(int programId, CancellationToken ct = default)
    {
        const string sql = "DELETE FROM dbo.Programs WHERE Id = @ProgramId";
        await db.ExecuteAsync(new CommandDefinition(sql, new { ProgramId = programId }, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    private class AdmissionStatsRow
    {
        public int     ProgramId       { get; set; }
        public int     Year            { get; set; }
        public decimal Price           { get; set; }
        public int     BudgetPlaces    { get; set; }
        public int     MinPassingScore { get; set; }
        public double? AvgEgeScore     { get; set; }
    }
}

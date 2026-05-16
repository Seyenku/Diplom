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
            const string sqlPrograms = @"
                SELECT
                    bs.Code,
                    bs.Title,
                    p.Id           AS ProgramId,
                    ef.Name        AS EduForm,
                    p.YearsEduc,
                    p.Description,
                    ISNULL((
                        SELECT STRING_AGG(d.Name, ', ')
                        FROM dbo.Program_Disciplines_Map pdm
                        JOIN dbo.Disciplines d ON pdm.DisciplineId = d.Id
                        WHERE pdm.ProgramId = p.Id
                    ), '') AS Disciplines,
                    ISNULL((
                        SELECT STRING_AGG(sp.Name, ', ')
                        FROM dbo.Program_Spheres_Map psm2
                        JOIN dbo.Spheres sp ON psm2.SphereId = sp.Id
                        WHERE psm2.ProgramId = p.Id
                    ), '') AS Spheres,
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

            const string sqlStats = @"
                SELECT ProgramId, Year, Price, BudgetPlaces, MinPassingScore, AvgEgeScore
                FROM dbo.AdmissionStats
                ORDER BY ProgramId, Year DESC";

            var stats = (await db.QueryAsync<AdmissionStatsRow>(
                new CommandDefinition(sqlStats, cancellationToken: ct))).ToList();

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

    public async Task<IReadOnlyList<EduForm>> GetEduFormsAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT Id, Name FROM dbo.EduForms ORDER BY Id";
        var result = await db.QueryAsync<EduForm>(
            new CommandDefinition(sql, cancellationToken: ct));
        return result.ToList().AsReadOnly();
    }

    public async Task CreateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default)
    {
        EnsureOpen();
        using var tx = db.BeginTransaction();

        await UpsertBaseSpecAsync(direction.Code, direction.Title, tx, ct);

        const string sqlInsertProgram = @"
            INSERT INTO dbo.Programs (SpecCode, FormId, YearsEduc, Description)
            VALUES (@Code, @FormId, @YearsEduc, @Description);
            SELECT CAST(SCOPE_IDENTITY() AS INT);";

        var programId = await db.ExecuteScalarAsync<int>(new CommandDefinition(
            sqlInsertProgram,
            new { direction.Code, direction.FormId, direction.YearsEduc, direction.Description },
            tx, cancellationToken: ct));

        await SyncDisciplinesAsync(programId, direction.Disciplines, tx, ct);
        await SyncSpheresAsync(programId, direction.Spheres, tx, ct);

        tx.Commit();
        cache.Remove(CacheKey);
    }

    public async Task UpdateDirectionAsync(AdminDirectionInputDto direction, CancellationToken ct = default)
    {
        EnsureOpen();
        using var tx = db.BeginTransaction();

        await UpsertBaseSpecAsync(direction.Code, direction.Title, tx, ct);

        const string sqlUpdateProgram = @"
            UPDATE dbo.Programs
               SET SpecCode    = @Code,
                   FormId      = @FormId,
                   YearsEduc   = @YearsEduc,
                   Description = @Description
             WHERE Id = @ProgramId;";

        await db.ExecuteAsync(new CommandDefinition(
            sqlUpdateProgram,
            new { direction.Code, direction.FormId, direction.YearsEduc, direction.Description, direction.ProgramId },
            tx, cancellationToken: ct));

        await db.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Program_Disciplines_Map WHERE ProgramId = @ProgramId;",
            new { direction.ProgramId }, tx, cancellationToken: ct));
        await db.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Program_Spheres_Map WHERE ProgramId = @ProgramId;",
            new { direction.ProgramId }, tx, cancellationToken: ct));

        await SyncDisciplinesAsync(direction.ProgramId, direction.Disciplines, tx, ct);
        await SyncSpheresAsync(direction.ProgramId, direction.Spheres, tx, ct);

        tx.Commit();
        cache.Remove(CacheKey);
    }

    public async Task DeleteDirectionAsync(int programId, CancellationToken ct = default)
    {
        const string sql = "DELETE FROM dbo.Programs WHERE Id = @ProgramId";
        await db.ExecuteAsync(new CommandDefinition(sql, new { ProgramId = programId }, cancellationToken: ct));
        cache.Remove(CacheKey);
    }

    private void EnsureOpen()
    {
        if (db.State != ConnectionState.Open) db.Open();
    }

    private async Task UpsertBaseSpecAsync(string code, string title, IDbTransaction tx, CancellationToken ct)
    {
        const string sql = @"
            IF NOT EXISTS (SELECT 1 FROM dbo.BaseSpecializations WHERE Code = @Code)
                INSERT INTO dbo.BaseSpecializations (Code, Title) VALUES (@Code, @Title);
            ELSE
                UPDATE dbo.BaseSpecializations SET Title = @Title WHERE Code = @Code;";
        await db.ExecuteAsync(new CommandDefinition(sql, new { Code = code, Title = title }, tx, cancellationToken: ct));
    }

    private async Task SyncDisciplinesAsync(int programId, IEnumerable<string> names, IDbTransaction tx, CancellationToken ct)
    {
        const string sql = @"
            DECLARE @Id INT;
            SELECT @Id = Id FROM dbo.Disciplines WHERE Name = @Name;
            IF @Id IS NULL
            BEGIN
                INSERT INTO dbo.Disciplines (Name) VALUES (@Name);
                SET @Id = CAST(SCOPE_IDENTITY() AS INT);
            END
            IF NOT EXISTS (SELECT 1 FROM dbo.Program_Disciplines_Map WHERE ProgramId = @ProgramId AND DisciplineId = @Id)
                INSERT INTO dbo.Program_Disciplines_Map (ProgramId, DisciplineId) VALUES (@ProgramId, @Id);";

        foreach (var name in Normalize(names))
            await db.ExecuteAsync(new CommandDefinition(sql, new { ProgramId = programId, Name = name }, tx, cancellationToken: ct));
    }

    private async Task SyncSpheresAsync(int programId, IEnumerable<string> names, IDbTransaction tx, CancellationToken ct)
    {
        const string sql = @"
            DECLARE @Id INT;
            SELECT @Id = Id FROM dbo.Spheres WHERE Name = @Name;
            IF @Id IS NULL
            BEGIN
                INSERT INTO dbo.Spheres (Name) VALUES (@Name);
                SET @Id = CAST(SCOPE_IDENTITY() AS INT);
            END
            IF NOT EXISTS (SELECT 1 FROM dbo.Program_Spheres_Map WHERE ProgramId = @ProgramId AND SphereId = @Id)
                INSERT INTO dbo.Program_Spheres_Map (ProgramId, SphereId) VALUES (@ProgramId, @Id);";

        foreach (var name in Normalize(names))
            await db.ExecuteAsync(new CommandDefinition(sql, new { ProgramId = programId, Name = name }, tx, cancellationToken: ct));
    }

    private static IEnumerable<string> Normalize(IEnumerable<string> names) =>
        names.Select(n => n?.Trim() ?? string.Empty)
             .Where(n => n.Length > 0)
             .Distinct(StringComparer.OrdinalIgnoreCase);

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

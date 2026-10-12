using Microsoft.EntityFrameworkCore;

namespace GuidedTours.Api.Data;

/// <summary>A host system that embeds the engine (Tasky, the admin portal, ...).</summary>
public class AppEntity
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string? ChooserTitle { get; set; }
    public string? ChooserSubtitle { get; set; }
    public string? AccentColor { get; set; }
    public string? HostUrl { get; set; }
    public List<TourEntity> Tours { get; set; } = new();
}

public class TourEntity
{
    public int Id { get; set; }
    public int AppId { get; set; }
    public AppEntity App { get; set; } = null!;

    /// <summary>The id hosts use in Tour.start("..."); unique per app.</summary>
    public string Key { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int Version { get; set; } = 1;
    public string AutoStart { get; set; } = "never";
    public bool ShowInChooser { get; set; } = true;
    public string? FinishLabel { get; set; }
    public bool IsPublished { get; set; }
    public int SortOrder { get; set; }

    /// <summary>Steps serialised as JSON: the schema can evolve without migrations.</summary>
    public string StepsJson { get; set; } = "[]";
    public DateTimeOffset UpdatedAt { get; set; }
}

public class ToursDb(DbContextOptions<ToursDb> options) : DbContext(options)
{
    public DbSet<AppEntity> Apps => Set<AppEntity>();
    public DbSet<TourEntity> Tours => Set<TourEntity>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppEntity>(e =>
        {
            e.HasIndex(x => x.Key).IsUnique();
            e.Property(x => x.Key).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
        });
        b.Entity<TourEntity>(e =>
        {
            e.HasIndex(x => new { x.AppId, x.Key }).IsUnique();
            e.Property(x => x.Key).HasMaxLength(64);
            e.Property(x => x.Title).HasMaxLength(200);
            e.HasOne(x => x.App).WithMany(a => a.Tours).HasForeignKey(x => x.AppId).OnDelete(DeleteBehavior.Cascade);
            // SQLite can't order by DateTimeOffset natively; store as Unix milliseconds.
            e.Property(x => x.UpdatedAt).HasConversion(v => v.ToUnixTimeMilliseconds(), v => DateTimeOffset.FromUnixTimeMilliseconds(v));
        });
    }
}

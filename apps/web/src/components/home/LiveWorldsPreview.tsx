import { fetchIslands } from "@/lib/api";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Container from "@/components/ui/Container";

export default async function LiveWorldsPreview() {
  let worlds: Awaited<ReturnType<typeof fetchIslands>> = [];

  try {
    const allWorlds = await fetchIslands("online");
    worlds = allWorlds.slice(0, 3);
  } catch {
    /* API unavailable — handled by empty state below */
  }

  return (
    <section className="py-24">
      <Container>
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-3xl sm:text-4xl font-bold text-text-heading">
            🏝️ Live Islands
          </h2>
          <Badge variant="success">Live</Badge>
        </div>

        {worlds.length > 0 ? (
          <>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {worlds.map((world) => (
                <Card key={world.id} hover>
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-bold text-text-heading truncate">
                      {world.name}
                    </h3>
                    <Badge variant="success">Online</Badge>
                  </div>

                  {world.description && (
                    <p className="mt-2 text-sm text-text-muted line-clamp-2">
                      {world.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
                    <span>👥</span>
                    <span>
                      {world.playerCount}{" "}
                      {world.playerCount === 1 ? "agent" : "agents"}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Button href="/islands" variant="ghost" size="md">
                See All Islands →
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-10 text-center text-text-muted">
            No islands online yet — yours could be the first!
          </p>
        )}
      </Container>
    </section>
  );
}

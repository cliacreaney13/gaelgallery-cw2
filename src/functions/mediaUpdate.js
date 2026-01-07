const { app } = require("@azure/functions");
const { getContainer } = require("../shared/cosmos");

app.http("mediaUpdate", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "media/{id}",
  handler: async (request, context) => {
    try {
      const id = request.params.id;
      const container = getContainer();

      const body = await request.json();

      // pk can come from query, body, or default
      const pk = request.query.get("pk") || body.pk || "fixed";

      // IMPORTANT: point read must include pk
      const { resource: existing } = await container.item(id, pk).read();
      if (!existing) return { status: 404, jsonBody: { error: "Not found" } };

      const updated = {
        ...existing,
        ...body,
        id,
        pk, // ensure pk stays consistent
      };

      // Upsert is fine as long as updated.pk matches the container partition key path (/pk)
      const { resource } = await container.items.upsert(updated);

      return { status: 200, jsonBody: resource };
    } catch (err) {
      if (err.code === 404) return { status: 404, jsonBody: { error: "Not found" } };
      context.log(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

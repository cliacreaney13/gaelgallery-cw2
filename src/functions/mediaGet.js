const { app } = require("@azure/functions");
const { getContainer } = require("../shared/cosmos");

app.http("mediaGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "media/{id}",
  handler: async (request, context) => {
    try {
      const id = request.params.id;

      // pk comes from query string (?pk=fixed) or default
      const pk = request.query.get("pk") || "fixed";

      const container = getContainer();
      const { resource } = await container.item(id, pk).read();

      if (!resource) return { status: 404, jsonBody: { error: "Not found" } };
      return { status: 200, jsonBody: resource };
    } catch (err) {
      if (err.code === 404) return { status: 404, jsonBody: { error: "Not found" } };
      context.log(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

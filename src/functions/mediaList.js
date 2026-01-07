const { app } = require("@azure/functions");
const { getContainer } = require("../shared/cosmos");

app.http("mediaList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "media",
  handler: async (request, context) => {
    try {
      const container = getContainer();

      // Optional filters (nice for frontend):
      const userId = request.query.get("userId"); // e.g. ?userId=user_123
      const mediaType = request.query.get("mediaType"); // e.g. ?mediaType=video

      let query = "SELECT * FROM c";
      const parameters = [];
      const where = [];

      if (userId) {
        where.push("c.userId = @userId");
        parameters.push({ name: "@userId", value: userId });
      }
      if (mediaType) {
        where.push("c.mediaType = @mediaType");
        parameters.push({ name: "@mediaType", value: mediaType });
      }

      if (where.length) query += " WHERE " + where.join(" AND ");
      query += " ORDER BY c.uploadDate DESC";

      const { resources } = await container.items
        .query({ query, parameters })
        .fetchAll();

      return { status: 200, jsonBody: resources };
    } catch (err) {
      context.log(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

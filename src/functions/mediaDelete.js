const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { getContainer } = require("../shared/cosmos");

function getBlobNameFromUrl(blobUrl) {
  // Example blob URL:
  // https://<account>.blob.core.windows.net/media/media_004/irish-step.mp4
  // We want: "media_004/irish-step.mp4"
  const url = new URL(blobUrl);
  const parts = url.pathname.split("/").filter(Boolean); // ["media", "media_004", "irish-step.mp4"]
  // remove the container name (first segment)
  parts.shift();
  return parts.join("/");
}

app.http("mediaDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "media/{id}",
  handler: async (request, context) => {
    const id = request.params.id;

    // If you're using a fixed pk, keep this:
    // (If you pass pk as query ?pk=fixed, use: request.query.get("pk"))
    const pk = request.query.get("pk") || "fixed";

    try {
      const cosmosContainer = getContainer();

      // 1) Read the Cosmos doc first
      let resource;
      try {
        const readRes = await cosmosContainer.item(id, pk).read();
        resource = readRes.resource;
      } catch (err) {
        if (err.code === 404) {
          return { status: 404, jsonBody: { error: "Not found" } };
        }
        throw err;
      }

      // 2) Delete blob (if present)
      const blobUrl = resource?.blobUrl;
      if (blobUrl) {
        try {
          const blobService = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );
          const containerClient = blobService.getContainerClient("media"); // <-- your blob container name
          const blobName = getBlobNameFromUrl(blobUrl);
          const blobClient = containerClient.getBlobClient(blobName);

          // deleteIfExists avoids failing if blob already gone
          await blobClient.deleteIfExists();
        } catch (blobErr) {
          // Optional: If you want "max marks" robustness, log blob error but still delete Cosmos doc
          context.log("Blob delete failed:", blobErr.message);
        }
      }

      // 3) Delete Cosmos item
      await cosmosContainer.item(id, pk).delete();

      // 4) Return 204 No Content
      return { status: 204 };
    } catch (err) {
      context.log(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

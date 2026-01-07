const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { getContainer } = require("../shared/cosmos");

app.http("mediaUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "media/{id}/file",
  handler: async (request, context) => {
    try {
      const id = request.params.id;
      const body = await request.json();

      const pk = body.pk || "fixed";
      const fileName = body.fileName || `${id}.bin`;
      const contentType = body.contentType || "application/octet-stream";
      const fileBase64 = body.fileBase64;

      if (!fileBase64) {
        return { status: 400, jsonBody: { error: "fileBase64 is required" } };
      }

      // Decode base64 -> Buffer
      const buffer = Buffer.from(fileBase64, "base64");

      // Upload to blob
      const blobService = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );
      const containerClient = blobService.getContainerClient("media"); // <-- your container name
      await containerClient.createIfNotExists();

      // Keep blob name predictable
      const blobName = `${id}/${fileName}`;
      const blockBlob = containerClient.getBlockBlobClient(blobName);

      await blockBlob.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType },
      });

      const blobUrl = blockBlob.url;

      // Update cosmos doc with blobUrl (so GET returns it)
      const container = getContainer();
      const { resource } = await container.item(id, pk).read();
      if (!resource) return { status: 404, jsonBody: { error: "Metadata not found" } };

      resource.blobUrl = blobUrl;
      resource.mediaType = resource.mediaType || contentType;

      await container.items.upsert(resource);

      return { status: 200, jsonBody: { id, blobUrl } };
    } catch (err) {
      context.log(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});

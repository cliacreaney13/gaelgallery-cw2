const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY
});

app.http('mediaCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'media',
  handler: async (request, context) => {
    try {
      const body = await request.json();

      const container = client
        .database(process.env.COSMOS_DB)
        .container(process.env.COSMOS_CONTAINER);

      const item = {
        id: body.id,
        pk: body.pk,
        title: body.title,
        description: body.description,
        mediaType: body.mediaType,
        blobUrl: body.blobUrl,
        tags: body.tags,
        uploadDate: body.uploadDate
      };

      const { resource } = await container.items.create(item);

      return {
        status: 201,
        jsonBody: resource
      };
    } catch (err) {
      context.log(err);
      return {
        status: 500,
        jsonBody: { error: err.message }
      };
    }
  }
});

const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

function getContainer() {
  return client
    .database(process.env.COSMOS_DB)
    .container(process.env.COSMOS_CONTAINER);
}

module.exports = { getContainer };

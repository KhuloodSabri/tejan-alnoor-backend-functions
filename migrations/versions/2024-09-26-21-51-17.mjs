export const description = "Initial migration";

import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

export async function up(client) {
  const params = {
    TableName: "Levels", // Name of the table
    KeySchema: [
      { AttributeName: "levelID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "levelID", AttributeType: "N" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  };
  const command = new CreateTableCommand(params);
  const result = await client.send(command);
  //   console.log("Table created successfully:", result);
}

export async function down(client) {
  const params = {
    TableName: "Levels", // Name of the table
  };
  const command = new DeleteTableCommand(params);
  const result = await client.send(command);
  //   console.log("Table deleted successfully:", result);
}

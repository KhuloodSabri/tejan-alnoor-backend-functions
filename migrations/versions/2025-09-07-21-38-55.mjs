import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

export const description = "Create alert history table";

export async function up(client) {
  await client.send(
    new CreateTableCommand({
      TableName: "alertsHistory",
      AttributeDefinitions: [{ AttributeName: "alertID", AttributeType: "S" }],
      KeySchema: [
        { AttributeName: "alertID", KeyType: "HASH" }, // Partition key
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
}

export async function down(client) {
  // Write your rollback code here
  await client.send(
    new DeleteTableCommand({
      TableName: "alertsHistory",
    })
  );
}

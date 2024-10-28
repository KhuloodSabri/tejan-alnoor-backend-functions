import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  waitForTableToBecomeActive,
  waitForTableToBecomeDeleted,
} from "../utils.mjs";

export const description = "add table for semesters";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const createTableCommand = new CreateTableCommand({
    TableName: "Semesters",
    KeySchema: [
      { AttributeName: "semesterID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "semesterID", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTableCommand);

  await waitForTableToBecomeActive(client, "Semesters");
}

export async function down(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const deleteTableCommand = new DeleteTableCommand({
    TableName: "Semesters",
  });

  await awsDocDynamoDbClient.send(deleteTableCommand);

  await waitForTableToBecomeDeleted(client, "Semesters");
}

import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { normalizeString } from "../utils.mjs";

export const description = "Add normalized supervisor name";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
        })
      )
    )?.Items ?? [];

  for (const supervisor of supervisors) {
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Supervisors",
        Key: {
          supervisorID: supervisor.supervisorID,
        },
        UpdateExpression: `SET #normalizedName = :normalizedName`,
        ExpressionAttributeNames: {
          "#normalizedName": "normalizedName",
        },
        ExpressionAttributeValues: {
          ":normalizedName": normalizeString(supervisor.supervisorName),
        },
      })
    );
  }
}

export async function down(client) {
  awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
        })
      )
    )?.Items ?? [];

  for (const supervisor of supervisors) {
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Supervisors",
        Key: {
          supervisorID: supervisor.supervisorID,
        },
        UpdateExpression: `REMOVE #normalizedName`,
        ExpressionAttributeNames: {
          "#normalizedName": "normalizedName",
        },
      })
    );
  }
}

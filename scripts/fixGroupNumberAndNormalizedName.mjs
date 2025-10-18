import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { normalizeString } from "./utils.mjs";

async function fixStudents(awsDocDynamoDbClient) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    if (student.grouNumber) {
      const updateCommand = new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression: "SET #groupNumber = :groupNumber REMOVE #grouNumber",
        ExpressionAttributeNames: {
          "#groupNumber": "groupNumber",
          "#grouNumber": "grouNumber",
        },
        ExpressionAttributeValues: {
          ":groupNumber": student.grouNumber,
        },
      });

      await awsDocDynamoDbClient.send(updateCommand);
    }

    if (student.normalizedName) {
      const updateCommand = new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression:
          "SET #normalizedName = :normalizedName REMOVE #grouNumber",
        ExpressionAttributeNames: {
          "#normalizedName": "normalizedName",
          "#grouNumber": "grouNumber",
        },
        ExpressionAttributeValues: {
          ":normalizedName": normalizeString(student.normalizedName),
        },
      });

      await awsDocDynamoDbClient.send(updateCommand);
    }
  }
}

export async function run() {
  const client = new DynamoDBClient({
    // region: "eu-north-1",
    region: "local",
    endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  await fixStudents(awsDocDynamoDbClient);
}

run();

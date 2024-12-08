import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

async function fixStudents(awsDocDynamoDbClient) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression:
            "attribute_not_exists(#withdrawnSemesters) OR size(withdrawnSemesters) = :empty",
          ExpressionAttributeNames: {
            "#withdrawnSemesters": "withdrawnSemesters",
          },
          ExpressionAttributeValues: {
            ":empty": 0,
          },
        })
      )
    )?.Items ?? [];

  console.log("Students size: ", students.length);

  for (const student of students) {
    if (!student.withdrawnSemesters) {
      console.log("Processing student: ", student.studentName);
      const updateCommand = new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression: "SET #withdrawnSemesters = :withdrawnSemesters",
        ExpressionAttributeNames: {
          "#withdrawnSemesters": "withdrawnSemesters",
        },
        ExpressionAttributeValues: {
          ":withdrawnSemesters": [],
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

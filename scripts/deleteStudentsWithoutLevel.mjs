import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

async function run() {
  const client = new DynamoDBClient({
    region: "eu-north-1",
    // region: "local",
    // endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const studentsMissingLevelId =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression: "attribute_not_exists(levelID)",
        })
      )
    )?.Items ?? [];

  console.log(studentsMissingLevelId.length);
  console.log(studentsMissingLevelId.map((student) => student.studentName));

  for (const student of studentsMissingLevelId) {
    const deleteParams = {
      TableName: "Students",
      Key: {
        studentID: student.studentID, // Replace with your actual key name
        // sortKeyName: item.sortKeyName, // Include if you have a sort key
      },
    };
    await awsDocDynamoDbClient.send(new DeleteCommand(deleteParams));
  }
}

run();

import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export const description = "Allow different tests for different semesters";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    const updateCommand = new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression:
        "SET #tests = :tests  REMOVE #test1, #test2, #test3, #test4, #test5",
      ExpressionAttributeNames: {
        "#tests": "tests",
        "#test1": "test1",
        "#test2": "test2",
        "#test3": "test3",
        "#test4": "test4",
        "#test5": "test5",
      },
      ExpressionAttributeValues: {
        ":tests": {
          2023: {
            3: {
              1: student.test1,
              2: student.test2,
              3: student.test3,
              4: student.test4,
              5: student.test5,
            },
          },
        },
      },
    });

    await awsDocDynamoDbClient.send(updateCommand);
  }
}

export async function down(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    const updateCommand = new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression: `REMOVE #tests 
         SET #test1 = :test1,
         #test2 = :test2,
         #test3 = :test3,
         #test4 = :test4,
         #test5 = :test5`,
      ExpressionAttributeNames: {
        "#tests": "tests",
        "#test1": "test1",
        "#test2": "test2",
        "#test3": "test3",
        "#test4": "test4",
        "#test5": "test5",
      },
      ExpressionAttributeValues: {
        ":test1": student.tests[2023][3][1],
        ":test2": student.tests[2023][3][2],
        ":test3": student.tests[2023][3][3],
        ":test4": student.tests[2023][3][4],
        ":test5": student.tests[2023][3][5],
      },
    });

    await awsDocDynamoDbClient.send(updateCommand);
  }
}

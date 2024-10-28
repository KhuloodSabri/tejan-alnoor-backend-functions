import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

export const description = "restructure join time";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const students =
    (
      await DynamoDBDocumentClient.from(client).send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    console.log("Update student with ID", student.studentID);
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression:
          "SET #joinYear = :joinYear, #joinSemester = :joinSemester, #joinMonth = :joinMonth REMOVE #joinTime",
        ExpressionAttributeNames: {
          "#joinYear": "joinYear",
          "#joinSemester": "joinSemester",
          "#joinMonth": "joinMonth",
          "#joinTime": "joinTime",
        },
        ExpressionAttributeValues: {
          ":joinYear": student.joinTime.year,
          ":joinSemester": student.joinTime.semester,
          ":joinMonth": student.joinTime.semesterMonth,
        },
      })
    );
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
    console.log("Update student with ID", student.studentID);
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression:
          "REMOVE #joinYear, #joinSemester, #joinMonth SET #joinTime = :joinTime",
        ExpressionAttributeNames: {
          "#joinYear": "joinYear",
          "#joinSemester": "joinSemester",
          "#joinMonth": "joinMonth",
          "#joinTime": "joinTime",
        },
        ExpressionAttributeValues: {
          ":joinTime": {
            year: student.joinYear,
            semester: student.joinSemester,
            semesterMonth: student.joinMonth,
          },
        },
      })
    );
  }
}

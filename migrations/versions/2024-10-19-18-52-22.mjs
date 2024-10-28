import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { updateStudentsFromCsv } from "../utils.mjs";

export const description = "Add more details to students";

export const normalizeString = (name) => {
  let result = name;
  result = result.replace("أ", "ا");
  result = result.replace("ى", "ا");
  result = result.replace("آ", "ا");
  result = result.replace("إ", "ا");
  result = result.replace("ي ", "ا ");
  result = result.replace("ؤ", "و");
  result = result.replace("ة", "ه");
  result = result.replace("ئ", "ي");
  result = result.replace(" ", "");

  return result;
};

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

  const currentTimeStamp = Date.now(); // timestamp in ms

  const getUpdateCommand = (student, createdDate) => {
    return new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression: `SET #withdrawnSemesters = :withdrawnSemesters,
            #dismissedSemesters = :dismissedSemesters,
            #createdAt = :createdAt,
            #updatedAt = :updatedAt,
            #normalizedName = :normalizedName`,
      ExpressionAttributeNames: {
        "#withdrawnSemesters": "withdrawnSemesters",
        "#dismissedSemesters": "dismissedSemesters",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#normalizedName": "normalizedName",
      },
      ExpressionAttributeValues: {
        ":withdrawnSemesters": [],
        ":dismissedSemesters": [],
        ":createdAt": createdDate,
        ":updatedAt": currentTimeStamp,
        ":normalizedName": normalizeString(student.studentName),
      },
    });
  };

  for (const student of students) {
    await awsDocDynamoDbClient.send(
      getUpdateCommand(student, currentTimeStamp)
    );
  }

  await updateStudentsFromCsv(
    "versions/2024-09-28-all-students-details.csv",
    awsDocDynamoDbClient,
    async (student, _row) => {
      const createdDate = new Date();
      createdDate.setMonth(createdDate.getMonth() - 2);
      const createdTimeStamp = createdDate.getTime();
      await awsDocDynamoDbClient.send(
        getUpdateCommand(student, createdTimeStamp)
      );
    }
  );
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
      UpdateExpression:
        "REMOVE #withdrawnSemesters, #dismissedSemesters, #createdAt, #updatedAt, #normalizedName",
      ExpressionAttributeNames: {
        "#withdrawnSemesters": "withdrawnSemesters",
        "#dismissedSemesters": "dismissedSemesters",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#normalizedName": "normalizedName",
      },
    });

    await awsDocDynamoDbClient.send(updateCommand);
  }
}

import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  promptUser,
  updateStudentsFromCsv,
  waitForTableToBecomeActive,
  waitForTableToBecomeDeleted,
} from "../utils.mjs";

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

const formatDate = (date) => {
  return date.toISOString().split(".")[0].replace("T", " ");
};

export async function up(client) {
  console.log("1. create tmp table");
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const createTempTableCommand = new CreateTableCommand({
    TableName: "Students2",
    KeySchema: [
      { AttributeName: "studentID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "studentID", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTempTableCommand);
  await waitForTableToBecomeActive(awsDocDynamoDbClient, "Students2");

  console.log("2. fill data from original table into temp table");
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    await awsDocDynamoDbClient.send(
      new PutCommand({
        TableName: "Students2",
        Item: student,
      })
    );
  }

  console.log("3. delete original table");
  const deleteTableCommand = new DeleteTableCommand({
    TableName: "Students",
  });

  await awsDocDynamoDbClient.send(deleteTableCommand);
  await waitForTableToBecomeDeleted(client, "Students");

  console.log("4. Create original table with new structure");
  //  don't create GSI  to include phone number
  //  phone number: it is empty for a lot of users and (partition + sort) will not be unique
  const createTableCommand = new CreateTableCommand({
    TableName: "Students",
    KeySchema: [
      { AttributeName: "studentID", KeyType: "HASH" }, // Partition key
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "studentName_createdAt_GSI",
        KeySchema: [
          { AttributeName: "studentName", KeyType: "HASH" },
          { AttributeName: "createdAt", KeyType: "RANGE" },
        ],
        Projection: {
          ProjectionType: "ALL", // Project all attributes
        },
        BillingMode: "PAY_PER_REQUEST",
      },
      {
        IndexName: "studentName_updatedAt_GSI",
        KeySchema: [
          { AttributeName: "studentID", KeyType: "HASH" },
          { AttributeName: "updatedAt", KeyType: "RANGE" },
        ],
        Projection: {
          ProjectionType: "ALL", // Project all attributes
        },
        BillingMode: "PAY_PER_REQUEST",
      },
    ],
    AttributeDefinitions: [
      { AttributeName: "studentID", AttributeType: "S" },
      { AttributeName: "studentName", AttributeType: "S" },
      { AttributeName: "createdAt", AttributeType: "S" },
      { AttributeName: "updatedAt", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTableCommand);
  await waitForTableToBecomeActive(awsDocDynamoDbClient, "Students");

  const currentDate = new Date();

  console.log("5. Fill data again into original table");
  for (const student of students) {
    const createdDate = new Date();
    createdDate.setDate(currentDate.getDate() - 14);

    await awsDocDynamoDbClient.send(
      new PutCommand({
        TableName: "Students",
        Item: {
          ...student,
          createdAt: formatDate(createdDate),
          updatedAt: formatDate(new Date()),
        },
      })
    );
  }

  const getUpdateCommand = (student, createdDate) => {
    return new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression: `SET #withdrawnSemesters = :withdrawnSemesters,
            #createdAt = :createdAt,
            #updatedAt = :updatedAt,
            #normalizedName = :normalizedName`,
      ExpressionAttributeNames: {
        "#withdrawnSemesters": "withdrawnSemesters",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#normalizedName": "normalizedName",
      },
      ExpressionAttributeValues: {
        ":withdrawnSemesters": [],
        ":createdAt": formatDate(createdDate),
        ":updatedAt": formatDate(currentDate),
        ":normalizedName": normalizeString(student.studentName),
      },
    });
  };

  console.log("6. Update older students with new fields");
  await updateStudentsFromCsv(
    "versions/2024-09-28-all-students-details.csv",
    awsDocDynamoDbClient,
    async (student, _row) => {
      const createdDate = new Date();
      createdDate.setMonth(currentDate.getMonth() - 2);

      await awsDocDynamoDbClient.send(getUpdateCommand(student, createdDate));
    }
  );

  console.log("7. delete temp table");
  await promptUser("Press enter to delete the temp table");
  const deleteTempTableCommand = new DeleteTableCommand({
    TableName: "Students2",
  });

  await awsDocDynamoDbClient.send(deleteTempTableCommand);
  await waitForTableToBecomeDeleted(client, "Students2");
}

export async function down(client) {
  console.log("1. create tmp table");
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const createTempTableCommand = new CreateTableCommand({
    TableName: "Students2",
    KeySchema: [
      { AttributeName: "studentID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "studentID", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTempTableCommand);
  await waitForTableToBecomeActive(awsDocDynamoDbClient, "Students2");

  console.log("2. fill data from original table into temp table");
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    await awsDocDynamoDbClient.send(
      new PutCommand({
        TableName: "Students2",
        Item: student,
      })
    );
  }

  console.log("3. delete original table");
  const deleteTableCommand = new DeleteTableCommand({
    TableName: "Students",
  });

  await awsDocDynamoDbClient.send(deleteTableCommand);
  await waitForTableToBecomeDeleted(client, "Students");

  console.log("4. Create original table with old structure");
  const createTableCommand = new CreateTableCommand({
    TableName: "Students",
    KeySchema: [
      { AttributeName: "studentID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "studentID", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTableCommand);
  await waitForTableToBecomeActive(awsDocDynamoDbClient, "Students");

  const currentDate = new Date();

  console.log("5. Fill data again into original table");
  for (const student of students) {
    const createdDate = new Date();
    createdDate.setDate(currentDate.getDate() - 14);
    const {
      withdrawnSemesters,
      createdAt,
      updatedAt,
      normalizedName,
      ...restStudent
    } = student;
    await awsDocDynamoDbClient.send(
      new PutCommand({
        TableName: "Students",
        Item: restStudent,
      })
    );
  }

  console.log("6. delete temp table");
  await promptUser("Press enter to delete the temp table");
  const deleteTempTableCommand = new DeleteTableCommand({
    TableName: "Students2",
  });

  await awsDocDynamoDbClient.send(deleteTempTableCommand);
  await waitForTableToBecomeDeleted(client, "Students2");
}

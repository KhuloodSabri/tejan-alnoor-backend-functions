import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export const description = "move supervisors to a new table";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const createSupervisorsCommand = new CreateTableCommand({
    TableName: "Supervisors", // Name of the table
    KeySchema: [
      { AttributeName: "supervisorID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [
      { AttributeName: "supervisorID", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await client.send(createSupervisorsCommand);

  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  let supervisorsNextId = 1;

  const supervisorsMap = students.reduce((acc, student) => {
    const supervisor = student.supervisorName;
    if (!acc[supervisor]) {
      acc[supervisor] = {
        supervisorID: supervisorsNextId++,
        supervisorName: supervisor,
        students: [],
      };
    }

    acc[supervisor].students.push(student.studentID);
    return acc;
  }, {});

  for (const supervisor of Object.values(supervisorsMap)) {
    const putCommand = new PutCommand({
      TableName: "Supervisors",
      Item: {
        supervisorID: supervisor.supervisorID,
        supervisorName: supervisor.supervisorName,
      },
    });
    await awsDocDynamoDbClient.send(putCommand);
  }

  for (const student of students) {
    const updateCommand = new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression:
        "REMOVE #supervisorName SET #supervisorID = :supervisorID",
      ExpressionAttributeNames: {
        "#supervisorName": "supervisorName",
        "#supervisorID": "supervisorID",
      },
      ExpressionAttributeValues: {
        ":supervisorID": supervisorsMap[student.supervisorName].supervisorID,
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

  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    const supervisor = supervisors.find(
      (supervisor) => supervisor.supervisorID === student.supervisorID
    );

    const updateCommand = new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression:
        "SET #supervisorName = :supervisorName Remove #supervisorID",
      ExpressionAttributeNames: {
        "#supervisorName": "supervisorName",
        "#supervisorID": "supervisorID",
      },
      ExpressionAttributeValues: {
        ":supervisorName": supervisor.supervisorName,
      },
    });

    await awsDocDynamoDbClient.send(updateCommand);
  }

  const deleteSupervisorsCommand = new DeleteTableCommand({
    TableName: "Supervisors",
  });

  await client.send(deleteSupervisorsCommand);
}

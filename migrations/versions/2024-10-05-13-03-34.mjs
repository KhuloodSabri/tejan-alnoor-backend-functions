import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  waitForTableToBecomeActive,
  waitForTableToBecomeDeleted,
} from "../utils.mjs";

export const description = "use uuids for supervisors and students";

async function changeTableKeyType(
  client,
  tableName,
  tableKey,
  newType,
  mapNewItem = async () => {}
) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  console.log("Changing table key type for", tableName);
  const items =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: tableName,
        })
      )
    )?.Items ?? [];

  const deleteTableCommand = new DeleteTableCommand({
    TableName: tableName,
  });

  await awsDocDynamoDbClient.send(deleteTableCommand);

  await waitForTableToBecomeDeleted(client, tableName);

  const createTableCommand = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: tableKey, KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: tableKey, AttributeType: newType }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  });

  await awsDocDynamoDbClient.send(createTableCommand);

  await waitForTableToBecomeActive(client, tableName);

  const newKeysMap = {};

  for (const item of items) {
    const newItem = mapNewItem(item);
    newKeysMap[item[tableKey]] = newItem[tableKey];

    const putCommand = new PutCommand({
      TableName: tableName,
      Item: newItem,
    });

    await awsDocDynamoDbClient.send(putCommand);
  }

  return newKeysMap;
}

export async function up(client) {
  const supervisorsUuid = await changeTableKeyType(
    client,
    "Supervisors",
    "supervisorID",
    "S",
    (supervisor) => ({
      ...supervisor,
      supervisorID: uuidv4(),
    })
  );

  await changeTableKeyType(client, "Students", "studentID", "S", (student) => ({
    ...student,
    supervisorID: supervisorsUuid[student.supervisorID],
    studentID: uuidv4(),
  }));
}

export async function down(client) {
  let serialID = 1;

  const supervisorsIds = await changeTableKeyType(
    client,
    "Supervisors",
    "supervisorID",
    "N",
    (supervisor) => ({
      ...supervisor,
      supervisorID: serialID++,
    })
  );

  serialID = 1;

  await changeTableKeyType(client, "Students", "studentID", "N", (student) => ({
    ...student,
    supervisorID: supervisorsIds[student.supervisorID],
    studentID: serialID++,
  }));
}

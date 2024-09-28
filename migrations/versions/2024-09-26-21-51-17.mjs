import {
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";

export const description =
  "Initial migration, this is already in prod, but needed for local";

export async function up(client) {
  const levelTableParams = {
    TableName: "Levels", // Name of the table
    KeySchema: [
      { AttributeName: "levelID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "levelID", AttributeType: "N" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  };
  const levelsCommand = new CreateTableCommand(levelTableParams);
  let result = await client.send(levelsCommand);
  console.log("Levels table created successfully");

  const studentTableParams = {
    TableName: "Students", // Name of the table
    KeySchema: [
      { AttributeName: "studentID", KeyType: "HASH" }, // Partition key
    ],
    AttributeDefinitions: [{ AttributeName: "studentID", AttributeType: "N" }],
    BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
  };

  const studentCommand = new CreateTableCommand(studentTableParams);
  result = await client.send(studentCommand);
  console.log("Students table created successfully");

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  fs.createReadStream("versions/2024-09-26-prod-levels.csv")
    .pipe(csv())
    .on("data", (row) => {
      const levelRowParams = {
        TableName: "Levels",
        Item: {
          levelID: Number(row.levelID),
          levelName: row.levelName,
          progressUnit: row.progressUnit,
          weeksPlan: JSON.parse(row.weeksPlan).map((week) =>
            week.L.map((item) => Number(item.N))
          ),
        },
      };

      const putCommand = new PutCommand(levelRowParams);
      awsDocDynamoDbClient.send(putCommand);
    })
    .on("end", () => {
      console.log("Levels CSV file successfully processed");
    });

  fs.createReadStream("versions/2024-09-26-prod-students.csv")
    .pipe(csv())
    .on("data", (row) => {
      const studentRowParams = {
        TableName: "Students",
        Item: {
          studentID: Number(row.studentID),
          levelID: Number(row.levelID),
          gender: row.gender,
          memorizingProgress: Number(row.memorizingProgress),
          revisitProgress: JSON.parse(row.revisitProgress).map((progress) =>
            progress.L.map((item) => Number(item.N))
          ),
          startWeek: Number(row.startWeek),
          studentName: row.studentName,
          supervisorName: row.supervisorName,
          test1: Number(row.test1),
          test2: Number(row.test2),
          test3: Number(row.test3),
          test4: Number(row.test4),
          test5: Number(row.test5),
        },
      };

      const putCommand = new PutCommand(studentRowParams);
      awsDocDynamoDbClient.send(putCommand);
    })
    .on("end", () => {
      console.log("Students CSV file successfully processed");
    });

  //   console.log("Table created successfully:", result);
}

export async function down(client) {
  const levelParams = {
    TableName: "Levels", // Name of the table
  };
  const levelCommand = new DeleteTableCommand(levelParams);
  let result = await client.send(levelCommand);
  console.log("Levels table deleted successfully");

  const studentParams = {
    TableName: "Students", // Name of the table
  };
  const studentCommand = new DeleteTableCommand(studentParams);
  result = await client.send(studentCommand);
  console.log("Students table deleted successfully");
  //   console.log("Table deleted successfully:", result);
}

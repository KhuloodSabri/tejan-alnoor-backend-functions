import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { promptUser } from "./utils.mjs";

const defaultBackupFolderPath = "C:/Users/hp/Downloads/";
const defaultBackupDate = "2025-6-23";
const defaultTablesToFill = ["Levels", "Students", "Supervisors", "Configs"];

// Function to convert DynamoDB format to regular JavaScript object
function convertFromDynamoDBFormat(value) {
  if (value.S !== undefined) {
    return value.S;
  } else if (value.N !== undefined) {
    return Number(value.N);
  } else if (value.BOOL !== undefined) {
    return value.BOOL;
  } else if (value.L !== undefined) {
    return value.L.map(convertFromDynamoDBFormat);
  } else if (value.M !== undefined) {
    const result = {};
    for (const key in value.M) {
      result[key] = convertFromDynamoDBFormat(value.M[key]);
    }
    return result;
  } else {
    console.warn(`Unknown type:`, value);
    return null;
  }
}

// Function to convert CSV row to regular JavaScript object
function convertCsvRowToRegularObject(row) {
  const result = {};
  for (const key in row) {
    let value = row[key];

    try {
      value = JSON.parse(value);
      if (Array.isArray(value)) {
        result[key] = value.map(convertFromDynamoDBFormat);
      } else if (typeof value === "object") {
        result[key] = Object.keys(value).reduce((acc, key) => {
          acc[key] = convertFromDynamoDBFormat(value[key]);
          return acc;
        }, {});
      } else {
        result[key] = value;
      }
    } catch (e) {
      result[key] = row[key];
    }
  }
  return result;
}

async function fillDataFromCsv(docClient, tableName, filePath) {
  const processingFilePromise = new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", async (row) => {
        const command = new PutCommand({
          TableName: tableName,
          Item: convertCsvRowToRegularObject(row),
        });

        await docClient.send(command);
      })
      .on("end", () => {
        resolve();
      })
      .on("error", (error) => {
        console.error("Error processing file", error);
        reject(error);
      });
  });

  return await processingFilePromise;
}

export async function run() {
  const backupFolderPath =
    (await promptUser(
      `Enter backup folder path press enter to use the default (default: ${defaultBackupFolderPath}): `,
      defaultBackupFolderPath
    )) || defaultBackupFolderPath;

  const backupDate =
    (await promptUser(
      `Enter backup date in format YYYY-M-DD press enter to use the default (default: ${defaultBackupDate}): `,
      defaultBackupDate
    )) || defaultBackupDate;

  const tablesToFill =
    (await promptUser(
      `Enter tables to fill separated by commas press enter to use the default (default: ${defaultTablesToFill.join(
        ", "
      )}): `,
      defaultTablesToFill.join(", ")
    )) || defaultTablesToFill.join(", ");

  console.log("Will fill backups as follows:");
  const tablesBackupFiles = tablesToFill.split(",").reduce((acc, tableName) => {
    acc[
      tableName.trim()
    ] = `${backupFolderPath.trim()}${tableName.trim()}-${backupDate.trim()}.csv`;
    return acc;
  }, {});
  for (const tableName of Object.keys(tablesBackupFiles)) {
    console.log(
      `- Table ${tableName}: Backup: ${tablesBackupFiles[tableName]}.csv`
    );
  }

  const confirmationRes = await promptUser("Press y to continue...");

  if (confirmationRes.toLowerCase() !== "y") {
    console.log("Operation cancelled by user.");
    return;
  }

  const client = new DynamoDBClient({
    // region: "eu-north-1",
    region: "local",
    endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  for (const tableName in tablesBackupFiles) {
    console.log(`Filling data for table: ${tableName}`);
    await fillDataFromCsv(
      awsDocDynamoDbClient,
      tableName,
      tablesBackupFiles[tableName]
    );
  }
}

run();

import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

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
  const client = new DynamoDBClient({
    // region: "eu-north-1",
    region: "local",
    endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const tablesToFill = {
    Levels: "C:/Users/hp/Downloads/prodSnapshot/Levels-2024-10-25.csv",
    Students: "C:/Users/hp/Downloads/prodSnapshot/Students-2024-10-25.csv",
    Supervisors:
      "C:/Users/hp/Downloads/prodSnapshot/Supervisors-2024-10-25.csv",
    Configs: "C:/Users/hp/Downloads/prodSnapshot/Configs-2024-10-25.csv",
  };

  for (const tableName in tablesToFill) {
    console.log(`Filling data for table: ${tableName}`);
    await fillDataFromCsv(
      awsDocDynamoDbClient,
      tableName,
      tablesToFill[tableName]
    );
  }
}

run();

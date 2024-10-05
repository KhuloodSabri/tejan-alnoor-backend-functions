import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

function trimStringQuotes(str) {
  let res = str.trim();

  if (res.startsWith('"') && res.endsWith('"')) {
    res = res.slice(1, -1);
  }

  return res.trim();
}

async function restoreStudentsProgressFromCsv(awsDocDynamoDbClient) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  const processingFilePromise = new Promise((resolve, reject) => {
    fs.createReadStream("C:/Users/hp/Downloads/Students-2024-10-5.csv")
      .pipe(csv())
      .on("data", async (row) => {
        if (!!row["studentName"]?.length) {
          const filteredStudents = students.filter((student) => {
            return (
              trimStringQuotes(student.studentName) ===
              trimStringQuotes(row["studentName"])
            );
          });

          if (filteredStudents.length === 1) {
            console.log("Processing student: ", row["studentName"]);
            const updateCommand = new UpdateCommand({
              TableName: "Students",
              Key: {
                studentID: filteredStudents[0].studentID,
              },
              UpdateExpression:
                "REMOVE revisionProgress SET #memorizingProgress = :memorizingProgress, #revisitProgress = :revisitProgress, #test1 = :test1, #test2 = :test2, #test3 = :test3, #test4 = :test4, #test5 = :test5",
              ExpressionAttributeNames: {
                "#memorizingProgress": "memorizingProgress",
                "#revisitProgress": "revisitProgress",
                "#test1": "test1",
                "#test2": "test2",
                "#test3": "test3",
                "#test4": "test4",
                "#test5": "test5",
              },
              ExpressionAttributeValues: {
                ":memorizingProgress": Number(row["memorizingProgress"]),
                ":revisitProgress": JSON.parse(row["revisitProgress"]).map(
                  (progress) => progress.L.map((item) => Number(item.N))
                ),
                ":test1": Number(row["test1"]),
                ":test2": Number(row["test2"]),
                ":test3": Number(row["test3"]),
                ":test4": Number(row["test4"]),
                ":test5": Number(row["test5"]),
              },
            });

            await awsDocDynamoDbClient.send(updateCommand);
          } else if (filteredStudents.length === 0) {
            console.error("Did not find: ", row["studentName"]);
          } else {
            console.error(
              "Found multiple students: ",
              row["studentName"],

              filteredStudents.map((student) => student.studentID)
            );
          }
        }
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
    region: "eu-north-1",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  await restoreStudentsProgressFromCsv(awsDocDynamoDbClient);
}

run();

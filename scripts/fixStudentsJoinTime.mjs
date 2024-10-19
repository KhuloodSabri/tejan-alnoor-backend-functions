import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

function trimStringQuotes(str) {
  let res = str.trim();

  if (res.startsWith('"') && res.endsWith('"')) {
    res = res.slice(1, -1);
  }

  return res.trim();
}

async function fixStudentsJoinTime(awsDocDynamoDbClient) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  const processingFilePromise = new Promise((resolve, reject) => {
    fs.createReadStream(
      "C:/Users/hp/Downloads/إضافة الطلاب على الموقع - Sheet1 (8).csv"
    )
      .pipe(csv())
      .on("data", async (row) => {
        if (!!row["اسم الطالب/ة"]?.length) {
          const filteredStudents = students.filter((student) => {
            return (
              trimStringQuotes(student.studentName) ===
              trimStringQuotes(row["اسم الطالب/ة"])
            );
          });

          if (filteredStudents.length === 1) {
            console.log("Processing student: ", row["اسم الطالب/ة"]);
            const updateCommand = new UpdateCommand({
              TableName: "Students",
              Key: {
                studentID: filteredStudents[0].studentID,
              },
              UpdateExpression: "SET #joinTime = :joinTime",
              ExpressionAttributeNames: {
                "#joinTime": "joinTime",
              },
              ExpressionAttributeValues: {
                ":joinTime": {
                  year: 2024,
                  semesterMonth: 1,
                  semester: 1,
                },
              },
            });

            await awsDocDynamoDbClient.send(updateCommand);
          } else if (filteredStudents.length === 0) {
            console.error("Did not find: ", row["اسم الطالب/ة"]);
          } else {
            console.error(
              "Found multiple students: ",
              row["اسم الطالب/ة"],

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
    // region: "eu-north-1",
    region: "local",
    endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  await fixStudentsJoinTime(awsDocDynamoDbClient);
}

run();

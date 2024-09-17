import fs from "fs";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
// import { BatchWriteItemCommand } from "@aws-sdk/lib-dynamodb";
const client = new DynamoDBClient({ region: "eu-north-1" });

const filePath = "C:/Users/hp/Downloads/tejan_alnoor/plans/students.csv";

fs.readFile(filePath, { encoding: "utf-8" }, async function (err, data) {
  if (!err) {
    const parsedData = data
      .split("\n")
      .map((line) => line.split(","))
      .slice(3);
    const startIndex = 100;
    const studentObjects = parsedData
      .slice(startIndex, startIndex + 20)
      .map((student, index) => ({
        studentID: {
          N: `${index + startIndex + 1}`,
        },
        supervisorName: { S: student[0] },
        studentName: { S: student[1] },
        gender: { S: student[2] === "ذكر" ? "male" : "female" },
        levelID: {
          N: student[3].includes("1")
            ? "1"
            : student[3].includes("2")
            ? "2"
            : student[3].includes("3")
            ? "3"
            : "0",
        },
        startWeek: { N: `${(Number(student[4]) - 1) * 4 + 1}` },
        memorizingProgress: { N: "0" },
        revisitProgress: { L: [] },
        test1: { N: "0" },
        test2: { N: "0" },
        test3: { N: "0" },
        test4: { N: "0" },
        test5: { N: "0" },
      }));

    // console.log(JSON.stringify(studentObjects, null, 2));
    fs.writeFileSync("test.txt", JSON.stringify(studentObjects, null, 2));

    const writeRequests = studentObjects.map((item) => ({
      PutRequest: {
        Item: item,
      },
    }));

    const writtenData = await client.send(
      new BatchWriteItemCommand({
        RequestItems: {
          Students: writeRequests,
        },
      })
    );
    console.log("BatchWriteItem succeeded:", writtenData);
  } else {
    console.log(err);
  }
});

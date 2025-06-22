import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const run = async () => {
  const client = new DynamoDBClient({
    // region: "eu-north-1",
    region: "local",
    endpoint: "http://localhost:8000",
  });

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  const firstWrongCommulativeOffset = 4089;
  const fixingDiff = 44;

  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
        })
      )
    )?.Items ?? [];

  for (const level of levels) {
    if (level.progressUnit === "ayah") {
      console.log(`Fixing level: ${level.levelID}`);
      const fixedPlan = level.weeksPlan.map((progress) => {
        if (
          progress[0] >= firstWrongCommulativeOffset &&
          progress[1] >= firstWrongCommulativeOffset
        ) {
          return [progress[0] + fixingDiff, progress[1] + fixingDiff];
        } else if (progress[1] >= firstWrongCommulativeOffset) {
          return [progress[0], progress[1] + fixingDiff];
        }

        return progress;
      });

      console.log(`Old: ${JSON.stringify(level.weeksPlan)}`);
      console.log(`New: ${JSON.stringify(fixedPlan)}`);
      await awsDocDynamoDbClient.send(
        new PutCommand({
          TableName: "Levels",
          Item: {
            levelID: level.levelID,
            ...level,
            weeksPlan: fixedPlan ?? level.weeksPlan,
          },
        })
      );
    }
  }

  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  for (const student of students) {
    const revisitProgress = student.revisitProgress ?? [];
    const needsFixing = revisitProgress.some(
      (progress) =>
        progress[0] >= firstWrongCommulativeOffset ||
        progress[1] >= firstWrongCommulativeOffset
    );

    if (needsFixing) {
      const fixedRevisitProgress = revisitProgress.flatMap((progress) => {
        if (
          progress[0] >= firstWrongCommulativeOffset &&
          progress[1] >= firstWrongCommulativeOffset
        ) {
          return [[progress[0] + fixingDiff, progress[1] + fixingDiff]];
        } else if (progress[1] >= firstWrongCommulativeOffset) {
          return [
            [progress[0], firstWrongCommulativeOffset],
            [
              firstWrongCommulativeOffset + fixingDiff,
              progress[1] + fixingDiff,
            ],
          ];
        }

        return [progress];
      });
      console.log(`Fixing student: ${student.studentID}`);
      console.log(`Old: ${JSON.stringify(revisitProgress)}`);
      console.log(`New: ${JSON.stringify(fixedRevisitProgress)}`);
      await awsDocDynamoDbClient.send(
        new PutCommand({
          TableName: "Students",
          Item: {
            studentID: student.studentID,
            ...student,
            revisitProgress: fixedRevisitProgress ?? student.revisitProgress,
          },
        })
      );
    }
  }
};
run();

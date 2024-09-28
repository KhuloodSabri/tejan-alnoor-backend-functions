import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const awsDynamoDbClient =
  process.env.DEV === "true"
    ? new DynamoDBClient({
        region: "local",
        endpoint: "http://localhost:8000",
      })
    : new DynamoDBClient({
        region: "eu-north-1",
      });

const awsDocDynamoDbClient = DynamoDBDocumentClient.from(awsDynamoDbClient);

function getStudentStartWeek(currentSemesterDetails, student) {
  const joinYear = student.joinTime.year;
  const joinSemester = student.joinTime.semester;
  const joinMonth = student.joinTime.semesterMonth;
  let monthsSinceJoin = (currentSemesterDetails.year - joinYear) * 7;

  monthsSinceJoin += (currentSemesterDetails.semester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= (joinSemester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= joinMonth - 1;

  monthsSinceJoin -= student.frozenSemesters.length * 7;

  return monthsSinceJoin * 4 + 1;
}

export async function getStudentsSheetRows() {
  console.log("getting current semester details");
  const currentSemesterDetails =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Configs",
          Key: {
            name: "currentSemester",
          },
        })
      )
    )?.Item?.value ?? null;

  console.log("getting students");

  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  console.log("getting levels");
  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
          ProjectionExpression: `levelID, levelName, weeksPlan`,
        })
      )
    )?.Items ?? [];

  console.log("got students and levels, mapping levels");
  const levelsMap = levels.reduce((acc, level) => {
    acc[level.levelID] = level;
    return acc;
  }, {});

  console.log("mapping students to rows");
  const studentsRows = students
    .sort((a, b) => a.studentID - b.studentID)
    .map((student) => {
      const studentLevel = levelsMap[student.levelID];
      const studentStartWeek = getStudentStartWeek(
        currentSemesterDetails,
        student
      );

      console.log("studentStartWeek", studentStartWeek);
      const revisitSummary = studentLevel.weeksPlan
        .slice(studentStartWeek - 1, studentStartWeek - 1 + 12)
        .map((week) => {
          if (
            student.revisitProgress.find(
              (range) => range[0] <= week[0] && range[1] >= week[1]
            )
          ) {
            return 1; //"✅";
          }

          return 0; // "❌";
        });

      const defaultRevisitFill = Array(
        Math.max(12 - revisitSummary.length, 0)
      ).fill("");

      return [
        Number(student.studentID),
        student.studentName,
        studentLevel.levelName,
        Math.floor(studentStartWeek / 4) + 1,
        Number(student.memorizingProgress),
        ...revisitSummary,
        ...defaultRevisitFill,
        Number(student.test1),
        Number(student.test2),
        Number(student.test3),
        Number(student.test4),
        Number(student.test5),
      ];
    });

  return studentsRows;
}

export async function getStudentsCount() {
  const params = {
    TableName: "Students", // Replace with your table name
    Select: "COUNT", // Retrieve only the item count
  };

  const command = new ScanCommand(params);
  const data = await awsDocDynamoDbClient.send(command);
  return data.Count;
}

// In progress
export async function createStudents(students) {
  const maxBatchSize = 25;
  const studentsChunks = [];
  const unprocessedItems = [];

  for (let i = 0; i < students.length; i += maxBatchSize) {
    studentsChunks.push(students.slice(i, i + maxBatchSize));
  }

  for (const chunk of studentsChunks) {
    const response = await awsDocDynamoDbClient.send(
      new BatchWriteCommand({
        RequestItems: {
          Students: chunk.map((student) => ({
            PutRequest: {
              Item: student,
            },
          })),
        },
      })
    );

    unprocessedItems.push(...(response.UnprocessedItems ?? []));
  }

  console.log("unprocessedItems", unprocessedItems);
}

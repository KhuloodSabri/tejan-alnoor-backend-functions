import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
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

function findNaN(object, keys) {
  return keys.find(
    (key) => object[key] !== undefined && isNaN(Number(object[key]))
  );
}

async function getStudentStartWeek(student) {
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

  const joinYear = student.joinTime.year;
  const joinSemester = student.joinTime.semester;
  const joinMonth = student.joinTime.semesterMonth;
  let monthsSinceJoin = (currentSemesterDetails.year - joinYear) * 7;

  monthsSinceJoin += (currentSemesterDetails.semester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= (joinSemester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= joinMonth - 1;

  return monthsSinceJoin * 4 + 1;
}

export async function getRegularStudents() {
  return (
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression: "#status = :status", // Filtering based on the status attribute
          ExpressionAttributeNames: {
            "#status": "status", // 'status' is the attribute we're filtering on
          },
          ExpressionAttributeValues: {
            ":status": "منتظم/ة", // Only retrieve items where status is 'active'
          },
          ProjectionExpression:
            "studentID, studentName, levelID, supervisorName, gender",
        })
      )
    )?.Items ?? []
  );
}

export async function getStudentByID(studentID) {
  const student =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Students",
          Key: {
            studentID,
          },
        })
      )
    )?.Item ?? {};

  if (!student) {
    return null;
  }
  const studentStartWeek = await getStudentStartWeek(student);

  const studentLevel =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Levels",
          Key: {
            levelID: student.levelID,
          },
          ProjectionExpression: `levelName, progressUnit, weeksPlan[${
            studentStartWeek - 1
          }][0], weeksPlan[${studentStartWeek - 1 + 3}][1], weeksPlan[${
            studentStartWeek - 1 + 7
          }][1],weeksPlan[${studentStartWeek - 1 + 11}][1]`,
        })
      )
    )?.Item ?? {};

  return {
    ...student,
    levelName: studentLevel.levelName,
    progressUnit: studentLevel.progressUnit,
    start: studentLevel.weeksPlan[0][0],
    end:
      studentLevel.weeksPlan[3]?.[0] ??
      studentLevel.weeksPlan[2]?.[0] ??
      studentLevel.weeksPlan[1]?.[0],
  };
}

export function validateUpdateStudentRequest(studentID, body) {
  if (body.studentID !== studentID) {
    console.log(
      "studentID in body does not match path " +
        body.studentID +
        " " +
        studentID
    );
    throw new Error("Bad Request");
  }

  const {
    studentID: _studentID,
    memorizingProgress,
    revisitProgress,
    test1,
    test2,
    test3,
    test4,
    test5,
    ...rest
  } = body;

  if (Object.keys(rest).length > 0) {
    console.log("Body has forbidden keys " + JSON.stringify(rest));
    throw new Error("Bad Request");
  }

  if (
    Object.values({
      memorizingProgress,
      revisitProgress,
      test1,
      test2,
      test3,
      test4,
      test5,
    }).filter((value) => value !== undefined).length === 0
  ) {
    console.log("Body has no updates " + JSON.stringify(body));
    throw new Error("Bad Request");
  }

  const notValidNumberAttr = findNaN(body, [
    "memorizingProgress",
    "test1",
    "test2",
    "test3",
    "test4",
    "test5",
  ]);

  if (notValidNumberAttr) {
    console.log(
      `${notValidNumberAttr} is not a number ` + JSON.stringify(body)
    );
    throw new Error("Bad Request");
  }

  if (
    revisitProgress !== undefined &&
    (!Array.isArray(revisitProgress) ||
      revisitProgress.some(
        (range) =>
          !Array.isArray(range) ||
          range?.length !== 2 ||
          range.some((item) => isNaN(Number(item))) ||
          Number(range[0]) > Number(range[1])
      ))
  ) {
    console.log(
      "revisitProgress is not an array of ranges " + JSON.stringify(body)
    );
    throw new Error("Bad Request");
  }
}

export async function updateStudent(studentID, body) {
  const {
    memorizingProgress,
    revisitProgress,
    test1,
    test2,
    test3,
    test4,
    test5,
  } = body;

  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (memorizingProgress !== undefined) {
    updateExpressions.push("#memorizingProgress = :memorizingProgress ");
    expressionAttributeNames["#memorizingProgress"] = "memorizingProgress";
    expressionAttributeValues[":memorizingProgress"] =
      Number(memorizingProgress);
  }

  if (revisitProgress !== undefined) {
    const parsedRevisitProgress = revisitProgress.map((range) => [
      Number(range[0]),
      Number(range[1]),
    ]);
    parsedRevisitProgress.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const mergedProgress = [];
    let currentRange = parsedRevisitProgress?.[0];

    for (let i = 1; i < parsedRevisitProgress.length; i++) {
      if (currentRange[1] >= parsedRevisitProgress[i][0] - 1) {
        currentRange[1] = Math.max(
          currentRange[1],
          parsedRevisitProgress[i][1]
        );
      } else {
        mergedProgress.push(currentRange);
        currentRange = parsedRevisitProgress[i];
      }
    }

    if (currentRange) {
      mergedProgress.push(currentRange);
    }

    updateExpressions.push("#revisitProgress = :revisitProgress ");
    expressionAttributeNames["#revisitProgress"] = "revisitProgress";
    expressionAttributeValues[":revisitProgress"] = mergedProgress;
  }

  if (test1 !== undefined) {
    updateExpressions.push("#test1 = :test1 ");
    expressionAttributeNames["#test1"] = "test1";
    expressionAttributeValues[":test1"] = Number(test1);
  }

  if (test2 !== undefined) {
    updateExpressions.push("#test2 = :test2 ");
    expressionAttributeNames["#test2"] = "test2";
    expressionAttributeValues[":test2"] = Number(test2);
  }

  if (test3 !== undefined) {
    updateExpressions.push("#test3 = :test3 ");
    expressionAttributeNames["#test3"] = "test3";
    expressionAttributeValues[":test3"] = Number(test3);
  }

  if (test4 !== undefined) {
    updateExpressions.push("#test4 = :test4 ");
    expressionAttributeNames["#test4"] = "test4";
    expressionAttributeValues[":test4"] = Number(test4);
  }

  if (test5 !== undefined) {
    updateExpressions.push("#test5 = :test5 ");
    expressionAttributeNames["#test5"] = "test5";
    expressionAttributeValues[":test5"] = Number(test5);
  }

  const params = {
    TableName: "Students",
    Key: {
      studentID: studentID,
    },
    UpdateExpression: "SET " + updateExpressions.join(", "),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "UPDATED_NEW",
  };

  try {
    const data = await awsDocDynamoDbClient.send(new UpdateCommand(params));
    console.log("Update student succeeded:", data?.Attributes ?? {});
    return data?.Attributes ?? {};
  } catch (error) {
    console.error("Update student  failed:", error);
    throw error;
  }
}

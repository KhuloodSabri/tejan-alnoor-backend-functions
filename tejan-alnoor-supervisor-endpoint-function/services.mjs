import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import * as Yup from "yup";

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

export async function getConfig(configName) {
  return (
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Configs",
          Key: {
            name: configName,
          },
        })
      )
    )?.Item?.value ?? null
  );
}

export async function getActiveStudents() {
  const activeStudents =
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
            "studentID, studentName, levelID, supervisorID, gender",
        })
      )
    )?.Items ?? [];

  const supervisorIds = [
    ...new Set(activeStudents.map((student) => student.supervisorID)),
  ];

  let supervisorsMap = {};

  for (let i = 0; i < supervisorIds.length; i += 100) {
    const supervisorIdsBatch = supervisorIds.slice(i, i + 100);

    const supervisorsBatch =
      (
        await awsDocDynamoDbClient.send(
          new BatchGetCommand({
            RequestItems: {
              Supervisors: {
                Keys: supervisorIdsBatch.map((supervisorID) => ({
                  supervisorID,
                })),
              },
            },
          })
        )
      )?.Responses?.Supervisors ?? [];

    supervisorsMap = {
      ...supervisorsMap,
      ...supervisorsBatch.reduce((acc, supervisor) => {
        acc[supervisor.supervisorID] = supervisor;
        return acc;
      }, {}),
    };
  }

  return activeStudents.map((student) => ({
    ...student,
    supervisorName: supervisorsMap[student.supervisorID]?.supervisorName,
  }));
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

          ProjectionExpression: `studentID, studentName, levelID, supervisorID, memorizingProgress,
             revisitProgress, tests, gender, frozenSemesters, joinYear, joinSemester, joinMonth,
             levelChanges`,
        })
      )
    )?.Item ?? {};

  if (!student) {
    return null;
  }

  const studentLevel =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Levels",
          Key: {
            levelID: student.levelID,
          },
          ProjectionExpression: `levelName, progressUnit, weeksPlan`,
        })
      )
    )?.Item ?? {};

  const studentSupervisor =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Supervisors",
          Key: {
            supervisorID: student.supervisorID,
          },
        })
      )
    )?.Item ?? {};

  return {
    ...student,
    levelName: studentLevel.levelName,
    progressUnit: studentLevel.progressUnit,
    levelRevisitWeeksPlan: studentLevel.weeksPlan,
    supervisorName: studentSupervisor.supervisorName,
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

  const gradeSchema = Yup.number()
    .transform((value, originalValue) =>
      originalValue ? Number(originalValue) : originalValue
    )
    .min(0)
    .max(100)
    .optional();

  // Define the innermost schema for { [1 or 2 or 3 or 4 or 5]: number }
  const semesterTestsSchema = Yup.object()
    .shape({
      1: gradeSchema,
      2: gradeSchema,
      3: gradeSchema,
      4: gradeSchema,
      5: gradeSchema,
    })
    .noUnknown()
    .optional(); // Prevent unknown keys

  // Define the schema for { [1 or 2 or 3]: { [1 or 2 or 3 or 4 or 5]: number } }
  const yearTestsSchema = Yup.object()
    .shape({
      1: semesterTestsSchema,
      2: semesterTestsSchema,
      3: semesterTestsSchema,
    })
    .noUnknown(); // Prevent unknown keys

  const rangePairSchema = Yup.array()
    .of(Yup.number().min(1).required()) // Ensure both values are integers and required
    .length(2) // Ensure there are exactly 2 items in each pair
    .test(
      "range-order",
      "rangeFromInteger must be <= rangeToInteger",
      (arr) => {
        return arr[0] <= arr[1]; // Ensure rangeFrom <= rangeTo
      }
    );

  const schema = Yup.object({
    tests: Yup.lazy((value) =>
      Yup.object(
        Object.keys(value || {}).reduce((acc, key) => {
          if (/^\d{4}$/.test(key) && parseInt(key) >= 2000) {
            acc[key] = yearTestsSchema;
          }
          return acc;
        }, {})
      )
    ).optional(),
    revisitProgress: Yup.array().of(rangePairSchema).optional(),
    memorizingProgress: Yup.number().min(0).optional(),
  });

  try {
    schema.validateSync(body);
  } catch (err) {
    console.error("Validation error: ", err.errors);
    throw new Error("Bad Request");
  }

  if (body?.tests) {
    const tests = body.tests;
    Object.keys(tests).some((year) => {
      const numYear = Number(year);

      if (isNaN(numYear)) {
        console.log(`year ${year} is not a number`);
        throw new Error("Bad Request");
      }

      if (parseInt(year) !== numYear) {
        console.log(`year ${year} is not an integer`);
        throw new Error("Bad Request");
      }

      if (numYear < 2000) {
        console.log(`year ${year} is less than 2000`);
        throw new Error("Bad Request");
      }

      if (numYear > 3000) {
        console.log(`year ${year} is greater than 3000`);
        throw new Error("Bad Request");
      }
    });
  }
}

export async function updateStudent(studentID, body) {
  const { memorizingProgress, revisitProgress, tests } = body;

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

  if (tests !== undefined) {
    let mergedTests =
      (
        await awsDocDynamoDbClient.send(
          new GetCommand({
            TableName: "Students",
            Key: {
              studentID: studentID,
            },
            ProjectionExpression: "tests",
          })
        )
      )?.Item?.tests ?? {};

    for (const year of Object.keys(tests ?? {})) {
      for (const semester of Object.keys(tests[year] ?? {})) {
        for (const test of Object.keys(tests[year][semester] ?? {})) {
          const testValue = tests[year][semester][test];

          mergedTests = {
            ...mergedTests,
            [year]: {
              ...mergedTests[year],
              [semester]: {
                ...mergedTests[year]?.[semester],
                [test]: testValue,
              },
            },
          };
        }
      }
    }

    updateExpressions.push(`#tests = :tests`);
    expressionAttributeNames[`#tests`] = `tests`;
    expressionAttributeValues[`:tests`] = mergedTests;
  }

  updateExpressions.push("#updatedAt = :updatedAt");
  expressionAttributeNames["#updatedAt"] = "updatedAt";
  expressionAttributeValues[":updatedAt"] = Date.now();

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

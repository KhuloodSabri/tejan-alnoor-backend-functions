import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const SECRET_KEY = "tejan_al_noor";
const tableName = "Students";

let secrets = undefined;
const awsSecretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

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

async function getSecretValue(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await awsSecretsClient.send(command);

    if ("SecretString" in response) {
      return JSON.parse(response.SecretString);
    } else {
      const buff = Buffer.from(response.SecretBinary, "base64");
      return JSON.parse(buff.toString("ascii"));
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function init() {
  secrets = await getSecretValue(SECRET_KEY);
}

function buildResponse(code, body) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function findNaN(object, keys) {
  return keys.find(
    (key) => object[key] !== undefined && isNaN(Number(object[key]))
  );
}

const initPromise = init();

export const handler = async (event) => {
  console.log("starting hereeeeeee");
  console.log("event" + JSON.stringify(event, null, 2));
  const httpMethod = event.requestContext.http.method;
  const queryParams = event.queryStringParameters || {};
  const body = JSON.parse(event.body ?? "{}");
  const path = event.rawPath || event.requestContext.http.path;
  const origin = event.headers.origin;

  if (httpMethod === "OPTIONS") {
    console.log("OPTIONS");
    return buildResponse(200, "OK");
  }

  if (httpMethod !== "PUT" && httpMethod !== "GET") {
    return buildResponse(405, "Method Not Allowed");
  }

  await initPromise;

  // const token = queryParams["token"];

  // if (token !== secrets["access-token"]) {
  //   return buildResponse( 401, "Unauthorized");
  // }

  if (!path.startsWith("/students")) {
    return buildResponse(404, "Not Found");
  }

  if (httpMethod === "GET") {
    if (path === "/students") {
      const response = await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: tableName,
          ProjectionExpression:
            "studentID, studentName, levelID, supervisorName, gender",
        })
      );

      return buildResponse(200, response?.Items ?? []);
    }

    if (path.split("/") < 3 || isNaN(Number(path.split("/")[2]))) {
      return buildResponse(400, "Bad Request");
    }

    const studentID = Number(path.split("/")[2]);
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
      return buildResponse(404, "Not Found");
    }

    const studentLevel =
      (
        await awsDocDynamoDbClient.send(
          new GetCommand({
            TableName: "Levels",
            Key: {
              levelID: student.levelID,
            },
            ProjectionExpression: `levelName, progressUnit, weeksPlan[${
              student.startWeek - 1
            }][0], weeksPlan[${student.startWeek - 1 + 3}][1], weeksPlan[${
              student.startWeek - 1 + 7
            }][1],weeksPlan[${student.startWeek - 1 + 11}][1]`,
          })
        )
      )?.Item ?? {};

    console.log("studentLevel", studentLevel);

    return buildResponse(200, {
      ...student,
      levelName: studentLevel.levelName,
      progressUnit: studentLevel.progressUnit,
      start: studentLevel.weeksPlan[0][0],
      end:
        studentLevel.weeksPlan[3]?.[0] ??
        studentLevel.weeksPlan[2]?.[0] ??
        studentLevel.weeksPlan[1]?.[0],
    });
  }

  if (!body) {
    console.log("Body is empty");
    return buildResponse(400, "Bad Request");
  }

  if (path.split("/") < 3 || isNaN(Number(path.split("/")[2]))) {
    console.log("Path is invalid " + path);
    return buildResponse(400, "Bad Request");
  }

  const studentID = Number(path.split("/")[2]);

  if (body.studentID !== studentID) {
    console.log("studentID in body does not match path");
    return buildResponse(400, "Bad Request");
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
    return buildResponse(400, "Bad Request");
  }

  console.log("here 1");

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
    return buildResponse(400, "Bad Request");
  }

  console.log("here 2");

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
    return buildResponse(400, "Bad Request");
  }

  console.log("here 3");
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
    return buildResponse(400, "Bad Request");
  }

  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (memorizingProgress !== undefined) {
    updateExpressions.push("#memorizingProgress = :memorizingProgress ");
    expressionAttributeNames["#memorizingProgress"] = "memorizingProgress";
    expressionAttributeValues[":memorizingProgress"] = memorizingProgress;
  }

  if (revisitProgress !== undefined) {
    revisitProgress.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const mergedProgress = [];
    let currentRange = revisitProgress?.[0];

    for (let i = 1; i < revisitProgress.length; i++) {
      if (currentRange[1] >= revisitProgress[i][0] - 1) {
        currentRange[1] = Math.max(currentRange[1], revisitProgress[i][1]);
      } else {
        mergedProgress.push(currentRange);
        currentRange = revisitProgress[i];
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
    expressionAttributeValues[":test1"] = test1;
  }

  if (test2 !== undefined) {
    updateExpressions.push("#test2 = :test2 ");
    expressionAttributeNames["#test2"] = "test2";
    expressionAttributeValues[":test2"] = test2;
  }

  if (test3 !== undefined) {
    updateExpressions.push("#test3 = :test3 ");
    expressionAttributeNames["#test3"] = "test3";
    expressionAttributeValues[":test3"] = test3;
  }

  if (test4 !== undefined) {
    updateExpressions.push("#test4 = :test4 ");
    expressionAttributeNames["#test4"] = "test4";
    expressionAttributeValues[":test4"] = test4;
  }

  if (test5 !== undefined) {
    updateExpressions.push("#test5 = :test5 ");
    expressionAttributeNames["#test5"] = "test5";
    expressionAttributeValues[":test5"] = test5;
  }

  console.log("here 4");

  const params = {
    TableName: "Students", // Replace with your table name
    Key: {
      studentID: studentID, // Replace with your primary key and value
    },
    UpdateExpression: "SET " + updateExpressions.join(", "),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "UPDATED_NEW", // Optionally return updated attributes
  };

  try {
    const data = await awsDocDynamoDbClient.send(new UpdateCommand(params));
    console.log("Update student succeeded:", data.Attributes);
    return buildResponse(200, data?.Attributes ?? {});
  } catch (error) {
    console.error("Update student  failed:", error);
    return buildResponse(500, "Internal Server Error");
  }
};

// const httpMethod = event.requestContext.http.method;
// const queryParams = event.queryStringParameters || {};
// const body = JSON.parse(event.body ?? "{}");
// const path = event.rawPath || event.requestContext.http.path;

// handler({
//   requestContext: {
//     http: {
//       method: "GET",
//       path: "/students/1",
//     },
//   },
//   queryStringParameters: {
//     token: "nhXpMMw!fnEmOVFVDRl13jqmrwU7M#",
//   },
// }).then((res) => console.log("test", res));

// handler({
//   requestContext: {
//     http: {
//       method: "PUT",
//       path: "/students/1",
//     },
//   },
//   queryStringParameters: {
//     token: "nhXpMMw!fnEmOVFVDRl13jqmrwU7M#",
//   },
//   body: JSON.stringify({
//     studentID: 1,
//     // memorizingProgress: 474,
//     revisitProgress: [
//       [452, 460],
//       [461, 470],
//       [475, 480],
//     ],
//   }),
// }).then((res) => console.log("test", res));

// 1, 33

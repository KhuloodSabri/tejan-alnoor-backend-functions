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
import {
  getAccessToken,
  writeToGoogleSheet,
  SPREADSHEET_ID,
} from "./googleApi.mjs";

let secrets = undefined;
const awsSecretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});
const awsDynamoDbClient = new DynamoDBClient({
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

const initPromise = init();

export const handler = async (event) => {
  console.log("starting hereeeeeee");
  console.log("event" + JSON.stringify(event));
  const httpMethod = event.requestContext.http.method;
  const queryParams = event.queryStringParameters || {};
  const body = JSON.parse(event.body ?? "{}");
  const path = event.rawPath || event.requestContext.http.path;
  const origin = event.headers.origin;

  if (httpMethod === "OPTIONS") {
    console.log("OPTIONS");
    return buildResponse(200, "OK");
  }

  if (httpMethod !== "GET") {
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

  if (httpMethod === "GET" && path === "/students/exportProgress") {
    console.log("getting students");
    const students =
      (
        await awsDocDynamoDbClient.send(
          new ScanCommand({
            TableName: "Students",
            ProjectionExpression:
              "studentID, studentName, levelID, startWeek, memorizingProgress, revisitProgress, test1, test2, test3, test4, test5",
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
        const revisitSummary = studentLevel.weeksPlan
          .slice(student.startWeek - 1, student.startWeek - 1 + 12)
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
          Math.floor(student.startWeek / 4) + 1,
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

    console.log("getting google api token");
    const googleApiToken = await getAccessToken(
      JSON.parse(secrets["service-account"])
    );

    console.log("writing to google sheet");
    await writeToGoogleSheet(googleApiToken, studentsRows);
    console.log("done writing to google sheet");
    return buildResponse(200, {
      spreadsheetId: SPREADSHEET_ID,
    });
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
//       path: "/students/exportProgress",
//     },
//   },
//   queryStringParameters: {
//     token: "nhXpMMw!fnEmOVFVDRl13jqmrwU7M#",
//   },
//   headers: {
//     origin: "http://localhost:3000",
//   },
// }).then((res) => console.log("test", res));

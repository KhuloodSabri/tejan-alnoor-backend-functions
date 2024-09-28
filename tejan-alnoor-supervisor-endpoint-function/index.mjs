import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import {
  getRegularStudents,
  getStudentByID,
  validateUpdateStudentRequest,
  updateStudent,
} from "./services.mjs";

const SECRET_KEY = "tejan_al_noor";

let secrets = undefined;
const awsSecretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

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
  const { headers, ...restEvent } = event;
  console.log("Processing event: " + JSON.stringify(restEvent, null, 2));
  const httpMethod = event.requestContext.http.method;
  const queryParams = event.queryStringParameters || {};
  const body = JSON.parse(event.body ?? "{}");
  const path = event.rawPath || event.requestContext.http.path;

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
      const students = await getRegularStudents();
      return buildResponse(200, students);
    }

    if (path.split("/").length !== 3 || isNaN(Number(path.split("/")[2]))) {
      return buildResponse(404, "Not Found");
    }

    const studentID = Number(path.split("/")[2]);
    const student = await getStudentByID(studentID);

    if (!student) {
      return buildResponse(404, "Not Found");
    }

    return buildResponse(200, student);
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

  try {
    validateUpdateStudentRequest(studentID, body);
  } catch (error) {
    return buildResponse(400, "Bad Request");
  }

  const updatedStudent = await updateStudent(studentID, body);

  return buildResponse(200, updatedStudent);
};

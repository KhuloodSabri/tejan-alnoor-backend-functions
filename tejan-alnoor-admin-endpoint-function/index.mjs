import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const SECRET_KEY = "tejan_al_noor";
import {
  getAccessToken,
  writeToGoogleSheet,
  SPREADSHEET_ID,
} from "./googleApi.mjs";
import {
  createStudents,
  getStudentsSheetRows,
  updateStudents,
  validateStudents,
  validateStudentsAgainstDB,
} from "./services.mjs";
import { validateToken } from "./auth.mjs";

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
  console.log("event" + JSON.stringify(restEvent, null, 2));
  const httpMethod = event.requestContext.http.method;
  const queryParams = event.queryStringParameters || {};
  const body = JSON.parse(event.body ?? "{}");
  const path = event.rawPath || event.requestContext.http.path;
  const origin = event.headers.origin;

  try {
    await validateToken(event.headers.authorization);
  } catch (error) {
    console.error(error);
    return buildResponse(error.status ?? 500, error.message);
  }

  if (httpMethod === "OPTIONS") {
    console.log("OPTIONS");
    return buildResponse(200, "OK");
  }

  await initPromise;

  if (!path.startsWith("/students")) {
    return buildResponse(404, "Not Found");
  }

  if (httpMethod === "GET" && path === "/students/exportProgress") {
    const studentsRows = await getStudentsSheetRows();

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

  if (httpMethod === "POST" && path === "/students") {
    const validationErrors = validateStudents(body);

    if (validationErrors.length > 0) {
      return buildResponse(400, {
        validationErrors,
      });
    }

    try {
      await validateStudentsAgainstDB(body);
    } catch (error) {
      console.error(error);
      return buildResponse(500, {
        validationErrors: [error.message],
      });
    }

    const response = await createStudents(body);
    return buildResponse(200, response);
  }

  if (httpMethod === "PUT" && path === "/students") {
    const validationErrors = validateStudents(body);

    if (validationErrors.length > 0) {
      return buildResponse(400, {
        validationErrors,
      });
    }

    try {
      await validateStudentsAgainstDB(body);
    } catch (error) {
      console.error(error);
      return buildResponse(500, {
        validationErrors: [error.message],
      });
    }

    const response = await updateStudents(body);
    return buildResponse(200, response);
  }

  return buildResponse(404, "Not Found");
};

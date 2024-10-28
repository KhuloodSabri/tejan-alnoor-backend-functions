import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const SECRET_KEY = "tejan_al_noor";
import {
  getAccessToken,
  writeToGoogleSheet,
  BRIEF_SUMMARY_SPREADSHEET_ID,
  createSheetInGoogleDrive,
  copySheet,
  TEMPLATE_SPREADSHEET_ID,
  renameSheet,
  deleteSheet,
  clearSheet,
  DRIVE_FOLDER_ID,
} from "./googleApi.mjs";
import {
  addSemesterDetails,
  createStudents,
  getSemester,
  getStudentsBriefSheetRows,
  getStudentsDetailedSheetRows,
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

async function initializeSemester(
  semesterYear,
  semesterNumber,
  googleApiToken
) {
  const spreadsheetId = await createSheetInGoogleDrive(
    googleApiToken,
    `${semesterYear}-${semesterNumber}`
  );

  const copiedSheet = await copySheet(
    googleApiToken,
    TEMPLATE_SPREADSHEET_ID,
    spreadsheetId,
    0
  );

  await renameSheet(
    googleApiToken,
    spreadsheetId,
    copiedSheet.sheetId,
    "Summary"
  );

  await deleteSheet(googleApiToken, spreadsheetId, 0);

  return await addSemesterDetails(semesterYear, semesterNumber, spreadsheetId);
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

  if (httpMethod === "GET" && path === "/students/summariesFolder") {
    return buildResponse(200, {
      folderId: DRIVE_FOLDER_ID,
    });
  }

  if (httpMethod === "GET" && path === "/students/exportProgress") {
    const studentsRows = await getStudentsBriefSheetRows();
    console.log("getting google api token");
    const googleApiToken = await getAccessToken(
      JSON.parse(secrets["service-account"])
    );
    await clearSheet(googleApiToken, BRIEF_SUMMARY_SPREADSHEET_ID, "Sheet1", 1);
    await writeToGoogleSheet(
      googleApiToken,
      studentsRows,
      BRIEF_SUMMARY_SPREADSHEET_ID,
      "Sheet1",
      1
    );

    console.log("done writing to google sheet");
    return buildResponse(200, {
      spreadsheetId: BRIEF_SUMMARY_SPREADSHEET_ID,
    });
  }

  if (httpMethod === "GET" && path === "/students/exportProgressDetailed") {
    const semesterYear = Number(queryParams.year);
    const semesterNumber = Number(queryParams.semester);
    if (
      isNaN(semesterYear) ||
      isNaN(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 3 ||
      semesterYear < 2000
    ) {
      return buildResponse(400, "Invalid semester details");
    }

    const studentsRows = await getStudentsDetailedSheetRows(
      semesterYear,
      semesterNumber
    );
    console.log("getting google api token");
    const googleApiToken = await getAccessToken(
      JSON.parse(secrets["service-account"])
    );

    const semsterDetails = await getSemester(semesterYear, semesterNumber);
    let spreadsheetId;

    if (!semsterDetails) {
      console.log("creating new google sheet");
      spreadsheetId = (
        await initializeSemester(semesterYear, semesterNumber, googleApiToken)
      ).spreadsheetId;
    } else {
      spreadsheetId = semsterDetails.spreadsheetId;
    }

    await clearSheet(googleApiToken, spreadsheetId, "Summary", 3);
    await writeToGoogleSheet(
      googleApiToken,
      studentsRows,
      spreadsheetId,
      "Summary",
      3
    );

    console.log("done writing to google sheet");
    return buildResponse(200, {
      spreadsheetId: spreadsheetId,
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

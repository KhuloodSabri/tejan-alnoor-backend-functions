import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

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
  getSheetsMetadata,
} from "./googleApi.mjs";
import {
  addSemesterDetails,
  createStudents,
  getLevels,
  getSemester,
  getStudentById,
  getStudentsBriefSheetRows,
  getStudentsDetailedSheetRows,
  replaceStudents,
  searchStudentsByName,
  searchSupervisorsByName,
  setSemesterUpdateDate,
  updateStudent,
  validateStudents,
  validateStudentsAgainstDB,
  validateUpdateStudentBody,
} from "./services.mjs";
import { validateToken } from "./auth.mjs";
import { addAlert } from "./alerts.mjs";

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
async function updateSheetTemplate(googleApiToken, spreadsheetId) {
  const oldSheetsMetadata = await getSheetsMetadata(
    googleApiToken,
    spreadsheetId
  );

  const copiedSheet = await copySheet(
    googleApiToken,
    TEMPLATE_SPREADSHEET_ID,
    spreadsheetId,
    0
  );

  await Promise.all(
    oldSheetsMetadata.map((sheetMetadata) =>
      deleteSheet(googleApiToken, spreadsheetId, sheetMetadata.sheetId)
    )
  );

  await renameSheet(
    googleApiToken,
    spreadsheetId,
    copiedSheet.sheetId,
    "Summary"
  );
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

    const semesterDetails = await getSemester(semesterYear, semesterNumber);
    let spreadsheetId;

    if (!semesterDetails) {
      console.log("creating new google sheet");
      spreadsheetId = (
        await initializeSemester(semesterYear, semesterNumber, googleApiToken)
      ).spreadsheetId;
    } else {
      spreadsheetId = semesterDetails.spreadsheetId;

      const lastUpdateDate = Boolean(semesterDetails.updatedAt)
        ? new Date(semesterDetails.updatedAt)
        : new Date(semesterDetails.createdAt);
      const lastTemplateChangeDate = new Date("2025-07-28");

      if (lastUpdateDate < lastTemplateChangeDate) {
        console.log("Updating sheet template");

        await updateSheetTemplate(
          googleApiToken,
          semesterDetails.spreadsheetId
        );
      }

      await setSemesterUpdateDate(semesterYear, semesterNumber);
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

    const response = await replaceStudents(body);
    return buildResponse(200, response);
  }

  if (httpMethod === "GET" && path === "/students") {
    if (!queryParams.name) {
      return buildResponse(400, "Missing name query parameter");
    }
    const response = await searchStudentsByName(queryParams.name);
    return buildResponse(200, response);
  }

  if (httpMethod === "GET" && path === "/supervisors") {
    if (!queryParams.name) {
      return buildResponse(400, "Missing name query parameter");
    }
    const response = await searchSupervisorsByName(queryParams.name);
    return buildResponse(200, response);
  }

  if (httpMethod === "GET" && path.startsWith("/students/")) {
    if (path.replace("/students/", "").length === 0) {
      return buildResponse(400, "Missing student ID");
    }
    const studentId = path.replace("/students/", "");

    const student = await getStudentById(studentId, { supervisorName: true });

    if (!student) {
      return buildResponse(400, "Student not found");
    }

    return buildResponse(200, student);
  }

  if (httpMethod === "PUT" && path.startsWith("/students/")) {
    if (path.replace("/students/", "").length === 0) {
      return buildResponse(400, "Missing student ID");
    }
    const studentId = path.replace("/students/", "");

    const existingStudent = await getStudentById(studentId, {});

    if (!existingStudent) {
      return buildResponse(400, "Student not found");
    }

    try {
      validateUpdateStudentBody(body);
    } catch (error) {
      console.error(error);
      return buildResponse(400, "Bad Request");
    }

    await updateStudent(
      studentId,
      {
        ...existingStudent,
        ...body,
      },
      existingStudent
    );

    return buildResponse(200, {
      ...existingStudent,
      ...body,
    });
  }

  if (httpMethod === "GET" && path === "/levels") {
    const response = await getLevels();
    return buildResponse(200, response);
  }
  if (httpMethod === "POST" && path === "/alertStudents") {
    try {
      const response = await addAlert(body);
      return buildResponse(200, response);
    } catch (error) {
      console.error(error);
      return buildResponse(500, {
        validationErrors: [error.message],
      });
    }
  }

  return buildResponse(404, "Not Found");
};

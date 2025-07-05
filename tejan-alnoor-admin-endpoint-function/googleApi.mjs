import crypto from "crypto";

export const BRIEF_SUMMARY_SPREADSHEET_ID =
  process.env.DEV === "true"
    ? "1_utL2VYccQEGe5il7_URxybDmwJolATQiQlP81rOfJE"
    : "1VKAM1-EuXJqK7O3sjPhPnGhWAqUxVUmogxDJp3GRM5Y";

export const DRIVE_FOLDER_ID =
  process.env.DEV === "true"
    ? "1RYNInObIuUogG0JDCKzPZ0jHgxUsasjc"
    : "1nWaMPuw6UvES_1HuNm7-RD3ylEku94ax";

export const TEMPLATE_SPREADSHEET_ID =
  process.env.DEV === "true"
    ? "1igMG9tlsSCoGhdf8D3K3IGMmiBz9DtwVnhlW42H_UO0"
    : "1AiCskd_4VRg03rqtSqViQ1PSaWS3v7TKVKveVbIdQQk";

function numberToColumnName(number) {
  let columnName = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    number = Math.floor((number - 1) / 26);
  }
  return columnName;
}

// Helper function to make API requests
async function apiRequest(url, method, accessToken, body) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  const response = await fetch(url, options);
  return response.json();
}

export async function getAccessToken(serviceAccount) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600; // Token expires in 1 hour

  const payload = {
    iss: serviceAccount.client_email,
    scope:
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",

    aud: "https://oauth2.googleapis.com/token",
    exp: exp,
    iat: iat,
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header))
    .toString("base64")
    .replace(/=+$/, "");
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/=+$/, "");

  // Create the signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signatureInput)
    .sign(serviceAccount.private_key, "base64")
    .replace(/=+$/, "");

  // Create the JWT
  const jwt = `${signatureInput}.${signature}`;

  // Request an access token from Google's OAuth 2.0 server
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  return data.access_token;
}

export async function writeToGoogleSheet(
  accessToken,
  values,
  spreadsheetId,
  sheetName = "Sheet1",
  skippedRows = 0
) {
  if (!values?.length) {
    console.log("No data to write to Google Sheet");
    return;
  }

  const columnsCount = values.reduce((columnsCount, row) => {
    return row.length > columnsCount ? row.length : columnsCount;
  }, 0);

  const range = `A${skippedRows + 1}:${numberToColumnName(columnsCount)}${
    values.length + skippedRows
  }`; // The range where you want to write data

  // user_entered  -> This is key to making it work as a formula
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}?valueInputOption=USER_ENTERED`;

  const data = {
    values: values,
  };

  const options = {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  };

  try {
    const response = await fetch(url, options);
    const result = await response.json();

    if (response.ok) {
      console.log("Data written to Google Sheet successfully:", result);
    } else {
      console.error("Failed to write data to Google Sheet:", result);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

export const createSheetInGoogleDrive = async (accessToken, fileName) => {
  const metadata = {
    name: fileName,
    mimeType: "application/vnd.google-apps.spreadsheet", // Google Spreadsheet MIME type
    parents: [DRIVE_FOLDER_ID], // Specify the folder ID where the file should be created
  };

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    console.error("Error creating spreadsheet:", response.statusText);
    return;
  }

  const jsonResponse = await response.json();
  const spreadsheetId = jsonResponse.id; // This is the created spreadsheet ID
  console.log("Spreadsheet created with ID:", spreadsheetId);

  return spreadsheetId;
};

export async function copySheet(
  accessToken,
  sourceSpreadsheetId,
  destinationSpreadsheetId,
  sourceSheetId = 0
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sourceSpreadsheetId}/sheets/${sourceSheetId}:copyTo`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destinationSpreadsheetId: destinationSpreadsheetId,
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log("Sheet copied successfully:", data);
    return data;
  } else {
    console.error("Error copying sheet:", data);
    throw new Error(data.error.message);
  }
}

export async function deleteSheet(accessToken, spreadsheetId, sheetId) {
  // Define the request URL for deleting a sheet
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  // Define the request body to delete the sheet
  const body = {
    requests: [
      {
        deleteSheet: {
          sheetId: sheetId, // The ID of the sheet you want to delete
        },
      },
    ],
  };

  // Fetch options
  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text(); // Read response body as text
      throw new Error(
        `Error: ${response.status}: ${response.statusText}. Details: ${errorText}`
      );
    }
    const data = await response.json();
    console.log("Sheet deleted successfully:", data);
  } catch (error) {
    console.error("Error deleting sheet:", error.message);
  }
}

export async function renameSheet(
  accessToken,
  spreadsheetId,
  sheetId,
  newName
) {
  // Define the request URL for renaming a sheet
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  // Define the request body to rename the sheet
  const body = {
    requests: [
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId, // The ID of the sheet you want to rename
            title: newName, // The new name for the sheet
          },
          fields: "title", // Specify that you want to update the title field
        },
      },
    ],
  };

  // Fetch options
  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text(); // Read response body as text
      throw new Error(
        `Error: ${response.status}: ${response.statusText}. Details: ${errorText}`
      );
    }
    const data = await response.json();
    console.log("Sheet renamed successfully:", data);
  } catch (error) {
    console.error("Error renaming sheet:", error.message);
  }
}

export async function readSheet(
  accessToken,
  spreadsheetId,
  sheetId = "Sheet1"
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetId}`;
  const response = await apiRequest(url, "GET", accessToken);
  return response.values;
}

export async function getSheetProperties(
  accessToken,
  spreadsheetId,
  sheetId = 0
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,data.rowData.values.userEnteredFormat)`;
  const data = await apiRequest(url, "GET", accessToken);
  console.log("data", data);
  const sourceSheet = data.sheets.find(
    (sheet) => sheet.properties.sheetId === parseInt(sheetId)
  );
  return sourceSheet;
}

export async function clearSheet(
  authToken,
  spreadsheetId,
  sheetName = "Sheet1",
  skippedRows = 0
) {
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A${
    skippedRows + 1
  }:ZZZ:clear`;

  const response = await fetch(clearUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    console.log("Sheet cleared successfully from row 4 onwards.");
  } else {
    console.error("Error clearing sheet:", await response.text());
  }
}

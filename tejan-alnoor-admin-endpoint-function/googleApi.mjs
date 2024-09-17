import crypto from "crypto";

const SPREADSHEET_ID = "1VKAM1-EuXJqK7O3sjPhPnGhWAqUxVUmogxDJp3GRM5Y";

export async function getAccessToken(serviceAccount) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600; // Token expires in 1 hour

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

export async function writeToGoogleSheet(accessToken, values) {
  const spreadsheetId = SPREADSHEET_ID;
  // const range = 'Sheet1!A1:C3';  // The range where you want to write data
  const range = `Sheet1!A3:َ${values.length + 2}`; // The range where you want to write data

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;

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

export async function readGoogleSheet(accessToken) {
  const range = "students!A2:M200"; // The range where you want to read data
  // Construct the Sheets API URL
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

  // Make the HTTP GET request
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

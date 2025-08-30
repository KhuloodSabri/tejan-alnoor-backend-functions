import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const awsDynamoDbClient =
  process.env.DEV === "true"
    ? new DynamoDBClient({
        region: "local",
        endpoint: "http://localhost:8000",
      })
    : new DynamoDBClient({
        region: "eu-north-1",
      });

const TABLE_NAME = "alerts_history";

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const normalizeAlert = (raw) => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Each alert must be an object.");
  }

  const {
    studentID,
    createdAt,
    alertType,
    alertSource,
    // frontend sends `semster`; allow `semester` as fallback
    semster,
    semester,
    checkRoundNumber,
  } = raw;

  const sem = semster ?? semester;

  if (!studentID) throw new Error("studentID is required.");
  if (typeof createdAt !== "number")
    throw new Error("createdAt (UNIX seconds) must be a number.");
  if (!alertType) throw new Error("alertType is required.");
  if (!alertSource) throw new Error("alertSource is required.");
  if (!sem || typeof sem !== "object")
    throw new Error("semster/semester object is required.");
  if (typeof checkRoundNumber !== "number")
    throw new Error("checkRoundNumber must be a number.");

  const year = Number(sem.year);
  const semVal = Number(sem.semester);
  const month = Number(sem.month);

  if (!Number.isFinite(year)) throw new Error("semster.year must be a number.");
  if (!Number.isFinite(semVal))
    throw new Error("semster.semester must be a number.");
  if (!Number.isFinite(month))
    throw new Error("semster.month must be a number.");

  return {
    id: uuidv4(),
    studentID,
    createdAt,
    alertType,
    alertSource,
    semester: { year, semester: semVal, month }, // stored with correct key
    checkRoundNumber,
  };
};

export const addAlert = async (body) => {
  console.log("heere");
  // Accept array (preferred from frontend) or single object for backward compatibility
  const payload = Array.isArray(body) ? body : [body];

  if (payload.length === 0) {
    throw new Error("Request body must be a non-empty array or object.");
  }

  // Normalize and validate all items
  const items = payload.map(normalizeAlert);

  // BatchWrite has a 25-item limit
  const batches = chunk(items, 25);
  const unprocessedAll = [];

  try {
    for (const batch of batches) {
      const cmd = new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((Item) => ({
            PutRequest: { Item },
          })),
        },
      });

      const response = await awsDynamoDbClient.send(cmd);
      if (
        response.UnprocessedItems &&
        response.UnprocessedItems[TABLE_NAME] &&
        response.UnprocessedItems[TABLE_NAME].length > 0
      ) {
        unprocessedAll.push(...response.UnprocessedItems[TABLE_NAME]);
      }
    }

    const written = items.length - unprocessedAll.length;
    return {
      message: "Alerts processed.",
      requested: items.length,
      written,
      unprocessedCount: unprocessedAll.length,
      // Optionally return the unprocessed requests for caller to retry:
      unprocessed: unprocessedAll,
    };
  } catch (err) {
    console.error("DynamoDB error:", err);
    throw new Error("Failed to write to DynamoDB.");
  }
};

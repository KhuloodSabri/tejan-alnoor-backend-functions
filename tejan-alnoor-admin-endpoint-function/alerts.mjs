import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
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

const TABLE_NAME = "alertHistory";

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
// Define the schema for adding (all required)
const alertSchema = Yup.object({
  studentID: Yup.string().required(),
  createdAt: Yup.number().integer().optional(),
  alertType: Yup.string().oneOf(["تحذير", "فصل"]).required(),
  alertSource: Yup.string().oneOf(["مراجعة", "حفظ"]).required(),
  year: Yup.number().integer().required(),
  semester: Yup.number().integer().required(),
  month: Yup.number().integer().required(),
  checkRoundNumber: Yup.number().integer().required(),
});

// Define the schema for editing (all optional)
const alertEditSchema = Yup.object({
  studentID: Yup.string().optional(),
  createdAt: Yup.number().integer().optional(),
  alertType: Yup.string().oneOf(["تحذير", "فصل"]).optional(),
  alertSource: Yup.string().oneOf(["مراجعة", "حفظ"]).optional(),
  year: Yup.number().integer().optional(),
  semester: Yup.number().integer().optional(),
  month: Yup.number().integer().optional(),
  checkRoundNumber: Yup.number().integer().optional(),
});

const normalizeAlert = (raw, editing = false) => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Each alert must be an object.");
  }

  const schema = editing ? alertEditSchema : alertSchema;

  try {
    schema.validateSync(raw, { abortEarly: false });
  } catch (err) {
    throw new Error("Validation error: " + err.errors.join(", "));
  }

  // For add: set createdAt if not present
  if (!editing && !raw.createdAt) {
    raw.createdAt = Math.floor(Date.now() / 1000);
  }

  return {
    id: uuidv4(),
    ...raw,
  };
};

export const addAlerts = async (body) => {
  // Accept array (preferred from frontend) or single object for backward compatibility
  const payload = Array.isArray(body) ? body : [body];

  if (payload.length === 0) {
    throw new Error("Request body must be a non-empty array or object.");
  }

  // Normalize and validate all items
  const items = payload.map((item) => normalizeAlert(item));

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

export const updateAlert = async (alertId, body) => {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }

  if (body.id && body.id !== alertId) {
    throw new Error("Alert ID in body does not match URL parameter.");
  }

  const normalizedItem = normalizeAlert(body, true);

  const updateFields = { ...normalizedItem };
  delete updateFields.id;

  const updateExpr = [];
  const exprAttrNames = {};
  const exprAttrValues = {};

  Object.entries(updateFields).forEach(([key, value], idx) => {
    const nameKey = `#f${idx}`;
    const valueKey = `:v${idx}`;
    updateExpr.push(`${nameKey} = ${valueKey}`);
    exprAttrNames[nameKey] = key;
    exprAttrValues[valueKey] = value;
  });

  const params = {
    TableName: TABLE_NAME,
    Key: { id: alertId },
    UpdateExpression: "SET " + updateExpr.join(", "),
    ExpressionAttributeNames: exprAttrNames,
    ExpressionAttributeValues: exprAttrValues,
    ReturnValues: "ALL_NEW",
  };

  try {
    const result = await awsDynamoDbClient.send(new UpdateCommand(params));
    return result.Attributes;
  } catch (err) {
    console.error("DynamoDB error:", err);
    throw new Error("Failed to write to DynamoDB.");
  }
};

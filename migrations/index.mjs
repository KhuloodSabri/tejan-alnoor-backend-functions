// Import the required AWS SDK clients and commands for Node.js
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

import {
  GetCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import { promptUser, waitForTableToBecomeActive } from "./utils.mjs";

function getVersions() {
  const files = fs.readdirSync("./versions");

  return files
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => file.split(".mjs")[0])
    .filter(Boolean)
    .sort();
}

function getDbClient(env) {
  if (env === "local") {
    return new DynamoDBClient({
      region: "local",
      endpoint: "http://localhost:8000",
    });
  } else if (env === "prod") {
    return new DynamoDBClient({
      region: "eu-north-1",
    });
  } else {
    throw new Error("Please provide a valid migration env (local or prod)");
  }
}

async function getCurrentVersion(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
  try {
    const currentVersion = (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Configs",
          Key: {
            name: "currentVersion",
          },
        })
      )
    )?.Item?.value;

    console.log("Current version:", currentVersion);
    return currentVersion;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(
        "The Configs table does not exist. Will create it and set the current version to null."
      );
      const configTableParams = {
        TableName: "Configs", // Name of the table
        KeySchema: [
          { AttributeName: "name", KeyType: "HASH" }, // Partition key
        ],
        AttributeDefinitions: [{ AttributeName: "name", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST", // Set billing mode to on-demand (pay-per-request)
      };

      const studentCommand = new CreateTableCommand(configTableParams);
      await client.send(studentCommand);

      await waitForTableToBecomeActive(client, "Configs");
    } else {
      console.error("Error fetching current version:", error);
      throw error;
    }
  }

  return null; // If the table does not exist, return null
}

async function run(env, targetVersion) {
  const client = getDbClient(env);
  const currentVersion = await getCurrentVersion(client);

  const versions = getVersions();

  if (versions.length === 0) {
    console.error("No migrations found.");
    return;
  }

  let migrationsToRun = [];
  let direction = "up";

  const currentVersionIndex = currentVersion
    ? versions.indexOf(currentVersion)
    : -1;

  if (currentVersion && currentVersionIndex === -1) {
    throw new Error("The current version was not found in the versions list.");
  }

  if (targetVersion === "latest") {
    direction = "up";

    if (!currentVersion) {
      migrationsToRun = versions; // run all
    } else {
      migrationsToRun = versions.slice(currentVersionIndex + 1);
    }
  } else if (new RegExp("^(-|\\+)\\d+$").test(targetVersion)) {
    const number = parseInt(targetVersion.slice(1));

    if (targetVersion.startsWith("+")) {
      direction = "up";

      if (!currentVersion) {
        migrationsToRun = versions.slice(0, number);
      } else {
        if (versions.length - currentVersionIndex - 1 < number) {
          console.error(
            `There are only ${
              versions.length - currentVersionIndex - 1
            } migrations available after the current version.`
          );
          return;
        }

        migrationsToRun = versions.slice(
          currentVersionIndex + 1,
          currentVersionIndex + 1 + number
        );
      }
    } else {
      if (!currentVersion) {
        console.error(
          "No migrations have been run yet to downgrade. Please run migrations first."
        );
        return;
      }
      direction = "down";

      if (currentVersionIndex < number - 1) {
        console.error(
          `There are only ${currentVersionIndex} migrations available before the current version.`
        );
        return;
      }

      migrationsToRun = versions
        .slice(
          currentVersionIndex - number + 1, // we need to include the current one
          currentVersionIndex + 1 // we need to downgrade the current one
        )
        .reverse();
    }
  } else {
    const targetVersionIndex = versions.indexOf(targetVersion);

    if (targetVersionIndex === -1) {
      console.error("The target version was not found in the versions list.");
      return;
    }

    if (!currentVersion) {
      migrationsToRun = versions.slice(0, targetVersionIndex + 1);
    }

    if (currentVersionIndex < targetVersionIndex) {
      direction = "up";
      migrationsToRun = versions.slice(
        currentVersionIndex + 1,
        targetVersionIndex + 1
      );
    } else {
      direction = "down";
      migrationsToRun = versions
        .slice(targetVersionIndex, currentVersionIndex + 1)
        .reverse();
    }
  }

  if (migrationsToRun.length === 0) {
    console.log("No migrations to run.");
    return;
  }

  console.log(`Will ${direction}grade the following migrations:\n`);

  for (const migration of migrationsToRun) {
    const migrationModule = await import(`./versions/${migration}.mjs`);
    console.log(migration, migrationModule.description);
  }

  console.log("\n");

  const promptResult = await promptUser(
    "Do you want to continue. Enter yes to continue "
  );

  if (promptResult !== "yes") {
    console.log("Exiting...");
    return;
  }

  for (const migration of migrationsToRun) {
    console.log(`${direction}grading migration ${migration}...\n`);

    const migrationModule = await import(`./versions/${migration}.mjs`);
    let newVersion = migration;

    if (direction === "up") {
      await migrationModule.up(client);
      newVersion = migration;
    } else {
      await migrationModule.down(client);
      const versionIndex = versions.indexOf(migration);
      newVersion = versionIndex > 0 ? versions[versionIndex - 1] : null;
    }
    console.log(
      `Migration ${migration} was successfully ${direction}graded.\n`
    );

    const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Configs",
        Key: {
          name: "currentVersion",
        },
        UpdateExpression: "SET #value = :value",
        ExpressionAttributeNames: {
          "#value": "value",
        },
        ExpressionAttributeValues: {
          ":value": newVersion,
        },
      })
    );
  }
}

function createMigration(description) {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .split(".")[0]
    .replace(/[-:]/g, "-")
    .replace("T", "-");
  const migrationName = `${timestamp}`;

  const migrationTemplate = `export const description = "${description}"

export async function up(client) {
// Write your migration code here
}

export async function down(client) {
// Write your rollback code here
}`;

  fs.writeFileSync(`./versions/${migrationName}.mjs`, migrationTemplate);
}

const args = process.argv.slice(2); // Slice to remove the first two default arguments
const usageMessage = `Please choose whether
    - to run migrations
    - to create a new migration.
    - to view the current version.
    Examples:
    node index.mjs run local 2024-09-26-21-51-17
    node index.mjs create "My migration desciption"
    node index.mjs version local`;

if (args.length < 1) {
  throw new Error(usageMessage);
}

if (args[0] === "run") {
  if (args.length < 3) {
    throw new Error(`Please provide:
        - the migration env
        - the migration version name or latest or -(number) or +(number).
        Examples:
        node index.mjs run local 2024-09-26-21-51-17
        node index.mjs run prod latest
        node index.mjs run local -1
        node index.mjs run prod +1`);
  }
  run(args[1], args[2]);
} else if (args[0] === "create") {
  if (args.length < 2) {
    throw new Error(`Please provide a description for the migration.
        Examples:
        node index.mjs create "My migration desciption"`);
  }
  createMigration(args[1]);
} else if (args[0] === "version") {
  if (args.length < 2) {
    throw new Error(`Please provide the migration env.
        Examples:
        node index.mjs version local`);
  }

  const client = getDbClient(args[1]);
  getCurrentVersion(client);
} else {
  throw new Error(usageMessage);
}

import readline from "readline";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";

export async function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

export async function waitForTableToBecomeActive(client, tableName) {
  let isActive = false;

  while (!isActive) {
    try {
      const describeTableCommand = new DescribeTableCommand({
        TableName: tableName,
      });
      const response = await client.send(describeTableCommand);
      const status = response.Table.TableStatus;

      console.log(`Current table status: ${status}`);

      if (status === "ACTIVE") {
        isActive = true;
        console.log(`Table ${tableName} is now active and ready for use.`);
      } else {
        console.log(`Waiting for table to become active...`);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
      }
    } catch (error) {
      console.log(`Waiting for resource to become available...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  await promptUser("Press enter to continue...");
}

export async function waitForTableToBecomeDeleted(client, tableName) {
  let isDeleted = false;

  while (!isDeleted) {
    try {
      const describeTableCommand = new DescribeTableCommand({
        TableName: tableName,
      });
      await client.send(describeTableCommand);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        // Step 4: Table is successfully deleted
        isDeleted = true;
        console.log(`Table ${tableName} has been deleted.`);
      } else {
        console.error("Error describing table:", error);
      }
    }
  }

  await promptUser("Press enter to continue...");
}

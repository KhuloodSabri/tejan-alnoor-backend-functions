export const description = "add memorizing plans to levels";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

export async function up(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const baseUpdateBody = {
    TableName: "Levels",
    UpdateExpression: `SET #monthsPlanByPage = :monthsPlanByPage,
        #avgMemorizedPagesPerMeeting = :avgMemorizedPagesPerMeeting,
        #memorizingMeetingsPerWeekCount = :memorizingMeetingsPerWeekCount`,
    ExpressionAttributeNames: {
      "#monthsPlanByPage": "monthsPlanByPage",
      "#avgMemorizedPagesPerMeeting": "avgMemorizedPagesPerMeeting",
      "#memorizingMeetingsPerWeekCount": "memorizingMeetingsPerWeekCount",
    },
  };
  await awsDocDynamoDbClient.send(
    new UpdateCommand({
      ...baseUpdateBody,
      Key: {
        levelID: 1,
      },
      ExpressionAttributeValues: {
        ":avgMemorizedPagesPerMeeting": 1,
        ":memorizingMeetingsPerWeekCount": 2,
        ":monthsPlanByPage": [10, 18, 26, 34, 42, 50, 58],
      },
    })
  );

  await awsDocDynamoDbClient.send(
    new UpdateCommand({
      ...baseUpdateBody,
      Key: {
        levelID: 2,
      },
      ExpressionAttributeValues: {
        ":avgMemorizedPagesPerMeeting": 1.5,
        ":memorizingMeetingsPerWeekCount": 2,
        ":monthsPlanByPage": [14, 26, 38, 49, 61, 70, 82, 94, 106, 118],
      },
    })
  );

  await awsDocDynamoDbClient.send(
    new UpdateCommand({
      ...baseUpdateBody,
      Key: {
        levelID: 3,
      },
      ExpressionAttributeValues: {
        ":avgMemorizedPagesPerMeeting": 2,
        ":memorizingMeetingsPerWeekCount": 2,
        ":monthsPlanByPage": [18, 34, 49, 64, 72, 80, 88],
      },
    })
  );

  await awsDocDynamoDbClient.send(
    new UpdateCommand({
      ...baseUpdateBody,
      Key: {
        levelID: 0,
      },
      ExpressionAttributeValues: {
        ":avgMemorizedPagesPerMeeting": 1.5,
        ":memorizingMeetingsPerWeekCount": 2,
        ":monthsPlanByPage": [14, 26, 38, 49, 61, 70, 82],
      },
    })
  );
}

export async function down(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  const levels = [0, 1, 2, 3];

  for (const level of levels) {
    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Levels",
        Key: {
          levelID: level,
        },
        UpdateExpression:
          "REMOVE #monthsPlanByPage, #avgMemorizedPagesPerMeeting, #memorizingMeetingsPerWeekCount",
        ExpressionAttributeNames: {
          "#monthsPlanByPage": "monthsPlanByPage",
          "#avgMemorizedPagesPerMeeting": "avgMemorizedPagesPerMeeting",
          "#memorizingMeetingsPerWeekCount": "memorizingMeetingsPerWeekCount",
        },
      })
    );
  }
}

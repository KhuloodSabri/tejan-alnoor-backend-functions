import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import csv from "csv-parser";
import fs from "fs";

export const description = "Add more details to students and levels";

function trimStringQuotes(str) {
  let res = str.trim();

  if (res.startsWith('"') && res.endsWith('"')) {
    res = res.slice(1, -1);
  }

  return res.trim();
}

async function updateStudentsFromCsv(awsDocDynamoDbClient, updateStudentFn) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  const processingFilePromise = new Promise((resolve, reject) => {
    fs.createReadStream("versions/2024-09-28-all-students-details.csv")
      .pipe(csv())
      .on("data", async (row) => {
        if (!!row["اسم الطالب/ة"]?.length) {
          const filteredStudents = students.filter((student) => {
            return (
              trimStringQuotes(student.studentName) ===
                trimStringQuotes(row["اسم الطالب/ة"]) &&
              trimStringQuotes(student.supervisorName) ===
                trimStringQuotes(row["اسم المشرف/ة"])
            );
          });

          if (filteredStudents.length === 1) {
            await updateStudentFn(filteredStudents[0], row);
          } else if (filteredStudents.length === 0) {
            console.error(
              "Did not find: ",
              row["اسم الطالب/ة"],

              row["اسم المشرف/ة"]
            );
          } else {
            console.error(
              "Found multiple students: ",
              row["اسم الطالب/ة"],
              row["اسم المشرف/ة"],
              filteredStudents.map((student) => student.studentID)
            );
          }
        }
      })
      .on("end", () => {
        console.log("Updated all students details");
        resolve();
      })
      .on("error", (error) => {
        console.error("Error processing file", error);
        reject(error);
      });
  });

  await processingFilePromise;
}

export async function up(client) {
  const currentYear = 2023;
  const currentSemester = 3;

  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  await awsDocDynamoDbClient.send(
    new DeleteCommand({
      TableName: "Configs",
      Key: {
        name: "currentSemester",
      },
    })
  );

  await awsDocDynamoDbClient.send(
    new UpdateCommand({
      TableName: "Configs",
      Key: {
        name: "currentSemester",
      },
      UpdateExpression: "SET #value = :value",
      ExpressionAttributeNames: {
        "#value": "value",
      },
      ExpressionAttributeValues: {
        ":value": {
          year: currentYear,
          semester: currentSemester,
        },
      },
    })
  );

  await updateStudentsFromCsv(awsDocDynamoDbClient, async (student, row) => {
    const joinYear = Number(row["تاريخ الانضمام"]);
    const joinSemester = Number(
      row["الفصل الذي تم الانضمام به(أول||ثاني||صيفي)"]
    );
    const joinMonth = Number(row["الشهر الذي تم الانضمام به 1||2||3"]);
    let monthsSinceJoin = (currentYear - joinYear) * 7;

    monthsSinceJoin += (currentSemester - 1) * 3; // 1 and 2 are 3 months
    monthsSinceJoin -= (joinSemester - 1) * 3; // 1 and 2 are 3 months
    monthsSinceJoin -= joinMonth - 1;

    if (
      Number(row["عدد أشهر الخطة التي تم اجتيازها"]) !==
      monthsSinceJoin + 1
    ) {
      console.error(
        "Mismatch in months since join",
        row["اسم الطالب/ة"],
        monthsSinceJoin,
        Number(row["عدد أشهر الخطة التي تم اجتيازها"])
      );
    }

    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression: `SET #studentName = :studentName,
                #supervisorName = :supervisorName,
                #status = :status,
                #groupNumber = :groupNumber,
                #phoneNumber = :phoneNumber,
                #joinTime = :joinTime`,
        ExpressionAttributeNames: {
          "#studentName": "studentName",
          "#supervisorName": "supervisorName",
          "#status": "status",
          "#groupNumber": "groupNumber",
          "#phoneNumber": "phoneNumber",
          "#joinTime": "joinTime",
        },
        ExpressionAttributeValues: {
          ":studentName": trimStringQuotes(row["اسم الطالب/ة"]),
          ":supervisorName": trimStringQuotes(row["اسم المشرف/ة"]),
          ":status": trimStringQuotes(row["حالة الطالب"]),
          ":groupNumber": Number(row["الدفعة"]),
          ":phoneNumber": isNaN(row["رقم الواتس"]) ? "" : row["رقم الواتس"],
          ":joinTime": {
            year: Number(row["تاريخ الانضمام"]),
            semester: Number(row["الفصل الذي تم الانضمام به(أول||ثاني||صيفي)"]),
            semesterMonth: Number(row["الشهر الذي تم الانضمام به 1||2||3"]),
          },
        },
      })
    );

    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression: `REMOVE #startWeek`,
        ExpressionAttributeNames: {
          "#startWeek": "startWeek",
        },
      })
    );
  });
}

export async function down(client) {
  const awsDocDynamoDbClient = DynamoDBDocumentClient.from(client);

  updateStudentsFromCsv(awsDocDynamoDbClient, async (student, row) => {
    const currentMonth = Number(row["عدد أشهر الخطة التي تم اجتيازها"]);
    const attributesToRemove = [
      "status",
      "groupNumber",
      "phoneNumber",
      "joinTime",
    ];

    await awsDocDynamoDbClient.send(
      new UpdateCommand({
        TableName: "Students",
        Key: {
          studentID: student.studentID,
        },
        UpdateExpression: `SET #startWeek = :startWeek`,
        ExpressionAttributeNames: {
          "#startWeek": "startWeek",
        },
        ExpressionAttributeValues: {
          ":startWeek": (currentMonth - 1) * 4 + 1,
        },
      })
    );

    const command = new UpdateCommand({
      TableName: "Students",
      Key: {
        studentID: student.studentID,
      },
      UpdateExpression: `REMOVE ${attributesToRemove
        .map((item) => `#${item}`)
        .join(", ")}`,
      ExpressionAttributeNames: attributesToRemove.reduce((acc, item) => {
        acc[`#${item}`] = item;
        return acc;
      }, {}),
    });

    await awsDocDynamoDbClient.send(command);
  });

  console.log("Attributes removed successfully");
}

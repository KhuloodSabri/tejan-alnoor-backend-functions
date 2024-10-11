import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { translateNumberToArabic } from "./number.mjs";

const awsDynamoDbClient =
  process.env.DEV === "true"
    ? new DynamoDBClient({
        region: "local",
        endpoint: "http://localhost:8000",
      })
    : new DynamoDBClient({
        region: "eu-north-1",
      });

const awsDocDynamoDbClient = DynamoDBDocumentClient.from(awsDynamoDbClient);

function getStudentStartWeek(currentSemesterDetails, student) {
  const joinYear = student.joinTime.year;
  const joinSemester = student.joinTime.semester;
  const joinMonth = student.joinTime.semesterMonth;
  let monthsSinceJoin = (currentSemesterDetails.year - joinYear) * 7;

  monthsSinceJoin += (currentSemesterDetails.semester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= (joinSemester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= joinMonth - 1;

  monthsSinceJoin -= student.frozenSemesters.length * 7;

  return monthsSinceJoin * 4 + 1;
}

export async function getStudentsSheetRows() {
  console.log("getting current semester details");
  const currentSemesterDetails =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Configs",
          Key: {
            name: "currentSemester",
          },
        })
      )
    )?.Item?.value ?? null;

  console.log("getting students");

  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
        })
      )
    )?.Items ?? [];

  console.log("getting levels");
  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
          ProjectionExpression: `levelID, levelName, weeksPlan`,
        })
      )
    )?.Items ?? [];

  console.log("got students and levels, mapping levels");
  const levelsMap = levels.reduce((acc, level) => {
    acc[level.levelID] = level;
    return acc;
  }, {});

  console.log("mapping students to rows");
  const studentsRows = students
    .sort((a, b) => a.studentID - b.studentID)
    .map((student) => {
      const studentLevel = levelsMap[student.levelID];
      const studentStartWeek = getStudentStartWeek(
        currentSemesterDetails,
        student
      );

      const revisitSummary = studentLevel.weeksPlan
        .slice(studentStartWeek - 1, studentStartWeek - 1 + 12)
        .map((week) => {
          if (
            student.revisitProgress.find(
              (range) => range[0] <= week[0] && range[1] >= week[1]
            )
          ) {
            return 1; //"✅";
          }

          return 0; // "❌";
        });

      const defaultRevisitFill = Array(
        Math.max(12 - revisitSummary.length, 0)
      ).fill("");

      return [
        student.studentID,
        student.studentName,
        studentLevel.levelName,
        Math.floor(studentStartWeek / 4) + 1,
        Number(student.memorizingProgress),
        ...revisitSummary,
        ...defaultRevisitFill,
        Number(student.test1),
        Number(student.test2),
        Number(student.test3),
        Number(student.test4),
        Number(student.test5),
      ];
    });

  return studentsRows;
}

export function validateStudents(students) {
  const errors = [];
  students.forEach((student, index) => {
    if (!student.studentName) {
      errors.push(`الطالب/ة الصف ${index + 2} لا يحتوي على اسم`);
    }

    if (!student.gender) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على الجنس`
      );
    } else if (student.gender !== "ذكر" && student.gender !== "أنثى") {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لديه جنس غير صحيح - يجب أن يكون ذكر أو أنثى`
      );
    }

    if (!student.supervisorName) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على اسم المشرف/ة`
      );
    }

    if (!student.level) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على المستوى`
      );
    }

    if (!student.groupNumber) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على الدفعة`
      );
    } else if (isNaN(Number(student.groupNumber))) {
      errors.push(
        `دفعة الطالب ${student.studentName} في الصف ${index + 2} ليست رقما`
      );
    }

    if (!student.joinYear) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على سنة الانضمام`
      );
    } else {
      const year = Number(student.joinYear);
      if (isNaN(year)) {
        errors.push(
          `سنة الانضمام للطالب/ة ${student.studentName} في الصف ${
            index + 2
          } ليست رقما`
        );
      } else if (year < 2020) {
        errors.push(
          `الطالب/ة ${student.studentName} في الصف ${
            index + 2
          } لديه سنة انضمام قديمة`
        );
      }
    }

    if (!student.joinSemester) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على فصل الانضمام`
      );
    } else {
      const semester = Number(student.joinSemester);
      if (isNaN(semester)) {
        errors.push(
          `فصل الانضمام للطالب/ة ${student.studentName} في الصف ${
            index + 2
          } ليست رقما`
        );
      } else if (semester < 1 || semester > 3) {
        errors.push(
          `الطالب/ة ${student.studentName} في الصف ${
            index + 2
          } لديه فصل انضمام غير صحيح - يجب أن يكون 1 أو 2 أو 3`
        );
      }
    }

    if (!student.joinMonth) {
      errors.push(
        `الطالب/ة ${student.studentName} في الصف ${
          index + 2
        } لا يحتوي على شهر الانضمام`
      );
    } else {
      const month = Number(student.joinMonth);
      if (isNaN(month)) {
        errors.push(
          `شهر الانضمام للطالب/ة ${student.studentName} في الصف ${
            index + 2
          } ليست رقما`
        );
      } else {
        const maxMonth = Number(student.joinSemester) === 3 ? 1 : 3;
        const hint =
          Number(student.joinSemester) === 3
            ? "هناك شهر واحد بالفصل الصيفي"
            : "هناك 3 أشهر بالفصل العادي";

        if (month < 1 || month > maxMonth) {
          errors.push(
            `الطالب/ة ${student.studentName} في الصف ${
              index + 2
            } لديه شهر انضمام غير صحيح - ${hint}`
          );
        }
      }
    }

    if (student.phoneNumber) {
      if (isNaN(Number(student.phoneNumber))) {
        errors.push(
          `رقم الهاتف للطالب/ة ${student.studentName} في الصف ${
            index + 2
          } ليست رقما`
        );
      } else if (
        `${student.phoneNumber}`.length !== 10 &&
        `${student.phoneNumber}`.length !== 12 &&
        `${student.phoneNumber}`.length !== 14
      ) {
        errors.push(
          `رقم الهاتف للطالب/ة ${student.studentName} في الصف ${
            index + 2
          } يجب أن يكون 10 أرقام أو 12 أو 14 رقما (مع الكود الدولي)`
        );
      }
    }
  });

  const namesCount = students.reduce((acc, student) => {
    if (!student.studentName?.trim()) return acc;

    return {
      ...acc,
      [student.studentName]: (acc[student.studentName] || 0) + 1,
    };
  }, {});

  Object.entries(namesCount).forEach(([student, count]) => {
    if (count > 1) {
      errors.push(`الطالب/ة ${student} مكرر في الملف`);
    }
  });

  const phoneNumbersCount = students.reduce((acc, student) => {
    if (!`${student.phoneNumber ?? ""}`?.trim()) return acc;

    return {
      ...acc,
      [student.phoneNumber]: (acc[student.phoneNumber] || 0) + 1,
    };
  }, {});

  Object.entries(phoneNumbersCount).forEach(([phoneNumber, count]) => {
    if (count > 1) {
      errors.push(`رقم الهاتف ${phoneNumber} مكرر في الملف`);
    }
  }, {});

  return errors;
}

const getQueryListPlaceholders = (itemName, list) => {
  const query = Array.from(
    { length: list.length },
    (_, i) => `#${itemName} = :${itemName}${i}`
  ).join(" OR ");

  const queryValues = list.reduce((acc, item, index) => {
    acc[`:${itemName}${index}`] = item;
    return acc;
  }, {});

  return { query, queryValues };
};

async function getExistingStudents(students) {
  const chunSize = 100;
  let existingStudents = [];

  const studentNames = students.map((student) => student.studentName);
  const phoneNumbers = students
    .map((student) => student.phoneNumber)
    .filter((phoneNumber) => !!`${phoneNumber ?? ""}`.trim().length);

  for (let i = 0; i < studentNames.length; i += chunSize) {
    const studentListQueryPlaceholders = getQueryListPlaceholders(
      "studentName",
      studentNames.slice(i, i + chunSize)
    );

    const existingStudentsChunk =
      (
        await awsDocDynamoDbClient.send(
          new ScanCommand({
            TableName: "Students",
            FilterExpression: studentListQueryPlaceholders.query,
            ExpressionAttributeNames: {
              "#studentName": "studentName",
            },
            ExpressionAttributeValues: {
              ...studentListQueryPlaceholders.queryValues,
            },
          })
        )
      )?.Items ?? [];

    existingStudents.push(...existingStudentsChunk);
  }

  for (let i = 0; i < phoneNumbers.length; i += chunSize) {
    const phoneNumbersListQueryPlaceholders = getQueryListPlaceholders(
      "phoneNumber",
      phoneNumbers
    );

    const existingStudentsChunk =
      (
        await awsDocDynamoDbClient.send(
          new ScanCommand({
            TableName: "Students",
            FilterExpression: phoneNumbersListQueryPlaceholders.query,
            ExpressionAttributeNames: {
              "#phoneNumber": "phoneNumber",
            },
            ExpressionAttributeValues: {
              ...phoneNumbersListQueryPlaceholders.queryValues,
            },
          })
        )
      )?.Items ?? [];

    existingStudents.push(...existingStudentsChunk);
  }

  return existingStudents;
}

export async function validateStudentsAgainstDB(students) {
  const levelNames = [
    ...new Set(
      students.map((student) => translateNumberToArabic(student.level))
    ),
  ];
  const levelListQueryPlaceholders = getQueryListPlaceholders(
    "levelName",
    levelNames
  );

  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
          FilterExpression: levelListQueryPlaceholders.query,
          ExpressionAttributeNames: {
            "#levelName": "levelName",
          },
          ExpressionAttributeValues: {
            ...levelListQueryPlaceholders.queryValues,
          },
        })
      )
    )?.Items ?? [];

  if (levels.length < levelNames.length) {
    const missingLevels = levelNames.filter(
      (levelName) => !levels.find((level) => level.levelName === levelName)
    );

    throw new Error(
      `المستويات المدخلة غير موجودة في قاعدة البيانات - ${missingLevels.join(
        "، "
      )}`
    );
  }

  // const studentNames = students.map((student) => student.studentName);
  // const studentListQueryPlaceholders = getQueryListPlaceholders(
  //   "studentName",
  //   studentNames
  // );

  // const existingStudents =
  //   (
  //     await awsDocDynamoDbClient.send(
  //       new ScanCommand({
  //         TableName: "Students",
  //         FilterExpression: studentListQueryPlaceholders.query,
  //         ExpressionAttributeNames: {
  //           "#studentName": "studentName",
  //         },
  //         ExpressionAttributeValues: {
  //           ...studentListQueryPlaceholders.queryValues,
  //         },
  //       })
  //     )
  //   )?.Items ?? [];

  // if (existingStudents.length) {
  //   const existingStudentNames = existingStudents.map(
  //     (student) => student.studentName
  //   );

  //   throw new Error(
  //     `بعض الطلاب موجودين في قاعدة البيانات - ${existingStudentNames.join(
  //       "، "
  //     )}`
  //   );
  // }

  // const phoneNumbers = students
  //   .map((student) => student.phoneNumber)
  //   .filter((phoneNumber) => !!`${phoneNumber ?? ""}`.trim().length);

  // const phoneNumbersListQueryPlaceholders = getQueryListPlaceholders(
  //   "phoneNumber",
  //   phoneNumbers
  // );

  // const existingPhoneNumbers =
  //   (
  //     await awsDocDynamoDbClient.send(
  //       new ScanCommand({
  //         TableName: "Students",
  //         FilterExpression: phoneNumbersListQueryPlaceholders.query,
  //         ExpressionAttributeNames: {
  //           "#phoneNumber": "phoneNumber",
  //         },
  //         ExpressionAttributeValues: {
  //           ...phoneNumbersListQueryPlaceholders.queryValues,
  //         },
  //       })
  //     )
  //   )?.Items ?? [];

  // if (existingPhoneNumbers.length) {
  //   const existingPhoneNumbersList = existingPhoneNumbers.map(
  //     (student) => student.phoneNumber
  //   );

  //   throw new Error(
  //     `بعض أرقام الهاتف موجودة في قاعدة البيانات - ${existingPhoneNumbersList.join(
  //       "، "
  //     )}`
  //   );
  // }
}

async function createSupervisors(newSupervisors) {
  const maxBatchSize = 25;
  const supervisorsChunks = [];
  const notInsertedSupervisors = [];

  for (let i = 0; i < newSupervisors.length; i += maxBatchSize) {
    supervisorsChunks.push(newSupervisors.slice(i, i + maxBatchSize));
  }

  for (const chunk of supervisorsChunks) {
    const response = await awsDocDynamoDbClient.send(
      new BatchWriteCommand({
        RequestItems: {
          Supervisors: chunk.map((supervisor) => ({
            PutRequest: {
              Item: supervisor,
            },
          })),
        },
      })
    );

    notInsertedSupervisors.push(
      ...(response.UnprocessedItems?.Supervisors ?? [])
    );
  }

  return notInsertedSupervisors;
}

async function insertStudentsHelper(students) {
  const maxBatchSize = 25;
  const studentsChunks = [];
  const notInsertedStudents = [];
  for (let i = 0; i < students.length; i += maxBatchSize) {
    studentsChunks.push(students.slice(i, i + maxBatchSize));
  }

  for (const chunk of studentsChunks) {
    const response = await awsDocDynamoDbClient.send(
      new BatchWriteCommand({
        RequestItems: {
          Students: chunk.map((student) => ({
            PutRequest: {
              Item: student,
            },
          })),
        },
      })
    );

    notInsertedStudents.push(...(response.UnprocessedItems?.Students ?? []));
  }

  return notInsertedStudents;
}

export async function createStudents(students) {
  const levelsNames = [
    ...new Set(
      students.map((student) => translateNumberToArabic(student.level))
    ),
  ];

  const levelListQueryPlaceholders = getQueryListPlaceholders(
    "levelName",
    levelsNames
  );

  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
          FilterExpression: levelListQueryPlaceholders.query,
          ProjectionExpression: "levelID, levelName",
          ExpressionAttributeNames: {
            "#levelName": "levelName",
          },
          ExpressionAttributeValues: {
            ...levelListQueryPlaceholders.queryValues,
          },
        })
      )
    )?.Items ?? [];

  const levelsMap = levels.reduce((acc, level) => {
    acc[level.levelName] = level.levelID;
    return acc;
  }, {});

  const supervisorsNames = [
    ...new Set(students.map((student) => student.supervisorName)),
  ];

  const supervisorListQueryPlaceholders = getQueryListPlaceholders(
    "supervisorName",
    supervisorsNames
  );

  const existingSupervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
          FilterExpression: supervisorListQueryPlaceholders.query,
          ExpressionAttributeNames: {
            "#supervisorName": "supervisorName",
          },
          ExpressionAttributeValues: {
            ...supervisorListQueryPlaceholders.queryValues,
          },
        })
      )
    )?.Items ?? [];

  const newSupervisors = supervisorsNames
    .filter(
      (supervisorName) =>
        !existingSupervisors.find(
          (supervisor) => supervisor.supervisorName === supervisorName
        )
    )
    .map((supervisorName) => ({
      supervisorID: uuidv4(),
      supervisorName,
    }));

  let supevisorsToInsert = newSupervisors;
  let retry = 0;

  while (supevisorsToInsert.length > 0) {
    supevisorsToInsert = await createSupervisors(supevisorsToInsert);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (retry > 3) {
      throw new Error("Failed to insert supervisors");
    }

    retry++;
  }

  const supervisorsMap = {
    ...newSupervisors.reduce((acc, supervisor) => {
      acc[supervisor.supervisorName] = supervisor.supervisorID;
      return acc;
    }, {}),
    ...existingSupervisors.reduce((acc, supervisor) => {
      acc[supervisor.supervisorName] = supervisor.supervisorID;
      return acc;
    }, {}),
  };

  const existingStudents = await getExistingStudents(students);

  const newStudents = students
    .filter(
      (student) =>
        !existingStudents.find(
          (existingStudent) =>
            existingStudent.studentName === student.studentName ||
            existingStudent.phoneNumber === student.phoneNumber
        )
    )
    .map((student) => ({
      studentID: uuidv4(),
      studentName: student.studentName,
      levelID: levelsMap[translateNumberToArabic(student.level)],
      supervisorID: supervisorsMap[student.supervisorName],
      grouNumber: Number(student.groupNumber),
      joinTime: {
        year: Number(student.joinYear),
        semester: Number(student.joinSemester),
        semesterMonth: Number(student.joinMonth),
      },
      gender: student.gender === "ذكر" ? "male" : "female",
      phoneNumber: `${student.phoneNumber}`,
      status: "منتظم/ة",
      memorizingProgress: 0,
      revisitProgress: [],
      frozenSemesters: [],
      test1: 0,
      test2: 0,
      test3: 0,
      test4: 0,
      test5: 0,
    }));

  let studentsToInsert = newStudents;
  retry = 0;

  while (studentsToInsert.length > 0) {
    studentsToInsert = await insertStudentsHelper(studentsToInsert);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (retry > 3) {
      throw new Error("Failed to insert students");
    }

    retry++;
  }

  return {
    newStudentsCount: newStudents.length - studentsToInsert.length,
    existingStudentsCount: existingStudents.length,
    failedToInsert: studentsToInsert,
    existingStudents: existingStudents,
  }
}

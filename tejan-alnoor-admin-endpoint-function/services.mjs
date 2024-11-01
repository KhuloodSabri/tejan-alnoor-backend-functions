import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  BatchWriteCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { translateNumberToArabic } from "./number.mjs";
import { normalizeString } from "./utils.mjs";

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

function getSemesterMonthsCount(semester) {
  return semester.semester === 1 || semester.semester === 2 ? 3 : 1;
}

function getStudentStartWeek(semesterDetails, student) {
  const joinYear = student.joinYear;
  const joinSemester = student.joinSemester;
  const joinMonth = student.joinMonth;
  let monthsSinceJoin = (semesterDetails.year - joinYear) * 7;

  monthsSinceJoin += (semesterDetails.semester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= (joinSemester - 1) * 3; // 1 and 2 are 3 months
  monthsSinceJoin -= joinMonth - 1;

  monthsSinceJoin -= student.frozenSemesters.reduce((acc, semester) => {
    if (
      semester.year >= semesterDetails.year &&
      semester.semester >= semesterDetails.semester
    ) {
      return acc;
    }

    return acc + getSemesterMonthsCount(semester);
  }, 0);

  return Math.max(monthsSinceJoin * 4, 0);
}

export async function getSemester(semesterYear, semesterNumber) {
  return (
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Semesters",
          Key: {
            semesterID: `${semesterYear}-${semesterNumber}`,
          },
        })
      )
    )?.Item ?? null
  );
}

export async function addSemesterDetails(
  semesterYear,
  semesterNumber,
  spreadsheetId
) {
  const item = {
    semesterID: `${semesterYear}-${semesterNumber}`,
    year: semesterYear,
    semester: semesterNumber,
    spreadsheetId,
    createdAt: Date.now(),
  };

  await awsDocDynamoDbClient.send(
    new PutCommand({
      TableName: "Semesters",
      Item: item,
    })
  );

  return item;
}

function getMemorizingMeetingsPlan(level) {
  const weeksPerMonth = 4;
  const meetingsPerWeek = 2;
  const meetingsPerMonth = meetingsPerWeek * weeksPerMonth;
  const meetingsCount = meetingsPerMonth * level.monthsPlanByPage.length;

  const memorizingPlan = [2, ...level.monthsPlanByPage];

  const avgExpectedMemorizedPerMonth =
    level.avgMemorizedPagesPerMeeting * meetingsPerMonth;

  const meetingsExpectedMemorizedPages = [];

  for (let i = 0; i < meetingsCount; i++) {
    let value;
    const prevMonthIndex = Math.floor(i / (meetingsPerWeek * 4));

    const monthTargetPage = memorizingPlan[prevMonthIndex + 1];
    const prevMonthTargetPage = memorizingPlan[prevMonthIndex];

    const avgMinusActual =
      avgExpectedMemorizedPerMonth - (monthTargetPage - prevMonthTargetPage);

    if ((i + 1) % (meetingsPerWeek * 4) === 0) {
      value = monthTargetPage;
    } else {
      value =
        prevMonthTargetPage +
        level.avgMemorizedPagesPerMeeting * ((i % meetingsPerMonth) + 1);

      if (avgMinusActual > 0) {
        const prevMeetingValue =
          meetingsExpectedMemorizedPages.length > 0
            ? meetingsExpectedMemorizedPages[
                meetingsExpectedMemorizedPages.length - 1
              ]
            : prevMonthTargetPage;

        value = Math.max(prevMeetingValue + 1, value - avgMinusActual);
      }
    }

    meetingsExpectedMemorizedPages.push(value);
  }

  return meetingsExpectedMemorizedPages;
}

function countSemesters(year, semester, studentYear, studentSemester) {
  if (studentYear > year) {
    return 0;
  }

  if (studentYear === year) {
    return studentSemester <= semester ? semester - studentSemester + 1 : 0;
  }

  return (year - studentYear) * 3 + semester - studentSemester + 1;
}

export async function getStudentsDetailedSheetRows(year, semester) {
  const semesterStudents =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression:
            "(#joinYear <= :year AND #joinSemester <= :semester) OR #joinYear < :year",
          ExpressionAttributeNames: {
            "#joinYear": "joinYear",
            "#joinSemester": "joinSemester",
          },
          ExpressionAttributeValues: {
            ":year": year,
            ":semester": semester,
          },
        })
      )
    )?.Items ?? [];

  console.log("semester students count", semesterStudents.length);

  console.log("getting levels");
  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
        })
      )
    )?.Items ?? [];

  console.log("got students and levels, mapping levels");
  const levelsMap = levels.reduce((acc, level) => {
    acc[level.levelID] = {
      ...level,
      memorizingDetailedPlan: getMemorizingMeetingsPlan(level),
    };
    return acc;
  }, {});

  console.log("getting supervisors");
  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
        })
      )
    )?.Items ?? [];

  console.log("mapping supervisors");
  const supervisorsMap = supervisors.reduce((acc, supervisor) => {
    acc[supervisor.supervisorID] = supervisor;
    return acc;
  }, {});

  console.log("mapping semester students to rows");
  const studentsRows = semesterStudents
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((student) => {
      const studentLevel = levelsMap[student.levelID];
      const studentStartWeek = getStudentStartWeek({ year, semester }, student);

      const semesterMonthsCount = semester === 3 ? 1 : 3;
      const semesterWeeksCount = semesterMonthsCount * 4;

      const studentMissedMonths =
        student.joinYear === year && student.joinSemester === semester
          ? student.joinMonth - 1
          : 0;
      const studentMissedWeeks = studentMissedMonths * 4;

      const revisitMeetingsPerWeek = 1;
      const memorizingMeetingsPerWeek = 2;
      const memorizingMeetingsCount =
        semesterWeeksCount * memorizingMeetingsPerWeek;
      const revisitingMeetingsCount =
        semesterWeeksCount * revisitMeetingsPerWeek;
      const meetingsCount = memorizingMeetingsCount + revisitingMeetingsCount;

      const studentMissedMemorizingMeetingsCount = studentMissedWeeks * 2;
      const studentMissedRevisitingMeetingsCount = studentMissedWeeks;
      const studentMissedMeetingsCount =
        studentMissedMemorizingMeetingsCount +
        studentMissedRevisitingMeetingsCount;

      const revisitPlan = studentLevel.weeksPlan.slice(
        studentStartWeek,
        studentStartWeek + semesterWeeksCount - studentMissedWeeks
      );

      const memorizingPlan = studentLevel.memorizingDetailedPlan.slice(
        studentStartWeek * memorizingMeetingsPerWeek
      );

      const revisitSummary = revisitPlan.map((week) => {
        if (
          student.revisitProgress.find(
            (range) => range[0] <= week[0] && range[1] >= week[1]
          )
        ) {
          return 1; //"✅";
        }

        return 0; // "❌";
      });

      const preDefaultRevisitFill = Array(
        studentMissedRevisitingMeetingsCount
      ).fill(0);

      const postDefaultRevisitFill = Array(
        Math.max(
          semesterWeeksCount -
            revisitSummary.length -
            preDefaultRevisitFill.length,
          0
        )
      ).fill(0);

      const fullRevisitSummary = [
        ...preDefaultRevisitFill,
        ...revisitSummary,
        ...postDefaultRevisitFill,
      ];

      const presenceAndAbsenceDetails = [];
      let presenceTotal = 0;
      let absenceTotal = 0;
      const checksStatuses = [];

      for (let i = 0; i < meetingsCount; i++) {
        let newValue = 0;
        if (i < studentMissedMeetingsCount) {
          newValue = 0;
        } else if (Math.floor(i + 1) % 3 === 0) {
          newValue = fullRevisitSummary[Math.floor(i / 3)];
        } else {
          const expectedMemorized =
            memorizingPlan[
              i - Math.floor(i / 3) - studentMissedMemorizingMeetingsCount
            ];
          newValue = student.memorizingProgress >= expectedMemorized ? 1 : 0;
        }

        if (newValue === 1) {
          presenceTotal++;
        } else {
          absenceTotal++;
        }
        presenceAndAbsenceDetails.push(newValue);

        if ((i + 1) % 6 === 0) {
          if (
            student.withdrawnSemesters?.some(
              (studentSemester) =>
                studentSemester.year === year &&
                studentSemester.semester === semester
            )
          ) {
            checksStatuses.push("الطالبـ/ـة منسحب/ة");
          } else if (
            student.frozenSemesters?.some(
              (studentSemester) =>
                studentSemester.year === year &&
                studentSemester.semester === semester
            )
          ) {
            checksStatuses.push("تم تجميد الفصل");
          } else if (i < studentMissedMeetingsCount) {
            checksStatuses.push("لم ينضم بعد");
          } else if (absenceTotal - studentMissedMeetingsCount >= 5) {
            checksStatuses.push("فصل");
          } else if (absenceTotal - studentMissedMeetingsCount >= 3) {
            checksStatuses.push("تحذير");
          } else {
            checksStatuses.push("طبيعي");
          }
        }
      }

      return [
        student.studentID,
        `=HYPERLINK( "https://khuloodsabri.github.io/tejan-alnoor/students/${student.studentID}","صفحة الطالب/ة")`,
        supervisorsMap[student.supervisorID]?.supervisorName,
        student.studentName,
        Number(student.memorizingProgress),
        student.gender === "male" ? "ذكر" : "أنثى",
        `'${student.phoneNumber}`,
        student.joinYear,
        year,
        semester,
        student.joinSemester,
        student.joinMonth,
        student.groupNumber,
        countSemesters(year, semester, student.joinYear, student.joinSemester),
        studentLevel.levelName,
        Math.floor(studentStartWeek / 4) + 1,
        student.status,
        presenceTotal,
        absenceTotal,
        ...(checksStatuses.length < 6
          ? [
              ...checksStatuses,
              ...Array(6 - checksStatuses.length).fill("الفصل الصيفي شهر واحد"),
            ]
          : checksStatuses),
        ...(presenceAndAbsenceDetails.length < 36
          ? [
              ...presenceAndAbsenceDetails,
              ...Array(36 - presenceAndAbsenceDetails.length).fill(0),
            ]
          : presenceAndAbsenceDetails),
        Number(student.tests[year]?.[semester]?.[1]),
        Number(student.tests[year]?.[semester]?.[2]),
        Number(student.tests[year]?.[semester]?.[3]),
        Number(student.tests[year]?.[semester]?.[4]),
        Number(student.tests[year]?.[semester]?.[5]),
      ];
    });

  return studentsRows;
}

export async function getStudentsBriefSheetRows() {
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

  const { year, semester } = currentSemesterDetails;

  const activeStudents =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression: "#status = :status",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "منتظم/ة",
          },
        })
      )
    )?.Items ?? [];

  console.log("active students count", activeStudents.length);

  console.log("getting levels");
  const levels =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
        })
      )
    )?.Items ?? [];

  console.log("got students and levels, mapping levels");
  const levelsMap = levels.reduce((acc, level) => {
    acc[level.levelID] = {
      ...level,
    };
    return acc;
  }, {});

  console.log("getting supervisors");
  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
        })
      )
    )?.Items ?? [];

  console.log("mapping supervisors");
  const supervisorsMap = supervisors.reduce((acc, supervisor) => {
    acc[supervisor.supervisorID] = supervisor;
    return acc;
  }, {});

  console.log("mapping active students to rows");
  const studentsRows = activeStudents
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((student) => {
      const studentLevel = levelsMap[student.levelID];
      const studentStartWeek = getStudentStartWeek({ year, semester }, student);

      return [
        student.studentID,
        `=HYPERLINK( "https://khuloodsabri.github.io/tejan-alnoor/students/${student.studentID}","صفحة الطالب/ة")`,
        supervisorsMap[student.supervisorID]?.supervisorName,
        student.studentName,
        Number(student.memorizingProgress),
        student.gender === "male" ? "ذكر" : "أنثى",
        studentLevel.levelName,
        Math.floor(studentStartWeek / 4) + 1,
        student.status,
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

  return Object.values(
    existingStudents.reduce((acc, student) => {
      return {
        ...acc,
        [student.studentID]: student,
      };
    }, {})
  );
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

async function upsertStudentsHelper(students) {
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

async function getRequiredDataUpsertedStudents(students) {
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

  return {
    levelsMap,
    supervisorsMap,
    existingStudents,
  };
}

export async function createStudents(students) {
  const { existingStudents, levelsMap, supervisorsMap } =
    await getRequiredDataUpsertedStudents(students);

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
      groupNumber: Number(student.groupNumber),
      joinYear: Number(student.joinYear),
      joinSemester: Number(student.joinSemester),
      joinMonth: Number(student.joinMonth),
      gender: student.gender === "ذكر" ? "male" : "female",
      phoneNumber: `${student.phoneNumber}`,
      status: "منتظم/ة",
      memorizingProgress: 0,
      revisitProgress: [],
      frozenSemesters: [],
      dismissedSemesters: [],
      normalizedName: normalizeString(student.studentName),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tests: {},
    }));

  let studentsToInsert = newStudents;
  let retry = 0;

  while (studentsToInsert.length > 0) {
    studentsToInsert = await upsertStudentsHelper(studentsToInsert);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (retry > 3) {
      throw new Error("Failed to insert students");
    }

    retry++;
  }

  return {
    createdStudentsCount: newStudents.length - studentsToInsert.length,
    existingStudentsCount: existingStudents.length,
    failedToInsert: studentsToInsert,
    existingStudents: existingStudents,
  };
}

// This is not exactly update but specific to update to make them rejoin as fresh
export async function updateStudents(students) {
  const { existingStudents, levelsMap, supervisorsMap } =
    await getRequiredDataUpsertedStudents(students);
  const newStudents = existingStudents.map((existingStudent) => {
    const newStudent = students.find((student) => {
      return (
        existingStudent.studentName === student.studentName ||
        existingStudent.phoneNumber === student.phoneNumber
      );
    });
    return {
      ...existingStudent,
      studentName: newStudent.studentName,
      levelID: levelsMap[translateNumberToArabic(newStudent.level)],
      supervisorID: supervisorsMap[newStudent.supervisorName],
      groupNumber: Number(newStudent.groupNumber),
      joinYear: Number(newStudent.joinYear),
      joinSemester: Number(newStudent.joinSemester),
      joinMonth: Number(newStudent.joinMonth),
      gender: newStudent.gender === "ذكر" ? "male" : "female",
      phoneNumber: `${newStudent.phoneNumber}`,
      status: "منتظم/ة",
      memorizingProgress: 0,
      revisitProgress: [],
      frozenSemesters: existingStudent.frozenSemesters,
      withdrawnSemesters: existingStudent.withdrawnSemesters,
      dismissedSemesters: existingStudent.dismissedSemesters,
      normalizedName: normalizeString(newStudent.studentName),
      createdAt: existingStudent.createdAt,
      updatedAt: Date.now(),
      tests: {},
    };
  });

  let studentsToUpdate = newStudents;
  let retry = 0;

  while (studentsToUpdate.length > 0) {
    studentsToUpdate = await upsertStudentsHelper(studentsToUpdate);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (retry > 3) {
      throw new Error("Failed to insert students");
    }

    retry++;
  }

  return {
    updatedStudentsCount: newStudents.length - studentsToUpdate.length,
    failedToUpdate: studentsToUpdate,
  };
}

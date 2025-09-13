import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  GetCommand,
  DynamoDBDocumentClient,
  BatchWriteCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { translateNumberToArabic } from "./number.mjs";
import {
  compareSemesters,
  getLevelMemorizingDirection,
  normalizeString,
} from "./utils.mjs";
import * as Yup from "yup";
import {
  convertAyahProgressToPage,
  convertPageProgressToAyah,
} from "./surah.mjs";

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

export async function setSemesterUpdateDate(semesterYear, semesterNumber) {
  const newItem = await awsDocDynamoDbClient.send(
    new UpdateCommand({
      TableName: "Semesters",
      Key: {
        semesterID: `${semesterYear}-${semesterNumber}`,
      },
      UpdateExpression: "SET #updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":updatedAt": Date.now(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return newItem;
}

function getMemorizingMeetingsPlan(level) {
  const weeksPerMonth = 4;
  const meetingsPerWeek = 2;
  const meetingsPerMonth = meetingsPerWeek * weeksPerMonth;
  const meetingsCount = meetingsPerMonth * level.monthsPlanByPage.length;

  // starts from page 2
  const memorizingPlan = [2, ...level.monthsPlanByPage];

  const avgExpectedMemorizedPerMonth =
    level.avgMemorizedPagesPerMeeting * meetingsPerMonth;

  const meetingsExpectedMemorizedPages = [];

  for (let i = 0; i < meetingsCount; i++) {
    let value;
    const prevMonthIndex = Math.floor(i / (meetingsPerWeek * weeksPerMonth));

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

function sortLevelChanges(studentLevelChanges) {
  return (studentLevelChanges ?? []).sort((a, b) => {
    let res = a.semester.year - b.semester.year;

    if (res === 0) {
      res = a.semester.semester - b.semester.semester;

      if (res === 0) {
        res = a.semester.month - b.semester.month;
      }
    }

    return res;
  });
}

export async function getStudentsDetailedSheetRows(year, semester) {
  const studentsDetails = await getSemesterStudentsDetails(year, semester);
  const studentRows = studentsDetails.map((studentDetails) => {
    return [
      studentDetails.studentID,
      studentDetails.studentLink,
      studentDetails.supervisorName,
      studentDetails.studentName,
      Number(studentDetails.memorizingProgress),
      studentDetails.gender,
      `'${studentDetails.phoneNumber}`,
      studentDetails.joinYear,
      year,
      semester,
      studentDetails.joinSemester,
      studentDetails.joinMonth,
      studentDetails.groupNumber,
      studentDetails.semestersCount,
      ...studentDetails.semesterPlans,
      ...studentDetails.semesterPlanMonths,
      studentDetails.studentCurrentMonth,
      studentDetails.status,
      studentDetails.presenceCount.total,
      studentDetails.presenceCount.memorizing,
      studentDetails.presenceCount.revisit,
      studentDetails.absenceCount.total,
      studentDetails.absenceCount.memorizing,
      studentDetails.absenceCount.revisit,
      ...studentDetails.checkStatuses.flatMap((status) =>
        [status.memorizing, status.revisit].filter((status) => status !== "-")
      ),
      ...studentDetails.presenceAndAbsenceDetails,
      Number(studentDetails.tests[year]?.[semester]?.[1]),
      Number(studentDetails.tests[year]?.[semester]?.[2]),
      Number(studentDetails.tests[year]?.[semester]?.[3]),
      Number(studentDetails.tests[year]?.[semester]?.[4]),
      Number(studentDetails.tests[year]?.[semester]?.[5]),
    ];
  });

  return studentRows;
}

export async function getSemesterStudentsDetails(
  year,
  semester,
  gender = null
) {
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

  console.log("getting semester students");
  let genderFilterExpression = "";
  if (gender) {
    genderFilterExpression = "#gender = :gender AND ";
  }
  const semesterStudents =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression: `${genderFilterExpression}((#joinYear <= :year AND #joinSemester <= :semester) OR #joinYear < :year)`,
          ExpressionAttributeNames: {
            "#joinYear": "joinYear",
            "#joinSemester": "joinSemester",
            ...(gender ? { "#gender": "gender" } : {}),
          },
          ExpressionAttributeValues: {
            ":year": year,
            ":semester": semester,
            ...(gender ? { ":gender": gender } : {}),
          },
        })
      )
    )?.Items ?? [];

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

  console.log("getting semester alerts");
  const semesterAlerts =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "alertHistory",
          FilterExpression: `#year = :year AND #semester = :semester`,
          ExpressionAttributeNames: {
            "#year": "year",
            "#semester": "semester",
          },
          ExpressionAttributeValues: {
            ":year": year,
            ":semester": semester,
          },
        })
      )
    )?.Items ?? [];

  console.log("mapping semester alerts");
  const semesterAlertsMap = semesterAlerts.reduce((acc, alert) => {
    if (!acc[alert.studentID]) {
      acc[alert.studentID] = [];
    }
    acc[alert.studentID].push(alert);
    return acc;
  }, {});

  // Semester counts
  const semesterMonthsCount = semester === 3 ? 1 : 3;
  const semesterWeeksCount = semesterMonthsCount * 4;
  const revisitMeetingsPerWeek = 1;
  const memorizingMeetingsPerWeek = 2;
  const memorizingMeetingsCount =
    semesterWeeksCount * memorizingMeetingsPerWeek;
  const revisitingMeetingsCount = semesterWeeksCount * revisitMeetingsPerWeek;
  const meetingsCount = memorizingMeetingsCount + revisitingMeetingsCount;
  const meetingsPerMonth =
    memorizingMeetingsPerWeek * 4 + revisitMeetingsPerWeek * 4;

  const levelIdToMemMeetingsAbsenceLimits = {
    0: { warn: 4, dismiss: 8 },
    1: { warn: 4, dismiss: 8 },
    2: { warn: 4, dismiss: 8 },
    3: { warn: 2, dismiss: 6 },
  };

  console.log("getting semester students details");
  const studentsRows = await Promise.all(
    semesterStudents
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (student) => {
        const studentStartWeek = getStudentStartWeek(
          { year, semester },
          student
        );

        const studentMissedMonths =
          student.joinYear === year && student.joinSemester === semester
            ? student.joinMonth - 1
            : 0;
        const studentMissedWeeks = studentMissedMonths * 4;

        const studentMissedMemorizingMeetingsCount = studentMissedWeeks * 2;
        const studentMissedRevisitingMeetingsCount = studentMissedWeeks;
        const studentMissedMeetingsCount =
          studentMissedMemorizingMeetingsCount +
          studentMissedRevisitingMeetingsCount;

        const studentMemMeetingsAbsenceLimits =
          levelIdToMemMeetingsAbsenceLimits[student.levelID] || {
            warn: Infinity,
            dismiss: Infinity,
          };

        const studentSemesterAlerts =
          semesterAlertsMap[student.studentID] || [];

        const studentLevelChanges = student.levelChanges ?? [];
        const weeksDetails = [];

        const sortedChanges = sortLevelChanges(studentLevelChanges ?? []);
        const initialLevelId =
          sortedChanges?.[0]?.fromLevelID ?? student.levelID;

        // Make sure to preserve previous memorizing in different direction (Juz' Amma is in different direction than others)
        const detailedStudentMemorizingProgress = {
          asc: 0,
          desc: 0,
        };

        if (getLevelMemorizingDirection(student.levelID) === "desc") {
          const ascProgress = studentLevelChanges.reduce((acc, change) => {
            if (getLevelMemorizingDirection(change.fromLevelID) === "asc") {
              return Math.max(change.memorizingProgress, acc);
            }
            return acc;
          }, 0);

          detailedStudentMemorizingProgress.asc = ascProgress ?? 0;
          detailedStudentMemorizingProgress.desc = student.memorizingProgress;
        } else {
          const descProgress = studentLevelChanges.reduce((acc, change) => {
            if (getLevelMemorizingDirection(change.fromLevelID) === "desc") {
              return Math.max(change.memorizingProgress, acc);
            }
            return acc;
          }, 0);

          detailedStudentMemorizingProgress.desc = descProgress ?? 0;
          detailedStudentMemorizingProgress.asc = student.memorizingProgress;
        }

        // Make sure to not handle a student who moved to level X after some time the same as a student who started
        // in level X. The rule is: we search in the monthly plan for the max month's progress that the student
        // already finished when moving to level X. We consider that after the level change the student will
        // commit to this plan starting from this plan month
        for (let i = 0; i < semesterWeeksCount - studentMissedWeeks; i++) {
          // month of semester
          const month = Math.floor(i / 4) + 1;

          const lastLevelChange = sortedChanges.findLast((levelChange) => {
            return (
              compareSemesters(levelChange.semester, {
                year,
                semester,
                month,
              }) <= 0
            );
          });

          if (lastLevelChange) {
            let newLevelPlanStartMonth = 0;
            //levelID 0 has different memorizing direction than other levels
            if (
              getLevelMemorizingDirection(lastLevelChange.toLevelID) !==
              getLevelMemorizingDirection(lastLevelChange.fromLevelID)
            ) {
              const prevChangeFromSameDirection = sortedChanges.find(
                (levelChange) => {
                  // needs to be before
                  if (
                    compareSemesters(
                      levelChange.semester,
                      lastLevelChange.semester
                    ) >= 0
                  ) {
                    return false;
                  }

                  return (
                    getLevelMemorizingDirection(lastLevelChange.toLevelID) ===
                    getLevelMemorizingDirection(levelChange.fromLevelID)
                  );
                }
              );

              if (prevChangeFromSameDirection) {
                newLevelPlanStartMonth = levelsMap[
                  lastLevelChange.toLevelID
                ].monthsPlanByPage.findIndex(
                  (monthProgress) =>
                    prevChangeFromSameDirection.memorizingProgress <
                    monthProgress
                );
              } else {
                newLevelPlanStartMonth = 0;
              }
            } else {
              newLevelPlanStartMonth = levelsMap[
                lastLevelChange.toLevelID
              ].monthsPlanByPage.findIndex(
                (monthProgress) =>
                  lastLevelChange.memorizingProgress < monthProgress
              );
            }

            const lastLevelChangeStartWeek =
              (lastLevelChange.semester.month - 1) * 4 +
              getStudentStartWeek(
                {
                  year: lastLevelChange.semester.year,
                  semester: lastLevelChange.semester.semester,
                },
                student
              );

            let shift = newLevelPlanStartMonth * 4 - lastLevelChangeStartWeek;

            weeksDetails.push({
              levelID: lastLevelChange.toLevelID,
              weeklyPlanIndex: studentStartWeek + shift + i,
            });
          } else {
            weeksDetails.push({
              levelID: initialLevelId,
              weeklyPlanIndex: studentStartWeek + i,
            });
          }
        }

        // build the revisit plan for the student
        const revisitPlan = await Promise.all(
          weeksDetails.map(async (weekDetails) => {
            const range =
              levelsMap[weekDetails.levelID].weeksPlan[
                weekDetails.weeklyPlanIndex
              ];

            if (
              levelsMap[weekDetails.levelID].progressUnit !==
              levelsMap[student.levelID].progressUnit
            ) {
              // convert plan to the final student level map
              // These conversions will use the cached array not external API
              if (levelsMap[student.levelID].progressUnit === "ayah") {
                return (await convertPageProgressToAyah([range]))[0];
              } else {
                return (await convertAyahProgressToPage([range]))[0];
              }
            }

            return range;
          })
        );

        const memorizingPlan = weeksDetails.flatMap((weekDetails) => {
          const plan = levelsMap[weekDetails.levelID].memorizingDetailedPlan;
          const startIndex = weekDetails.weeklyPlanIndex * 2;
          const direction = getLevelMemorizingDirection(weekDetails.levelID);
          return [
            {
              pages: plan[startIndex],
              direction,
            },
            {
              pages: plan[startIndex + 1],
              direction,
            },
          ];
        });

        const revisitSummary = revisitPlan.map((week) => {
          // plan is not defined
          if (!week) {
            return 0;
          }

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

        // not needed
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
        let memPresenceTotal = 0;
        let memAbsenceTotal = 0;
        let revisitPresenceTotal = 0;
        let revisitAbsenceTotal = 0;
        let missedMemInTwoWeeksAfterJoin = 0;

        const checksStatuses = [];

        for (let i = 0; i < meetingsCount; i++) {
          let newValue = 0;
          let src = "";

          const month = Math.floor(i / meetingsPerMonth) + 1;
          const isStudentFirstMonth =
            student.joinYear === year &&
            student.joinSemester === semester &&
            student.joinMonth === month;

          const prevRevisitWarnAlertsCount = studentSemesterAlerts.filter(
            (alert) =>
              alert.semester === semester &&
              alert.year === year &&
              alert.month < month &&
              alert.alertType === "تحذير" &&
              alert.alertSource === "مراجعة" &&
              !alert.recoveredAt
          ).length;

          if (i < studentMissedMeetingsCount) {
            newValue = 0;
          } else if (Math.floor(i + 1) % 3 === 0) {
            newValue = fullRevisitSummary[Math.floor(i / 3)];
            src = "revisit";
          } else {
            const memorizingPlanIndex =
              i - Math.floor(i / 3) - studentMissedMemorizingMeetingsCount;
            const expectedMemorized = memorizingPlan[memorizingPlanIndex].pages;
            const actualMemorized =
              detailedStudentMemorizingProgress[
                memorizingPlan[memorizingPlanIndex].direction
              ];
            newValue = actualMemorized >= expectedMemorized ? 1 : 0;
            src = "memorizing";

            // if the student missed 4 memorizing meetings in the first two weeks after joining, they should be dismissed
            if (
              isStudentFirstMonth &&
              newValue === 0 &&
              i - studentMissedMeetingsCount < meetingsPerMonth / 2
            ) {
              missedMemInTwoWeeksAfterJoin++;
            }
          }

          if (newValue === 1) {
            presenceTotal++;

            if (src === "memorizing") {
              memPresenceTotal++;
            } else if (src === "revisit") {
              revisitPresenceTotal++;
            }
          } else {
            absenceTotal++;

            if (src === "memorizing") {
              memAbsenceTotal++;
            } else if (src === "revisit") {
              revisitAbsenceTotal++;
            }
          }

          presenceAndAbsenceDetails.push(newValue);

          if ((i + 1) % 6 === 0) {
            // not end of month
            const skipRevisitCheck = (i + 1) % meetingsPerMonth !== 0;

            if (i < studentMissedMeetingsCount) {
              checksStatuses.push({
                memorizing: "لم ينضم بعد",
                revisit: skipRevisitCheck ? "-" : "لم ينضم بعد",
              });
            } else if (
              student.withdrawnSemesters?.some(
                (studentSemester) =>
                  studentSemester.year === year &&
                  studentSemester.semester === semester
              )
            ) {
              checksStatuses.push({
                memorizing: "الطالبـ/ـة منسحب/ة",
                revisit: skipRevisitCheck ? "-" : "الطالبـ/ـة منسحب/ة",
              });
            } else if (
              student.frozenSemesters?.some(
                (studentSemester) =>
                  studentSemester.year === year &&
                  studentSemester.semester === semester
              )
            ) {
              checksStatuses.push({
                memorizing: "تم تجميد الفصل",
                revisit: skipRevisitCheck ? "-" : "تم تجميد الفصل",
              });
            } else {
              let memStatus = "طبيعي";
              let revisitStatus = "طبيعي";

              if (missedMemInTwoWeeksAfterJoin >= 4) {
                memStatus = "فصل";
              } else if (
                memAbsenceTotal >= studentMemMeetingsAbsenceLimits.dismiss
              ) {
                memStatus = "فصل";
              } else if (
                memAbsenceTotal >= studentMemMeetingsAbsenceLimits.warn
              ) {
                memStatus = "تحذير";
              }

              if (skipRevisitCheck) {
                revisitStatus = "-";
              } else if (revisitAbsenceTotal >= 4) {
                // After two warnings, next is dismissal
                if (prevRevisitWarnAlertsCount >= 2) {
                  revisitStatus = "فصل";
                } else {
                  revisitStatus = "تحذير";
                }
              }

              checksStatuses.push({
                memorizing: memStatus,
                revisit: revisitStatus,
              });
            }
          }
        }

        const isCurrentSemester =
          currentSemesterDetails.year === year &&
          currentSemesterDetails.semester === semester;

        const semesterMonthsPassed = isCurrentSemester
          ? currentSemesterDetails.month
          : semesterMonthsCount;

        const studentMonthsPassedInSemester =
          year === student.joinYear && semester === student.joinSemester
            ? Math.max(0, semesterMonthsPassed - student.joinMonth + 1)
            : semesterMonthsPassed;

        const studentCurrentMonth =
          Math.floor(studentStartWeek / 4) + studentMonthsPassedInSemester;

        const planLevel1 =
          levelsMap[weeksDetails[0]?.levelID]?.levelName ?? "/";
        const planLevel2 =
          levelsMap[weeksDetails[4]?.levelID]?.levelName ?? "/";
        const planLevel3 =
          levelsMap[weeksDetails[8]?.levelID]?.levelName ?? "/";

        const planMonth1 = weeksDetails[0]
          ? ((weeksDetails[0].weeklyPlanIndex ?? 0) - studentMissedWeeks) / 4 +
            1
          : "/";

        const planMonth2 = weeksDetails[4]
          ? ((weeksDetails[4].weeklyPlanIndex ?? 0) - studentMissedWeeks) / 4 +
            1
          : "/";

        const planMonth3 = weeksDetails[8]
          ? ((weeksDetails[8].weeklyPlanIndex ?? 0) - studentMissedWeeks) / 4 +
            1
          : "/";

        return {
          ...student,
          studentLink: `=HYPERLINK( "https://khuloodsabri.github.io/tejan-alnoor/students/${student.studentID}","صفحة الطالب/ة")`,
          supervisorName: supervisorsMap[student.supervisorID]?.supervisorName,
          memorizingProgress: Number(student.memorizingProgress),
          gender: student.gender === "male" ? "ذكر" : "أنثى",
          semestersCount: countSemesters(
            year,
            semester,
            student.joinYear,
            student.joinSemester
          ),
          semesterPlans: [planLevel1, planLevel2, planLevel3],
          semesterPlanMonths: [planMonth1, planMonth2, planMonth3],
          studentCurrentMonth,
          presenceCount: {
            total: presenceTotal,
            memorizing: memPresenceTotal,
            revisit: revisitPresenceTotal,
          },
          absenceCount: {
            total: absenceTotal,
            memorizing: memAbsenceTotal,
            revisit: revisitAbsenceTotal,
          },
          checkStatuses:
            checksStatuses.length < 6
              ? [
                  ...checksStatuses,
                  ...Array(6 - checksStatuses.length)
                    .fill({
                      memorizing: "الفصل الصيفي شهر واحد",
                      revisit: "الفصل الصيفي شهر واحد",
                    })
                    .map((status, index) => {
                      // revisit check only on end of month and we have 2 checks per month
                      if (index % 2 == 0) {
                        return {
                          memorizing: "الفصل الصيفي شهر واحد",
                          revisit: "-",
                        };
                      }

                      return status;
                    }),
                ]
              : checksStatuses,
          presenceAndAbsenceDetails:
            presenceAndAbsenceDetails.length < 36
              ? [
                  ...presenceAndAbsenceDetails,
                  ...Array(36 - presenceAndAbsenceDetails.length).fill(0),
                ]
              : presenceAndAbsenceDetails,
          semesterAlerts: studentSemesterAlerts,
        };
      })
  );

  return studentsRows;
}

export async function getStudentsAlerts(
  year,
  semester,
  month,
  checkRoundNumber,
  gender
) {
  const studentsDetails = await getSemesterStudentsDetails(
    year,
    semester,
    gender
  );

  // every month has two checks, one every two weeks
  const statusIndex = (month - 1) * 2 + (checkRoundNumber === 1 ? 0 : 1);
  const sourceMap = {
    memorizing: "حفظ",
    revisit: "مراجعة",
  };

  const alerts = studentsDetails
    .flatMap((studentDetails) => {
      return Object.entries(studentDetails.checkStatuses[statusIndex]).map(
        ([source, status]) => {
          const alert = studentDetails.semesterAlerts.find(
            (alert) =>
              alert.alertSource === sourceMap[source] &&
              alert.alertType === status &&
              alert.checkRoundNumber === checkRoundNumber &&
              // These below are just double checkings
              alert.month === month &&
              alert.year === year &&
              alert.semester === semester
          );

          return {
            studentID: studentDetails.studentID,
            studentName: studentDetails.studentName,
            supervisorName: studentDetails.supervisorName,
            gender: studentDetails.gender,
            phoneNumber: studentDetails.phoneNumber,
            alertType: status,
            alertSource: sourceMap[source],
            alertId: alert?.id,
            alertRecoveredAt: alert?.recoveredAt || null,
          };
        }
      );
    })
    .filter(({ alertType }) => alertType === "تحذير" || alertType === "فصل");

  return alerts;
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
      withdrawnSemesters: [],
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
export async function replaceStudents(students) {
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

export async function getStudentById(studentId, includeSubresources = {}) {
  console.log("getting student", studentId, "----", includeSubresources);
  let student =
    (
      await awsDocDynamoDbClient.send(
        new GetCommand({
          TableName: "Students",
          Key: {
            studentID: studentId,
          },
        })
      )
    )?.Item ?? null;

  if (includeSubresources.supervisorName) {
    const supervisor =
      (
        await awsDocDynamoDbClient.send(
          new GetCommand({
            TableName: "Supervisors",
            Key: {
              supervisorID: student.supervisorID,
            },
            ProjectionExpression: "supervisorID, supervisorName",
          })
        )
      )?.Item ?? null;

    student = {
      ...student,
      supervisorName: supervisor?.supervisorName,
    };
  }

  return student;
}

export async function searchStudentsByName(studentName) {
  const students =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Students",
          FilterExpression: "contains(#normalizedName, :studentName)",
          ExpressionAttributeNames: {
            "#normalizedName": "normalizedName",
          },
          ExpressionAttributeValues: {
            ":studentName": normalizeString(studentName),
          },
          ProjectionExpression: "studentID, studentName, supervisorID, levelID",
        })
      )
    )?.Items ?? [];

  if (students.length === 0) {
    return [];
  }

  const studentSupervisorIds = [
    ...new Set(students.map((student) => student.supervisorID)),
  ];

  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
          FilterExpression: studentSupervisorIds
            .map((_, index) => `#supervisorID = :supervisorID${index}`)
            .join(" OR "),

          ExpressionAttributeNames: {
            "#supervisorID": "supervisorID",
          },
          ExpressionAttributeValues: studentSupervisorIds.reduce(
            (acc, supervisorId, index) => {
              acc[`:supervisorID${index}`] = supervisorId;
              return acc;
            },
            {}
          ),
          ProjectionExpression: "supervisorID, supervisorName",
        })
      )
    )?.Items ?? [];

  const supervisorsMap = supervisors.reduce((acc, supervisor) => {
    acc[supervisor.supervisorID] = supervisor.supervisorName;
    return acc;
  }, {});

  return students.map((student) => ({
    ...student,
    supervisorName: supervisorsMap[student.supervisorID],
  }));
}

export async function searchSupervisorsByName(name) {
  const supervisors =
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Supervisors",
          FilterExpression: "contains(#normalizedName, :supervisorName)",
          ExpressionAttributeNames: {
            "#normalizedName": "normalizedName",
          },
          ExpressionAttributeValues: {
            ":supervisorName": normalizeString(name),
          },
          ProjectionExpression: "supervisorID, supervisorName",
        })
      )
    )?.Items ?? [];

  return supervisors;
}

export const validateUpdateStudentBody = (body) => {
  const validationSchema = Yup.object().shape({
    studentName: Yup.string()
      .required("يجب إدخال اسم الطالبـ/ـة")
      .max(100, "اسم الطالبـ/ـة لا يمكن أن يتجاوز 100 حرف"),

    gender: Yup.string()
      .oneOf(["male", "female"], 'الجنس يجب أن يكون "ذكر" أو "أنثى"')
      .required("يجب اختيار الجنس"),

    groupNumber: Yup.number()
      .required("يجب إدخال رقم الدفعة")
      .integer("رقم الدفعة يجب أن يكون عدد صحيح"),

    supervisor: Yup.object()
      .shape({
        supervisorID: Yup.string().nullable(),
        supervisorName: Yup.string().required("Supervisor name is required"),
      })
      .required("يجب اختيار مشرفـ/ـة"),
    phoneNumber: Yup.string().matches(
      /(^\d{10}(\d{2})?(\d{2})?$)|()/,
      "رقم الهاتف يجب أن يتكون من 10 أرقام أو 12 أو 14 رقمًًا مع الكود الدولي "
    ),

    levelID: Yup.string()
      .required("يجب اختيار المستوى")
      .min(0, "الستوى المختار غير صحيح")
      .max(3, "المستوى المختار غير صحيح"),

    status: Yup.string()
      .required("يجب اختيار الحالة")
      .oneOf(
        ["منتظم/ة", "منسحب/ة", "جمد/ت الفصل", "مفصول/ة"],
        "الحالة المدخلة غير صحيحة"
      ),

    joinYear: Yup.number()
      .required("يجب إدخال سنة الالتحاق")
      .integer("سنة الالتحاق يجب أن تكون عدد صحيح")
      .min(1900, "سنة الالتحاق يجب أن تكون بعد عام 1900"),

    joinSemester: Yup.number()
      .required("يجب اختيار فصل الالتحاق")
      .integer("فصل الالتحاق يجب أن يكون عدد صحيح")
      .min(1, "فصل الالتحاق المختار غير صحيح")
      .max(3, "فصل الالتحاق المختار غير صحيح"),

    joinMonth: Yup.number()
      .required("يجب اختيار شهر الالتحاق")
      .integer("شهر الالتحاق يجب أن يكون عدد صحيح")
      .min(1, "شهر الالتحاق يجب أن يكون بين 1 - 3")
      .max(3, "شهر الالتحاق يجب أن يكون بين 1 - 3"),

    withdrawnSemesters: Yup.array().of(
      Yup.object().shape({
        year: Yup.number()
          .required("يجب إدخال سنة الانسحاب")
          .integer("سنة الانسحاب يجب أن تكون عدد صحيح")
          .min(1900, "سنة الانسحاب يجب أن تكون بعد عام 1900"),
        semester: Yup.number()
          .required("يجب اختيار فصل الانسحاب")
          .integer("فصل الانسحاب يجب أن يكون عدد صحيح")
          .min(1, "فصل الانسحاب المختار غير صحيح")
          .max(3, "فصل الانسحاب المختار غير صحيح"),
      })
    ),

    frozenSemesters: Yup.array().of(
      Yup.object().shape({
        year: Yup.number()
          .required("يجب إدخال سنة الانسحاب")
          .integer("سنة الانسحاب يجب أن تكون عدد صحيح")
          .min(1900, "سنة الانسحاب يجب أن تكون بعد عام 1900"),
        semester: Yup.number()
          .required("يجب اختيار فصل الانسحاب")
          .integer("فصل الانسحاب يجب أن يكون عدد صحيح")
          .min(1, "فصل الانسحاب المختار غير صحيح")
          .max(3, "فصل الانسحاب المختار غير صحيح"),
      })
    ),

    dismissedSemesters: Yup.array().of(
      Yup.object().shape({
        year: Yup.number()
          .required("يجب إدخال سنة الانسحاب")
          .integer("سنة الانسحاب يجب أن تكون عدد صحيح")
          .min(1900, "سنة الانسحاب يجب أن تكون بعد عام 1900"),
        semester: Yup.number()
          .required("يجب اختيار فصل الانسحاب")
          .integer("فصل الانسحاب يجب أن يكون عدد صحيح")
          .min(1, "فصل الانسحاب المختار غير صحيح")
          .max(3, "فصل الانسحاب المختار غير صحيح"),
      })
    ),
  });

  validationSchema.validateSync(body);
};

export const updateStudent = async (studentId, student, oldStudent) => {
  const { supervisor, ...studentData } = student;

  if (supervisor.supervisorID) {
    studentData.supervisorID = supervisor.supervisorID;
  } else {
    const supervisorID = uuidv4();
    studentData.supervisorID = supervisorID;
    await awsDocDynamoDbClient.send(
      new PutCommand({
        TableName: "Supervisors",
        Item: {
          supervisorID: supervisorID,
          supervisorName: supervisor.supervisorName,
          normalizedName: normalizeString(supervisor.supervisorName),
        },
      })
    );
  }

  await setStudentLevelUpdates(oldStudent, studentData);

  await awsDocDynamoDbClient.send(
    new PutCommand({
      TableName: "Students",
      Item: {
        studentID: studentId,
        ...oldStudent,
        ...studentData,
        updatedAt: Date.now(),
        normalizedName: normalizeString(studentData.studentName),
      },
    })
  );
};

export async function getLevels() {
  return (
    (
      await awsDocDynamoDbClient.send(
        new ScanCommand({
          TableName: "Levels",
        })
      )
    )?.Items ?? []
  );
}

async function setStudentLevelUpdates(oldStudent, newStudent) {
  const oldLevelChanges = (oldStudent.levelChanges ?? []).sort((a, b) =>
    compareSemesters(a.semester, b.semester)
  );

  const newLevelChanges = (newStudent.levelChanges ?? []).sort((a, b) =>
    compareSemesters(a.semester, b.semester)
  );

  const getChangeKey = (change) =>
    `${change.semester.year}-${change.semester.semester}-${change.semester.month}-${change.fromLevelID}-${change.toLevelID}`;

  const oldLevelChangesLookup = new Set(oldLevelChanges.map(getChangeKey));
  const newLevelChangesLookup = new Set(newLevelChanges.map(getChangeKey));

  const removedLevelChanges = oldLevelChanges.filter(
    (change) => !newLevelChangesLookup.has(getChangeKey(change))
  );

  const addedLevelChanges = newLevelChanges.filter(
    (change) => !oldLevelChangesLookup.has(getChangeKey(change))
  );

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

  for (const addedLevelChange of addedLevelChanges) {
    addedLevelChange.memorizingProgress = oldStudent.memorizingProgress;

    if (
      compareSemesters(addedLevelChange.semester, currentSemesterDetails) == 0
    ) {
      if (newStudent.levelID !== addedLevelChange.toLevelID) {
        throw new Error(
          "invalid new level ID, the level ID in the current change does not match"
        );
      }
    }
  }

  for (const removedLevelChange of removedLevelChanges) {
    if (compareSemesters(removedLevelChange, currentSemesterDetails) < 0) {
      throw new Error("cannot remove level changes of past semesters/months");
    }

    // changed memorizing direction
    if (
      getLevelMemorizingDirection(removedLevelChange.fromLevelID) !==
      getLevelMemorizingDirection(removedLevelChange.toLevelID)
    ) {
      let prevChangeSameDirIndex = -1;

      for (let i = oldLevelChanges.length - 1; i >= 0; i--) {
        if (
          compareSemesters(
            oldLevelChanges[i].semester,
            removedLevelChange.semester
          ) < 0 &&
          getLevelMemorizingDirection(oldLevelChanges[i].fromLevelID) ===
            getLevelMemorizingDirection(removedLevelChange.toLevelID)
        ) {
          prevChangeSameDirIndex = i;
        }
      }

      if (
        (prevChangeSameDirIndex === -1 && oldStudent.memorizingProgress > 0) ||
        (prevChangeSameDirIndex !== -1 &&
          oldLevelChanges[prevChangeSameDirIndex].memorizingProgress !==
            oldStudent.memorizingProgress)
      ) {
        throw new Error(
          "لا يمكن حذف تغيير من أو إلى جزء عم اذا كان الطالب حقق إانجازا بعد هذا التغيير"
        );
      }
    }
  }

  if (newStudent.levelID !== oldStudent.levelID) {
    const progressUpdates = await getUpdatedProgressAfterLevelChange(
      oldStudent,
      newStudent.levelID
    );

    for (const key of Object.keys(progressUpdates)) {
      newStudent[key] = progressUpdates[key];
    }
  }
}

async function getUpdatedProgressAfterLevelChange(oldStudent, newLevelID) {
  const studentProgressUpdates = {
    revisitProgress: oldStudent.revisitProgress,
    memorizingProgress: oldStudent.memorizingProgress,
  };

  if (newLevelID !== oldStudent.levelID) {
    const oldLevel =
      (
        await awsDocDynamoDbClient.send(
          new GetCommand({
            TableName: "Levels",
            Key: {
              levelID: oldStudent.levelID,
            },
            ProjectionExpression: "levelID, progressUnit",
          })
        )
      )?.Item ?? null;

    const newLevel =
      (
        await awsDocDynamoDbClient.send(
          new GetCommand({
            TableName: "Levels",
            Key: {
              levelID: newLevelID,
            },
            ProjectionExpression: "levelID, progressUnit",
          })
        )
      )?.Item ?? null;

    if (oldLevel.progressUnit != newLevel.progressUnit) {
      if (
        oldLevel.progressUnit === "ayah" &&
        newLevel.progressUnit === "page"
      ) {
        const newRevisitProgress = await convertAyahProgressToPage(
          oldStudent.revisitProgress
        );

        studentProgressUpdates.revisitProgress = newRevisitProgress;
      } else {
        const newRevisitProgress = await convertPageProgressToAyah(
          oldStudent.revisitProgress
        );

        studentProgressUpdates.revisitProgress = newRevisitProgress;
      }
    }

    studentProgressUpdates.memorizingProgress = oldStudent.memorizingProgress;

    if (
      getLevelMemorizingDirection(newLevelID) !==
      getLevelMemorizingDirection(oldStudent.levelID)
    ) {
      const oldLevelChanges = (oldStudent.levelChanges ?? []).sort((a, b) =>
        compareSemesters(a.semester, b.semester)
      );

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

      const prevChangeWithMemInSameDirection = oldLevelChanges.findLast(
        (change) =>
          getLevelMemorizingDirection(change.fromLevelID) ===
            getLevelMemorizingDirection(newLevelID) &&
          compareSemesters(change.semester, currentSemesterDetails) <= 0
      );

      studentProgressUpdates.memorizingProgress =
        prevChangeWithMemInSameDirection?.memorizingProgress ?? 0;
    }
  }

  return studentProgressUpdates;
}

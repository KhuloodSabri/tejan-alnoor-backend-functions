import fs from "fs";
import csv from "csv-parser";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const suar = [
  { id: 1, surah: "ٱلْفَاتِحَةِ", ayah: 7 },
  { id: 2, surah: "البَقَرَةِ", ayah: 286 },
  { id: 3, surah: "آلِ عِمۡرَانَ", ayah: 200 },
  { id: 4, surah: "النِّسَاءِ", ayah: 176 },
  { id: 5, surah: "المَائـِدَةِ", ayah: 120 },
  { id: 6, surah: "الأَنۡعَامِ", ayah: 165 },
  { id: 7, surah: "الأَعۡرَافِ", ayah: 206 },
  { id: 8, surah: "الأَنفَالِ", ayah: 75 },
  { id: 9, surah: "التَّوۡبَةِ", ayah: 129 },
  { id: 10, surah: "يُونُسَ", ayah: 109 },
  { id: 11, surah: "هُودٍ", ayah: 123 },
  { id: 12, surah: "يُوسُفَ", ayah: 111 },
  { id: 13, surah: "الرَّعۡدِ", ayah: 43 },
  { id: 14, surah: "إِبۡرَاهِيمَ", ayah: 52 },
  { id: 15, surah: "الحِجۡرِ", ayah: 99 },
  { id: 16, surah: "النَّحۡلِ", ayah: 128 },
  { id: 17, surah: "الإِسۡرَاءِ", ayah: 111 },
  { id: 18, surah: "الكَهۡفِ", ayah: 110 },
  { id: 19, surah: "مَرۡيَمَ", ayah: 98 },
  { id: 20, surah: "طه", ayah: 135 },
  { id: 21, surah: "الأَنبِيَاءِ", ayah: 112 },
  { id: 22, surah: "الحَجِّ", ayah: 78 },
  { id: 23, surah: "المُؤۡمِنُونَ", ayah: 118 },
  { id: 24, surah: "النُّورِ", ayah: 64 },
  { id: 25, surah: "الفُرۡقَانِ", ayah: 77 },
  { id: 26, surah: "الشُّعَرَاءِ", ayah: 227 },
  { id: 27, surah: "النَّمۡلِ", ayah: 93 },
  { id: 28, surah: "القَصَصِ", ayah: 88 },
  { id: 29, surah: "العَنكَبُوتِ", ayah: 69 },
  { id: 30, surah: "الرُّومِ", ayah: 60 },
  { id: 31, surah: "لُقۡمَانَ", ayah: 34 },
  { id: 32, surah: "السَّجۡدَةِ", ayah: 30 },
  { id: 33, surah: "الأَحۡزَابِ", ayah: 73 },
  { id: 34, surah: "سَبَإٍ", ayah: 54 },
  { id: 35, surah: "فَاطِرٍ", ayah: 45 },
  { id: 36, surah: "يسٓ", ayah: 83 },
  { id: 37, surah: "الصَّافَّاتِ", ayah: 182 },
  { id: 38, surah: "صٓ", ayah: 88 },
  { id: 39, surah: "الزُّمَرِ", ayah: 75 },
  { id: 40, surah: "غَافِرٍ", ayah: 85 },
  { id: 41, surah: "فُصِّلَتۡ", ayah: 54 },
  { id: 42, surah: "الشُّورَىٰ", ayah: 53 },
  { id: 43, surah: "الزُّخۡرُفِ", ayah: 89 },
  { id: 44, surah: "الدُّخَانِ", ayah: 59 },
  { id: 45, surah: "الجَاثِيَةِ", ayah: 37 },
  { id: 46, surah: "الأَحۡقَافِ", ayah: 35 },
  { id: 47, surah: "مُحَمَّدٍ", ayah: 38 },
  { id: 48, surah: "الفَتۡحِ", ayah: 29 },
  { id: 49, surah: "الحُجُرَاتِ", ayah: 18 },
  { id: 50, surah: "قٓ", ayah: 45 },
  { id: 51, surah: "الذَّارِيَاتِ", ayah: 60 },
  { id: 52, surah: "الطُّورِ", ayah: 49 },
  { id: 53, surah: "النَّجۡمِ", ayah: 62 },
  { id: 54, surah: "القَمَرِ", ayah: 55 },
  { id: 55, surah: "الرَّحۡمَٰن", ayah: 78 },
  { id: 56, surah: "الوَاقِعَةِ", ayah: 96 },
  { id: 57, surah: "الحَدِيدِ", ayah: 29 },
  { id: 58, surah: "المُجَادلَةِ", ayah: 22 },
  { id: 59, surah: "الحَشۡرِ", ayah: 24 },
  { id: 60, surah: "المُمۡتَحنَةِ", ayah: 13 },
  { id: 61, surah: "الصَّفِّ", ayah: 14 },
  { id: 62, surah: "الجُمُعَةِ", ayah: 11 },
  { id: 63, surah: "المُنَافِقُونَ", ayah: 11 },
  { id: 64, surah: "التَّغَابُنِ", ayah: 18 },
  { id: 65, surah: "الطَّلَاقِ", ayah: 12 },
  { id: 66, surah: "التَّحۡرِيمِ", ayah: 12 },
  { id: 67, surah: "المُلۡكِ", ayah: 30 },
  { id: 68, surah: "القَلَمِ", ayah: 52 },
  { id: 69, surah: "الحَاقَّةِ", ayah: 52 },
  { id: 70, surah: "المَعَارِجِ", ayah: 44 },
  { id: 71, surah: "نُوحٍ", ayah: 28 },
  { id: 72, surah: "الجِنِّ", ayah: 28 },
  { id: 73, surah: "المُزَّمِّلِ", ayah: 20 },
  { id: 74, surah: "المُدَّثِّرِ", ayah: 56 },
  { id: 75, surah: "القِيَامَةِ", ayah: 40 },
  { id: 76, surah: "الإِنسَانِ", ayah: 31 },
  { id: 77, surah: "المُرۡسَلَاتِ", ayah: 50 },
  { id: 78, surah: "النَّبَإِ", ayah: 40 },
  { id: 79, surah: "النَّازِعَاتِ", ayah: 46 },
  { id: 80, surah: "عَبَسَ", ayah: 42 },
  { id: 81, surah: "التَّكۡوِيرِ", ayah: 29 },
  { id: 82, surah: "الانفِطَارِ", ayah: 19 },
  { id: 83, surah: "المُطَفِّفِينَ", ayah: 36 },
  { id: 84, surah: "الانشِقَاقِ", ayah: 25 },
  { id: 85, surah: "البُرُوجِ", ayah: 22 },
  { id: 86, surah: "الطَّارِقِ", ayah: 17 },
  { id: 87, surah: "الأَعۡلَىٰ", ayah: 19 },
  { id: 88, surah: "الغَاشِيَةِ", ayah: 26 },
  { id: 89, surah: "الفَجۡرِ", ayah: 30 },
  { id: 90, surah: "البَلَدِ", ayah: 20 },
  { id: 91, surah: "الشَّمۡسِ", ayah: 15 },
  { id: 92, surah: "اللَّيۡلِ", ayah: 21 },
  { id: 93, surah: "الضُّحَىٰ", ayah: 11 },
  { id: 94, surah: "الشَّرۡحِ", ayah: 8 },
  { id: 95, surah: "التِّينِ", ayah: 8 },
  { id: 96, surah: "العَلَقِ", ayah: 19 },
  { id: 97, surah: "القَدۡرِ", ayah: 5 },
  { id: 98, surah: "البَيِّنَةِ", ayah: 8 },
  { id: 99, surah: "الزَّلۡزَلَةِ", ayah: 8 },
  { id: 100, surah: "العَادِيَاتِ", ayah: 11 },
  { id: 101, surah: "القَارِعَةِ", ayah: 11 },
  { id: 102, surah: "التَّكَاثُرِ", ayah: 8 },
  { id: 103, surah: "العَصۡرِ", ayah: 3 },
  { id: 104, surah: "الهُمَزَةِ", ayah: 9 },
  { id: 105, surah: "الفِيلِ", ayah: 5 },
  { id: 106, surah: "قُرَيۡشٍ", ayah: 4 },
  { id: 107, surah: "المَاعُونِ", ayah: 7 },
  { id: 108, surah: "الكَوۡثَرِ", ayah: 3 },
  { id: 109, surah: "الكَافِرُونَ", ayah: 6 },
  { id: 110, surah: "النَّصۡرِ", ayah: 3 },
  { id: 111, surah: "المَسَدِ", ayah: 5 },
  { id: 112, surah: "الإِخۡلَاصِ", ayah: 4 },
  { id: 113, surah: "الفَلَقِ", ayah: 5 },
  { id: 114, surah: "النَّاسِ", ayah: 6 },
];

const isEmptyCell = (cell) => {
  return (
    cell === null ||
    cell === undefined ||
    cell.toString().trim() === "" ||
    cell.replace("_", "").trim() === ""
  );
};

async function fillDataFromCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const levelsPlan = {};
  const months = [];
  const weeks = [];
  const levelsPages = {};
  const levelsSuar = {};
  const levelsAyah = {};
  let currentLevel = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const columns = line.split(",");

    if (line.startsWith("الشهر")) {
      for (let i = 1; i < columns.length; i++) {
        if (!isEmptyCell(columns[i])) {
          months.push(Number(columns[i].replace("شهر", "").trim()));
        } else {
          months.push(months[months.length - 1]);
        }
      }
    } else if (line.startsWith("الأسبوع")) {
      for (let i = 1; i < columns.length; i++) {
        if (!isEmptyCell(columns[i])) {
          weeks.push(Number(columns[i].replace("الأسبوع", "").trim()));
        } else {
          weeks.push(weeks[weeks.length - 1]);
        }
      }
    } else if (line.startsWith("مستوى 1") || line.startsWith("مستوى 3")) {
      if (line.startsWith("مستوى 1")) currentLevel = 1;
      else if (line.startsWith("مستوى 3")) currentLevel = 3;

      for (let i = 1; i < columns.length; i++) {
        if (!levelsPages[currentLevel]) {
          levelsPages[currentLevel] = [];
        }

        if (!isEmptyCell(columns[i])) {
          const page = Number(columns[i].trim());
          levelsPages[currentLevel].push(page);
        } else {
          const lastPage =
            levelsPages[currentLevel][levelsPages[currentLevel].length - 1];
          levelsPages[currentLevel].push(lastPage);
        }
      }
    } else if (line.startsWith("مستوى 2")) {
      currentLevel = 2;
      if (line.includes("بداية الآية")) {
        continue;
      }
    } else if (line.startsWith("مستوى جزء عم")) {
      currentLevel = 0;
      for (let i = 1; i < columns.length; i++) {
        if (!levelsSuar[currentLevel]) {
          levelsSuar[currentLevel] = [];
        }

        if (!isEmptyCell(columns[i])) {
          const suar = columns[i]
            .trim()
            .split("+")
            .map((s) => s.replace("سورة", "").trim());
          levelsSuar[currentLevel].push(suar);
        }
      }
    } else if (!columns[0].trim() && currentLevel === 2 && columns.length > 1) {
      if (!levelsSuar[currentLevel]) {
        levelsSuar[currentLevel] = [];
      }

      if (!levelsAyah[currentLevel]) {
        levelsAyah[currentLevel] = [];
      }

      if (/\d/.test(columns[1])) {
        for (let i = 1; i < columns.length; i++) {
          if (columns[i].trim()) {
            const ayah = Number(columns[i].split("-")[0].trim());
            levelsAyah[currentLevel].push(ayah);
          } else {
            const lastAyah =
              levelsAyah[currentLevel][levelsAyah[currentLevel].length - 1];
            levelsAyah[currentLevel].push(lastAyah);
          }
        }
      } else if (columns[1].trim()) {
        for (let i = 1; i < columns.length; i++) {
          if (columns[i].trim()) {
            const suar = columns[i]
              .trim()
              .split("+")
              .map((s) => s.replace("سورة", "").trim());

            levelsSuar[currentLevel].push(...suar);
          } else {
            const lastSurah =
              levelsSuar[currentLevel][levelsSuar[currentLevel].length - 1];
            levelsSuar[currentLevel].push(lastSurah);
          }
        }
      }
    }
  }

  console.log("level 2:");
  const linesOutput = [[], [], [], [], []];
  for (let i = 0; i < levelsSuar[2].length; i += 2) {
    const fromAyah = levelsAyah[2][i];
    const toAyah = levelsAyah[2][i + 1];
    const fromSurah = levelsSuar[2][i];
    const toSurah = levelsSuar[2][i + 1];

    // console.log(
    //   `From: ${fromSurah} Ayah ${fromAyah} - To: ${toSurah} Ayah ${toAyah}`
    // );
    // 4 meetings in month, and 2 for from & to
    const monthIndex = Math.floor(i / 8);
    // 1 meetings in week, 2 for from & to
    const weekIndex = Math.floor((i - monthIndex * 8) / 2);
    linesOutput[0].push(`شهر ${monthIndex + 1}`);
    linesOutput[0].push(`شهر ${monthIndex + 1}`);
    linesOutput[1].push(`الأسبوع ${weekIndex + 1}`);
    linesOutput[1].push(`الأسبوع ${weekIndex + 1}`);
    linesOutput[2].push("من");
    linesOutput[2].push("إلى");

    linesOutput[3].push(fromAyah);
    linesOutput[3].push(toAyah);
    linesOutput[4].push(fromSurah);
    linesOutput[4].push(toSurah);
  }

  fs.writeFileSync(
    "output.txt",
    linesOutput.map((l) => l.join(",")).join("\n"),
    "utf8"
  );
  console.log("==========================");
}

fillDataFromCsv(
  "C:\\Users\\hp\\Downloads\\معلومات المراجعة للمستويات - Sheet1.csv"
);

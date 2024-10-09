const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const charMapEnToAr = {
  ".": ",",
};

export const translateNumberToArabic = (number) => {
  return number
    .toString()
    .split("")
    .map((number) => arabicNumbers[number] ?? charMapEnToAr[number] ?? number)
    .join("");
};

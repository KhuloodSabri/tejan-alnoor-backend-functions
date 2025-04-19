export const normalizeString = (name) => {
  let result = name;
  result = result.replaceAll("أ", "ا");
  result = result.replaceAll("ى", "ا");
  result = result.replaceAll("آ", "ا");
  result = result.replaceAll("إ", "ا");
  result = result.replaceAll("ي ", "ا ");
  result = result.replaceAll("ؤ", "و");
  result = result.replaceAll("ة", "ه");
  result = result.replaceAll("ئ", "ي");
  result = result.replaceAll(" ", "");

  return result;
};

export const compareSemesters = (semester1, semester2) => {
  if (semester1.year < semester2.year) {
    return -1;
  }

  if (semester1.year > semester2.year) {
    return 1;
  }

  if (semester1.semester < semester2.semester) {
    return -1;
  }

  if (semester1.semester > semester2.semester) {
    return 1;
  }

  if (semester1.month < semester2.month) {
    return -1;
  }

  if (semester1.month > semester2.month) {
    return 1;
  }

  return 0;
};

export const getLevelMemorizingDirection = (levelID) => {
  if (levelID === 0) {
    return "desc";
  }
  return "asc";
};

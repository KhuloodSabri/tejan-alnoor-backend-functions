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

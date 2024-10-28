export const normalizeString = (name) => {
  let result = name;
  result = result.replace("أ", "ا");
  result = result.replace("ى", "ا");
  result = result.replace("آ", "ا");
  result = result.replace("إ", "ا");
  result = result.replace("ي ", "ا ");
  result = result.replace("ؤ", "و");
  result = result.replace("ة", "ه");
  result = result.replace("ئ", "ي");
  result = result.replace(" ", "");

  return result;
};

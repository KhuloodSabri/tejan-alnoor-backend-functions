import readline from "readline";

export async function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

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

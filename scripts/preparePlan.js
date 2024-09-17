const level1Plan = [
  [2, 4],
  [5, 6],
  [2, 4],
  [5, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
  [33, 34],
  [35, 36],
  [37, 38],
  [39, 40],
  [41, 42],
  [43, 44],
  [45, 46],
  [47, 48],
  [49, 50],
  [51, 52],
  [53, 54],
  [55, 56],
  [57, 58],
  [59, 60],
  [61, 62],
];

const level3Plan = [
  [2, 6],
  [7, 10],
  [2, 6],
  [7, 10],

  [11, 14],
  [15, 18],
  [19, 22],
  [23, 26],

  [27, 30],
  [31, 34],
  [35, 38],
  [39, 49],

  [50, 53],
  [54, 57],
  [58, 61],
  [62, 65],
  [66, 69],
  [70, 73],
  [74, 76],
];

const levelAmmaPlan = [
  [87, 176],
  [177, 259],
  [260, 351],
  [352, 426],
  [427, 485],
  [486, 540],
  [536, 564],
];

const level2Plan = [
  // baqara
  [9, 37],
  [38, 65],
  [66, 84],
  [85, 101],

  [102, 120],
  [121, 142],
  [143, 161],
  [162, 184],

  [125, 198],
  [27, 218],
  [229, 232],
  [233, 245],

  [246, 260],
  [261, 272],
  [273, 289],
  [290, 294],

  // imran
  [295, 316],
  [317, 339],
  [340, 364],
  [364, 364], // empty week in plan for some reason

  [365, 385],
  [386, 409],
  [410, 434],
  [435, 451],

  [452, 474],
  [475, 494],

  // nisa
  [495, 508],
  [509, 520],
];

const level1Object = {
  levelID: {
    N: "1",
  },
  levelName: {
    S: "مستوى 1",
  },
  progressUnit: {
    S: "page",
  },
  weeksPlan: {
    L: [],
  },
};

const level2Object = {
  levelID: {
    N: "2",
  },
  levelName: {
    S: "مستوى 2",
  },
  progressUnit: {
    S: "ayah",
  },
  weeksPlan: {
    L: [],
  },
};

const level3Object = {
  levelID: {
    N: "3",
  },
  levelName: {
    S: "مستوى 3",
  },
  progressUnit: {
    S: "page",
  },
  weeksPlan: {
    L: [],
  },
};

const levelAmmaObject = {
  levelID: {
    N: "0",
  },
  levelName: {
    S: "مستوى جزء عم",
  },
  progressUnit: {
    S: "ayah",
  },
  weeksPlan: {
    L: [],
  },
};

level1Plan.forEach((plan) => {
  level1Object.weeksPlan.L.push({
    L: [{ N: plan[0].toString() }, { N: plan[1].toString() }],
  });
});

level2Plan.forEach((plan) => {
  level2Object.weeksPlan.L.push({
    L: [{ N: plan[0].toString() }, { N: plan[1].toString() }],
  });
});

level3Plan.forEach((plan) => {
  level3Object.weeksPlan.L.push({
    L: [{ N: plan[0].toString() }, { N: plan[1].toString() }],
  });
});

levelAmmaPlan.forEach((plan) => {
  levelAmmaObject.weeksPlan.L.push({
    L: [{ N: plan[0].toString() }, { N: plan[1].toString() }],
  });
});

// console.log(JSON.stringify(level1Object, null, 2));
// console.log(JSON.stringify(level2Object, null, 2));
// console.log(JSON.stringify(level3Object, null, 2));
// console.log(JSON.stringify(levelAmmaObject, null, 2));

import fs from "fs";
import csv from "csv-parser";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import FuzzySearch from "fuzzy-search";
import { normalizeString } from "./utils.mjs";

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

// cached map built by using the api
// https://alquran.cloud/api
export const pageToAyahMap = {
  1: [1, 7],
  2: [8, 12],
  3: [13, 23],
  4: [24, 31],
  5: [32, 36],
  6: [37, 44],
  7: [45, 55],
  8: [56, 64],
  9: [65, 68],
  10: [69, 76],
  11: [77, 83],
  12: [84, 90],
  13: [91, 95],
  14: [96, 100],
  15: [101, 108],
  16: [109, 112],
  17: [113, 119],
  18: [120, 126],
  19: [127, 133],
  20: [134, 141],
  21: [142, 148],
  22: [149, 152],
  23: [153, 160],
  24: [161, 170],
  25: [171, 176],
  26: [177, 183],
  27: [184, 188],
  28: [189, 193],
  29: [194, 197],
  30: [198, 203],
  31: [204, 209],
  32: [210, 217],
  33: [218, 222],
  34: [223, 226],
  35: [227, 231],
  36: [232, 237],
  37: [238, 240],
  38: [241, 244],
  39: [245, 252],
  40: [253, 255],
  41: [256, 259],
  42: [260, 263],
  43: [264, 266],
  44: [267, 271],
  45: [272, 276],
  46: [277, 281],
  47: [282, 288],
  48: [289, 289],
  49: [290, 293],
  50: [294, 302],
  51: [303, 308],
  52: [309, 315],
  53: [316, 322],
  54: [323, 330],
  55: [331, 338],
  56: [339, 345],
  57: [346, 354],
  58: [355, 363],
  59: [364, 370],
  60: [371, 376],
  61: [377, 384],
  62: [385, 393],
  63: [394, 401],
  64: [402, 408],
  65: [409, 414],
  66: [415, 425],
  67: [426, 433],
  68: [434, 441],
  69: [442, 446],
  70: [447, 450],
  71: [451, 458],
  72: [459, 466],
  73: [467, 473],
  74: [474, 479],
  75: [480, 487],
  76: [488, 493],
  77: [494, 499],
  78: [500, 504],
  79: [505, 507],
  80: [508, 512],
  81: [513, 516],
  82: [517, 519],
  83: [520, 526],
  84: [527, 530],
  85: [531, 537],
  86: [538, 544],
  87: [545, 552],
  88: [553, 558],
  89: [559, 567],
  90: [568, 572],
  91: [573, 579],
  92: [580, 584],
  93: [585, 587],
  94: [588, 594],
  95: [595, 598],
  96: [599, 606],
  97: [607, 614],
  98: [615, 620],
  99: [621, 627],
  100: [628, 633],
  101: [634, 640],
  102: [641, 647],
  103: [648, 655],
  104: [656, 663],
  105: [664, 668],
  106: [669, 671],
  107: [672, 674],
  108: [675, 678],
  109: [679, 682],
  110: [683, 686],
  111: [687, 692],
  112: [693, 700],
  113: [701, 705],
  114: [706, 710],
  115: [711, 714],
  116: [715, 719],
  117: [720, 726],
  118: [727, 733],
  119: [734, 739],
  120: [740, 745],
  121: [746, 751],
  122: [752, 758],
  123: [759, 764],
  124: [765, 772],
  125: [773, 777],
  126: [778, 782],
  127: [783, 789],
  128: [790, 797],
  129: [798, 807],
  130: [808, 816],
  131: [817, 824],
  132: [825, 833],
  133: [834, 841],
  134: [842, 848],
  135: [849, 857],
  136: [858, 862],
  137: [863, 870],
  138: [871, 879],
  139: [880, 883],
  140: [884, 890],
  141: [891, 899],
  142: [900, 907],
  143: [908, 913],
  144: [914, 920],
  145: [921, 926],
  146: [927, 931],
  147: [932, 935],
  148: [936, 940],
  149: [941, 946],
  150: [947, 954],
  151: [955, 965],
  152: [966, 976],
  153: [977, 984],
  154: [985, 991],
  155: [992, 997],
  156: [998, 1005],
  157: [1006, 1011],
  158: [1012, 1021],
  159: [1022, 1027],
  160: [1028, 1035],
  161: [1036, 1041],
  162: [1042, 1049],
  163: [1050, 1058],
  164: [1059, 1074],
  165: [1075, 1084],
  166: [1085, 1091],
  167: [1092, 1097],
  168: [1098, 1103],
  169: [1104, 1109],
  170: [1110, 1113],
  171: [1114, 1117],
  172: [1118, 1124],
  173: [1125, 1132],
  174: [1133, 1141],
  175: [1142, 1149],
  176: [1150, 1160],
  177: [1161, 1168],
  178: [1169, 1176],
  179: [1177, 1185],
  180: [1186, 1193],
  181: [1194, 1200],
  182: [1201, 1205],
  183: [1206, 1212],
  184: [1213, 1221],
  185: [1222, 1229],
  186: [1230, 1235],
  187: [1236, 1241],
  188: [1242, 1248],
  189: [1249, 1255],
  190: [1256, 1261],
  191: [1262, 1266],
  192: [1267, 1271],
  193: [1272, 1275],
  194: [1276, 1282],
  195: [1283, 1289],
  196: [1290, 1296],
  197: [1297, 1303],
  198: [1304, 1307],
  199: [1308, 1314],
  200: [1315, 1321],
  201: [1322, 1328],
  202: [1329, 1334],
  203: [1335, 1341],
  204: [1342, 1346],
  205: [1347, 1352],
  206: [1353, 1357],
  207: [1358, 1364],
  208: [1365, 1370],
  209: [1371, 1378],
  210: [1379, 1384],
  211: [1385, 1389],
  212: [1390, 1397],
  213: [1398, 1406],
  214: [1407, 1417],
  215: [1418, 1425],
  216: [1426, 1434],
  217: [1435, 1442],
  218: [1443, 1452],
  219: [1453, 1461],
  220: [1462, 1470],
  221: [1471, 1478],
  222: [1479, 1485],
  223: [1486, 1492],
  224: [1493, 1501],
  225: [1502, 1510],
  226: [1511, 1518],
  227: [1519, 1526],
  228: [1527, 1535],
  229: [1536, 1544],
  230: [1545, 1554],
  231: [1555, 1561],
  232: [1562, 1570],
  233: [1571, 1581],
  234: [1582, 1590],
  235: [1591, 1600],
  236: [1601, 1610],
  237: [1611, 1618],
  238: [1619, 1626],
  239: [1627, 1633],
  240: [1634, 1639],
  241: [1640, 1648],
  242: [1649, 1659],
  243: [1660, 1665],
  244: [1666, 1674],
  245: [1675, 1682],
  246: [1683, 1691],
  247: [1692, 1699],
  248: [1700, 1707],
  249: [1708, 1712],
  250: [1713, 1720],
  251: [1721, 1725],
  252: [1726, 1735],
  253: [1736, 1741],
  254: [1742, 1749],
  255: [1750, 1755],
  256: [1756, 1760],
  257: [1761, 1768],
  258: [1769, 1774],
  259: [1775, 1783],
  260: [1784, 1792],
  261: [1793, 1802],
  262: [1803, 1817],
  263: [1818, 1833],
  264: [1834, 1853],
  265: [1854, 1872],
  266: [1873, 1892],
  267: [1893, 1907],
  268: [1908, 1915],
  269: [1916, 1927],
  270: [1928, 1935],
  271: [1936, 1943],
  272: [1944, 1955],
  273: [1956, 1965],
  274: [1966, 1973],
  275: [1974, 1980],
  276: [1981, 1988],
  277: [1989, 1994],
  278: [1995, 2003],
  279: [2004, 2011],
  280: [2012, 2019],
  281: [2020, 2029],
  282: [2030, 2036],
  283: [2037, 2046],
  284: [2047, 2056],
  285: [2057, 2067],
  286: [2068, 2078],
  287: [2079, 2087],
  288: [2088, 2095],
  289: [2096, 2104],
  290: [2105, 2115],
  291: [2116, 2125],
  292: [2126, 2133],
  293: [2134, 2144],
  294: [2145, 2155],
  295: [2156, 2160],
  296: [2161, 2167],
  297: [2168, 2174],
  298: [2175, 2185],
  299: [2186, 2193],
  300: [2194, 2201],
  301: [2202, 2214],
  302: [2215, 2223],
  303: [2224, 2237],
  304: [2238, 2250],
  305: [2251, 2261],
  306: [2262, 2275],
  307: [2276, 2288],
  308: [2289, 2301],
  309: [2302, 2314],
  310: [2315, 2326],
  311: [2327, 2345],
  312: [2346, 2360],
  313: [2361, 2385],
  314: [2386, 2399],
  315: [2400, 2412],
  316: [2413, 2424],
  317: [2425, 2435],
  318: [2436, 2446],
  319: [2447, 2461],
  320: [2462, 2473],
  321: [2474, 2483],
  322: [2484, 2493],
  323: [2494, 2507],
  324: [2508, 2518],
  325: [2519, 2527],
  326: [2528, 2540],
  327: [2541, 2555],
  328: [2556, 2564],
  329: [2565, 2573],
  330: [2574, 2584],
  331: [2585, 2595],
  332: [2596, 2600],
  333: [2601, 2610],
  334: [2611, 2618],
  335: [2619, 2625],
  336: [2626, 2633],
  337: [2634, 2641],
  338: [2642, 2650],
  339: [2651, 2659],
  340: [2660, 2667],
  341: [2668, 2673],
  342: [2674, 2690],
  343: [2691, 2700],
  344: [2701, 2715],
  345: [2716, 2732],
  346: [2733, 2747],
  347: [2748, 2762],
  348: [2763, 2777],
  349: [2778, 2791],
  350: [2792, 2801],
  351: [2802, 2811],
  352: [2812, 2818],
  353: [2819, 2822],
  354: [2823, 2827],
  355: [2828, 2834],
  356: [2835, 2844],
  357: [2845, 2849],
  358: [2850, 2852],
  359: [2853, 2857],
  360: [2858, 2866],
  361: [2867, 2875],
  362: [2876, 2887],
  363: [2888, 2898],
  364: [2899, 2910],
  365: [2911, 2922],
  366: [2923, 2932],
  367: [2933, 2951],
  368: [2952, 2971],
  369: [2972, 2992],
  370: [2993, 3015],
  371: [3016, 3043],
  372: [3044, 3068],
  373: [3069, 3091],
  374: [3092, 3115],
  375: [3116, 3138],
  376: [3139, 3159],
  377: [3160, 3172],
  378: [3173, 3181],
  379: [3182, 3194],
  380: [3195, 3203],
  381: [3204, 3214],
  382: [3215, 3222],
  383: [3223, 3235],
  384: [3236, 3247],
  385: [3248, 3257],
  386: [3258, 3265],
  387: [3266, 3273],
  388: [3274, 3280],
  389: [3281, 3287],
  390: [3288, 3295],
  391: [3296, 3302],
  392: [3303, 3311],
  393: [3312, 3322],
  394: [3323, 3329],
  395: [3330, 3336],
  396: [3337, 3346],
  397: [3347, 3354],
  398: [3355, 3363],
  399: [3364, 3370],
  400: [3371, 3378],
  401: [3379, 3385],
  402: [3386, 3392],
  403: [3393, 3403],
  404: [3404, 3414],
  405: [3415, 3424],
  406: [3425, 3433],
  407: [3434, 3441],
  408: [3442, 3450],
  409: [3451, 3459],
  410: [3460, 3469],
  411: [3470, 3480],
  412: [3481, 3488],
  413: [3489, 3497],
  414: [3498, 3503],
  415: [3504, 3514],
  416: [3515, 3523],
  417: [3524, 3533],
  418: [3534, 3539],
  419: [3540, 3548],
  420: [3549, 3555],
  421: [3556, 3563],
  422: [3564, 3568],
  423: [3569, 3576],
  424: [3577, 3583],
  425: [3584, 3587],
  426: [3588, 3595],
  427: [3596, 3606],
  428: [3607, 3613],
  429: [3614, 3620],
  430: [3621, 3628],
  431: [3629, 3637],
  432: [3638, 3645],
  433: [3646, 3654],
  434: [3655, 3663],
  435: [3664, 3671],
  436: [3672, 3678],
  437: [3679, 3690],
  438: [3691, 3698],
  439: [3699, 3704],
  440: [3705, 3717],
  441: [3718, 3732],
  442: [3733, 3745],
  443: [3746, 3759],
  444: [3760, 3775],
  445: [3776, 3788],
  446: [3789, 3812],
  447: [3813, 3839],
  448: [3840, 3864],
  449: [3865, 3890],
  450: [3891, 3914],
  451: [3915, 3941],
  452: [3942, 3970],
  453: [3971, 3986],
  454: [3987, 3996],
  455: [3997, 4012],
  456: [4013, 4031],
  457: [4032, 4053],
  458: [4054, 4063],
  459: [4064, 4068],
  460: [4069, 4079],
  461: [4080, 4089],
  462: [4090, 4098],
  463: [4099, 4105],
  464: [4106, 4114],
  465: [4115, 4125],
  466: [4126, 4132],
  467: [4133, 4140],
  468: [4141, 4149],
  469: [4150, 4158],
  470: [4159, 4166],
  471: [4167, 4173],
  472: [4174, 4182],
  473: [4183, 4191],
  474: [4192, 4199],
  475: [4200, 4210],
  476: [4211, 4218],
  477: [4219, 4229],
  478: [4230, 4238],
  479: [4239, 4247],
  480: [4248, 4256],
  481: [4257, 4264],
  482: [4265, 4272],
  483: [4273, 4282],
  484: [4283, 4287],
  485: [4288, 4294],
  486: [4295, 4303],
  487: [4304, 4316],
  488: [4317, 4323],
  489: [4324, 4335],
  490: [4336, 4347],
  491: [4348, 4358],
  492: [4359, 4372],
  493: [4373, 4385],
  494: [4386, 4398],
  495: [4399, 4414],
  496: [4415, 4432],
  497: [4433, 4453],
  498: [4454, 4473],
  499: [4474, 4486],
  500: [4487, 4495],
  501: [4496, 4505],
  502: [4506, 4515],
  503: [4516, 4524],
  504: [4525, 4530],
  505: [4531, 4538],
  506: [4539, 4545],
  507: [4546, 4556],
  508: [4557, 4564],
  509: [4565, 4574],
  510: [4575, 4583],
  511: [4584, 4592],
  512: [4593, 4598],
  513: [4599, 4606],
  514: [4607, 4611],
  515: [4612, 4616],
  516: [4617, 4623],
  517: [4624, 4630],
  518: [4631, 4645],
  519: [4646, 4665],
  520: [4666, 4681],
  521: [4682, 4705],
  522: [4706, 4726],
  523: [4727, 4749],
  524: [4750, 4766],
  525: [4767, 4784],
  526: [4785, 4810],
  527: [4811, 4828],
  528: [4829, 4852],
  529: [4853, 4873],
  530: [4874, 4895],
  531: [4896, 4917],
  532: [4918, 4941],
  533: [4942, 4968],
  534: [4969, 4995],
  535: [4996, 5029],
  536: [5030, 5055],
  537: [5056, 5078],
  538: [5079, 5086],
  539: [5087, 5093],
  540: [5094, 5099],
  541: [5100, 5104],
  542: [5105, 5110],
  543: [5111, 5115],
  544: [5116, 5125],
  545: [5126, 5129],
  546: [5130, 5135],
  547: [5136, 5142],
  548: [5143, 5150],
  549: [5151, 5155],
  550: [5156, 5161],
  551: [5162, 5168],
  552: [5169, 5177],
  553: [5178, 5185],
  554: [5186, 5192],
  555: [5193, 5199],
  556: [5200, 5208],
  557: [5209, 5217],
  558: [5218, 5222],
  559: [5223, 5229],
  560: [5230, 5236],
  561: [5237, 5241],
  562: [5242, 5253],
  563: [5254, 5267],
  564: [5268, 5286],
  565: [5287, 5313],
  566: [5314, 5331],
  567: [5332, 5357],
  568: [5358, 5385],
  569: [5386, 5414],
  570: [5415, 5429],
  571: [5430, 5447],
  572: [5448, 5460],
  573: [5461, 5475],
  574: [5476, 5494],
  575: [5495, 5512],
  576: [5513, 5542],
  577: [5543, 5570],
  578: [5571, 5596],
  579: [5597, 5616],
  580: [5617, 5641],
  581: [5642, 5672],
  582: [5673, 5702],
  583: [5703, 5727],
  584: [5728, 5758],
  585: [5759, 5800],
  586: [5801, 5829],
  587: [5830, 5854],
  588: [5855, 5882],
  589: [5883, 5909],
  590: [5910, 5931],
  591: [5932, 5963],
  592: [5964, 5993],
  593: [5994, 6016],
  594: [6017, 6043],
  595: [6044, 6072],
  596: [6073, 6098],
  597: [6099, 6125],
  598: [6126, 6137],
  599: [6138, 6155],
  600: [6156, 6176],
  601: [6177, 6193],
  602: [6194, 6207],
  603: [6208, 6221],
  604: [6222, 6236],
};

export const commulativeSuar = suar.reduce((acc, item) => {
  return [
    ...acc,
    {
      ...item,
      normalizedSurah: normalizeString(item.surah),
      commulativeOffset:
        acc.length > 0
          ? acc[acc.length - 1].commulativeOffset + acc[acc.length - 1].ayah
          : 0,
    },
  ];
}, []);

const searchSurah = (surahName) => {
  const searcher = new FuzzySearch(
    commulativeSuar,
    ["surah", "normalizedSurah"],
    {
      caseSensitive: false,
    }
  );

  let searchResult = searcher.search(surahName);

  if (searchResult.length === 0) {
    searchResult = searcher.search(normalizeString(surahName));
  }

  if (searchResult.length === 0) {
    throw new Error(`Surah ${surahName} not found`);
  }

  return searchResult[0];
};

const getPagesForSurah = (surahName) => {
  const surah = searchSurah(surahName);

  const startEntry = Object.entries(pageToAyahMap).find(
    ([_page, ayahRange]) => {
      if (
        surah.commulativeOffset + 1 >= ayahRange[0] &&
        surah.commulativeOffset + 1 <= ayahRange[1]
      ) {
        return true;
      }

      return false;
    }
  );

  if (!startEntry) {
    throw new Error(`Surah ${surahName} not found in pageToAyahMap`);
  }

  const endCommulativeOffset = surah.commulativeOffset + surah.ayah;

  const endEntry = Object.entries(pageToAyahMap).find(([_page, ayahRange]) => {
    if (
      endCommulativeOffset >= ayahRange[0] &&
      endCommulativeOffset <= ayahRange[1]
    ) {
      return true;
    }

    return false;
  });

  if (!endEntry) {
    throw Error(`Surah ${surahName} not found in pageToAyahMap`);
  }

  return [Number(startEntry[0]), Number(endEntry[0])];
};

/**
 * Build a map of { [index]: page_range } from level4.json and save it to a file.
 *
 * @param {string} [inputPath] - Optional input path for level4.json. Defaults to ./level4.json.
 * @param {string} [outputFileName] - Optional output file name. Defaults to level4weeklycitation.json in this directory.
 * @returns {Record<string, number[]>} The generated map.
 */
export function writeLevel4WeeklyCitation(
  inputPath,
  outputFileName = "level4weeklycitation.json"
) {
  const fullPath = resolveLocalPath(inputPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("Expected an array in level4.json");
  }
  const mapp = {};
  data.forEach((item) => {
    if (typeof item?.index !== "number" || !Array.isArray(item?.page_range)) {
      throw new Error(
        "Invalid item shape in level4.json: expected { index: number, page_range: number[] }"
      );
    }
    mapp[String(item.index)] = item.page_range;
  });
  const outPath = path.resolve(__dirname, outputFileName);
  fs.writeFileSync(outPath, JSON.stringify(mapp, null, 2), "utf8");
  return mapp;
}

const isEmptyCell = (cell) => {
  return (
    cell === null ||
    cell === undefined ||
    cell.toString().trim() === "" ||
    cell.replace(/_/g, "").trim() === "" ||
    cell.replace(/-/g, "").trim() === "" ||
    cell.includes("استدراك")
  );
};

async function fillDataFromCsv(filePath) {
  // const content = fs.readFileSync(filePath, "utf8");
  // const lines = content.split(/\r?\n/);
  const content = fs.readFileSync(filePath, "utf8");

  const records = parse(content, {
    columns: false, // true if you have headers
    skip_empty_lines: true, // ignore blank lines
    trim: true,
  });

  const levelsPlan = {};
  const months = [];
  const weeks = [];
  const levelsPages = {};
  const levelsSuar = {};
  const levelsAyah = {};
  let currentLevel = null;

  for (const columns of records) {
    if (!columns.length) {
      continue;
    }

    if (!columns.some((column) => !!column.trim())) {
      continue;
    }

    const firstColumn = columns[0].trim();

    if (firstColumn.startsWith("الشهر")) {
      for (let i = 1; i < columns.length; i++) {
        if (!isEmptyCell(columns[i])) {
          months.push(Number(columns[i].replace("شهر", "").trim()));
        } else {
          months.push(months[months.length - 1]);
        }
      }
    } else if (firstColumn.startsWith("الأسبوع")) {
      for (let i = 1; i < columns.length; i++) {
        if (!isEmptyCell(columns[i])) {
          weeks.push(Number(columns[i].replace("الأسبوع", "").trim()));
        } else {
          weeks.push(weeks[weeks.length - 1]);
        }
      }
    } else if (
      firstColumn.startsWith("مستوى 1") ||
      firstColumn.startsWith("مستوى 3")
    ) {
      if (firstColumn.startsWith("مستوى 1")) currentLevel = 1;
      else if (firstColumn.startsWith("مستوى 3")) currentLevel = 3;
      let skipNext = 0;
      for (let i = 1; i < columns.length; i++) {
        if (!levelsPages[currentLevel]) {
          levelsPages[currentLevel] = [];
        }

        if (!isEmptyCell(columns[i])) {
          const page = Number(columns[i].trim());

          if (isNaN(page)) {
            const suar = columns[i]
              .trim()
              .split(/[+-]/)
              .map((s) => s.replace("سورة", "").trim())
              .map((surahName) => getPagesForSurah(surahName));

            levelsPages[currentLevel].push(suar[0][0]);
            levelsPages[currentLevel].push(suar[suar.length - 1][1]);
            skipNext = suar.length * 2 - 1;
          } else {
            levelsPages[currentLevel].push(page);
            skipNext = 0;
          }
        } else {
          if (skipNext > 0) {
            skipNext--;
          } else {
            const lastPage =
              levelsPages[currentLevel][levelsPages[currentLevel].length - 1];
            levelsPages[currentLevel].push(lastPage);
          }
        }
      }
    } else if (firstColumn.startsWith("مستوى 2")) {
      currentLevel = 2;
      if (firstColumn.includes("بداية الآية")) {
        continue;
      }
    } else if (firstColumn.startsWith("مستوى جزء عم")) {
      currentLevel = 0;
      for (let i = 1; i < columns.length; i++) {
        if (!levelsSuar[currentLevel]) {
          levelsSuar[currentLevel] = [];
        }

        if (!isEmptyCell(columns[i])) {
          const suar = columns[i]
            .trim()
            .split(/[+-]/)
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
          if (columns[i].trim() && !columns[i].includes("استدراك")) {
            const ayah = Number(columns[i].split("-")[0].trim());
            levelsAyah[currentLevel].push(ayah);
          } else {
            const lastAyah =
              levelsAyah[currentLevel][levelsAyah[currentLevel].length - 1];
            levelsAyah[currentLevel].push(lastAyah);
          }
        }
      } else if (columns[1].trim()) {
        let skipNext = 0;
        for (let i = 1; i < columns.length; i++) {
          if (columns[i].trim()) {
            const suar = columns[i]
              .trim()
              .split("+")
              .map((s) => s.replace("سورة", "").trim());

            skipNext = suar.length - 1;
            levelsSuar[currentLevel].push(suar[0]);
            levelsSuar[currentLevel].push(suar[1]);
          } else {
            if (skipNext > 0) {
              skipNext--;
            } else {
              const lastSurah =
                levelsSuar[currentLevel][levelsSuar[currentLevel].length - 1];
              levelsSuar[currentLevel].push(lastSurah);
            }
          }
        }
      }
    }
  }

  console.log("level 1:");
  let linesOutput = [[], [], [], [], []];
  for (let i = 0; i < levelsPages[1].length; i += 2) {
    const fromPage = levelsPages[1][i];
    const toPage = levelsPages[1][i + 1];

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

    linesOutput[3].push(fromPage);
    linesOutput[3].push(toPage);
  }

  fs.writeFileSync(
    "output1.txt",
    linesOutput.map((l) => l.join(",")).join("\n"),
    "utf8"
  );

  console.log("==========================");
  console.log("level 2:");
  linesOutput = [[], [], [], [], []];
  for (let i = 0; i < levelsSuar[2].length; i += 2) {
    const fromAyah = levelsAyah[2][i];
    const toAyah = levelsAyah[2][i + 1];
    const fromSurah = levelsSuar[2][i];
    const toSurah = levelsSuar[2][i + 1];

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
    "output2.txt",
    linesOutput.map((l) => l.join(",")).join("\n"),
    "utf8"
  );
  console.log("==========================");
}

// https://docs.google.com/spreadsheets/d/16uNQmtkbshvB5Irx4jFUbOeb8YVnbDjSMVqkIfgneis/edit?usp=sharing
fillDataFromCsv(
  "C:\\Users\\hp\\Downloads\\معلومات المراجعة للمستويات - Sheet1.csv"
);

// // Example:
// // Generate and save the weekly citation map next to this script:
// writeLevel4WeeklyCitation(
//   "../scripts/level4.json",
//   "level4weeklycitation.json"
// );

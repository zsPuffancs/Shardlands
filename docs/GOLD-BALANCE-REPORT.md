# Monster gold rebalance — production formula report

Historical monster baseline: `9d3866c7f7405c0ef07657997913266becf16617`. All OLD gold ranges/multipliers come from the actual historical monster spawner. The unchanged legacy/founding calculation in `gold-rewards.js` evaluates those values; regression cases lock it against the original formula. NEW uses the same production module as loot payouts. No character balances, prices, world saves or region descriptors are modified.

Assumptions: equal-level reference archer with a rare +0 weapon at the midpoint of real damage stat ranges and level-budgeted Might/Haste/Precision/Brutality passives. Actual player damage, crit and auto-attack timing formulas are reused from the XP simulator. Solo monster HP uses the actual spawner with monsterHp=1.6. Active uptime is normal 85%, Alpha 80%, stone 65%, boss 60%, World Boss 55%. No skill burst, AoE, travel, deaths, competition, gear selling or guardian-gold income is modeled. These are explicit reference assumptions, not observed kill times. OLD and NEW use identical kill times and combat/XP data.

NEW averages use 8192 deterministic stratified samples of the real ±20% continuous roll after integer rounding. OLD founding-model averages enumerate every integer value of the real inclusive gold range. Displayed values are gold-rate 1 with zero Gold Find unless stated otherwise. Low-level frontier rows are mathematical scaling probes; natural frontier generation begins after the founding regions.

## Generated frontier rewards

| Level | Category | OLD average | NEW average | OLD gold/hour | NEW gold/hour | Seconds/kill |
|---:|---|---:|---:|---:|---:|---:|
| 1 | normal | 3.238 | 7.03 | 68,351.698 | 148,377.633 | 0.171 |
| 1 | alpha | 16.291 | 28.175 | 61,645.49 | 106,613.052 | 0.951 |
| 1 | stone | 57.267 | 56.33 | 3,664.475 | 3,604.485 | 56.26 |
| 1 | boss | 64.55 | 563.334 | 14,195.756 | 123,888.29 | 16.37 |
| 1 | worldBoss | 64.55 | 1,690 | 4,337.592 | 113,564.183 | 53.573 |
| 10 | normal | 103.047 | 11.93 | 132,894.472 | 15,385.572 | 2.791 |
| 10 | alpha | 515.244 | 47.666 | 125,155.079 | 11,578.32 | 14.821 |
| 10 | stone | 1,811.045 | 95.332 | 23,264.189 | 1,224.609 | 280.249 |
| 10 | boss | 2,041.242 | 953.333 | 28,479.184 | 13,300.807 | 258.03 |
| 10 | worldBoss | 2,041.242 | 2,860 | 8,701.973 | 12,192.404 | 844.46 |
| 50 | normal | 1,152.12 | 33.581 | 940,256.767 | 27,405.543 | 4.411 |
| 50 | alpha | 5,760.598 | 134.335 | 884,896.891 | 20,635.48 | 23.436 |
| 50 | stone | 20,248.097 | 268.666 | 367,764.465 | 4,879.758 | 198.206 |
| 50 | boss | 22,821.773 | 2,686.667 | 201,332.083 | 23,701.586 | 408.074 |
| 50 | worldBoss | 22,821.773 | 8,060 | 61,518.181 | 21,726.469 | 1,335.514 |
| 100 | normal | 3,258.685 | 60.67 | 2,781,193.754 | 51,780.451 | 4.218 |
| 100 | alpha | 16,293.429 | 242.667 | 2,617,615.024 | 38,985.5 | 22.408 |
| 100 | stone | 57,270.266 | 485.333 | 1,538,510.847 | 13,038.01 | 134.008 |
| 100 | boss | 64,549.722 | 4,853.333 | 595,565.998 | 44,779.129 | 390.182 |
| 100 | worldBoss | 64,549.722 | 14,560 | 181,978.464 | 41,047.526 | 1,276.959 |
| 500 | normal | 36,433.218 | 277.333 | 22,236,321.96 | 169,265.077 | 5.898 |
| 500 | alpha | 182,166.083 | 1,109.333 | 20,928,309.546 | 127,446.748 | 31.335 |
| 500 | stone | 640,301.04 | 2,218.667 | 27,505,146.994 | 95,306.345 | 83.806 |
| 500 | boss | 721,687.836 | 22,186.667 | 4,761,658.511 | 146,386.462 | 545.624 |
| 500 | worldBoss | 721,687.836 | 66,560 | 1,454,951.212 | 134,187.592 | 1,785.679 |
| 1000 | normal | 103,048.698 | 548.167 | 33,640,802.061 | 178,952.145 | 11.028 |
| 1000 | alpha | 515,243.492 | 2,192.667 | 31,661,928.571 | 134,740.298 | 58.584 |
| 1000 | stone | 1,811,044.832 | 4,385.333 | 58,848,072.689 | 142,496.979 | 110.79 |
| 1000 | boss | 2,041,241.452 | 43,853.333 | 7,203,797.915 | 154,763.932 | 1,020.083 |
| 1000 | worldBoss | 2,041,241.452 | 131,560 | 2,201,160.474 | 141,866.937 | 3,338.452 |
| 5000 | normal | 1,152,119.478 | 2,714.833 | 88,225,763.962 | 207,893.576 | 47.012 |
| 5000 | alpha | 5,760,597.387 | 10,859.333 | 83,036,012.35 | 156,531.637 | 249.749 |
| 5000 | stone | 20,248,096.768 | 21,718.667 | 345,101,120.041 | 370,164.974 | 211.223 |
| 5000 | boss | 22,821,773.229 | 217,186.667 | 18,892,552.8 | 179,793.679 | 4,348.718 |
| 5000 | worldBoss | 22,821,773.229 | 651,560 | 5,772,724.467 | 164,810.872 | 14,232.168 |
| 10000 | normal | 3,258,685.979 | 5,423.167 | 133,700,102.886 | 222,506.236 | 87.743 |
| 10000 | alpha | 16,293,429.9 | 21,692.667 | 125,835,391.007 | 167,534.104 | 466.136 |
| 10000 | stone | 57,270,266.124 | 43,385.333 | 739,601,330.305 | 560,288.126 | 278.762 |
| 10000 | boss | 64,549,722.437 | 433,853.333 | 28,630,370.162 | 192,431.215 | 8,116.521 |
| 10000 | worldBoss | 64,549,722.437 | 1,301,560 | 8,748,168.661 | 176,395.281 | 26,563.16 |

## Normal kills for a +0 weapon upgrade attempt

| Level | Unchanged forge cost | OLD kills | NEW kills |
|---:|---:|---:|---:|
| 1 | 108 | 33.352 | 15.364 |
| 10 | 183 | 1.776 | 15.339 |
| 50 | 517 | 0.449 | 15.396 |
| 100 | 933 | 0.286 | 15.378 |
| 500 | 4267 | 0.117 | 15.386 |
| 1000 | 8433 | 0.082 | 15.384 |
| 5000 | 41767 | 0.036 | 15.385 |
| 10000 | 83433 | 0.026 | 15.385 |

## Boss/Alpha reward efficiency relative to normal gold/hour

| Level | Category | NEW category multiplier | NEW gold/hour divided by normal |
|---:|---|---:|---:|
| 100 | alpha | 4 | 0.753 |
| 100 | stone | 8 | 0.252 |
| 100 | boss | 80 | 0.865 |
| 100 | worldBoss | 240 | 0.793 |
| 500 | alpha | 4 | 0.753 |
| 500 | stone | 8 | 0.563 |
| 500 | boss | 80 | 0.865 |
| 500 | worldBoss | 240 | 0.793 |
| 1000 | alpha | 4 | 0.753 |
| 1000 | stone | 8 | 0.796 |
| 1000 | boss | 80 | 0.865 |
| 1000 | worldBoss | 240 | 0.793 |
| 5000 | alpha | 4 | 0.753 |
| 5000 | stone | 8 | 1.781 |
| 5000 | boss | 80 | 0.865 |
| 5000 | worldBoss | 240 | 0.793 |
| 10000 | alpha | 4 | 0.753 |
| 10000 | stone | 8 | 2.518 |
| 10000 | boss | 80 | 0.865 |
| 10000 | worldBoss | 240 | 0.793 |

## Founding regions remain legacy

| Level | Category | OLD average | NEW average |
|---:|---|---:|---:|
| 1 | normal | 6 | 6 |
| 1 | alpha | 30 | 30 |
| 1 | stone | 80.496 | 80.496 |
| 1 | boss | 12.24 | 12.24 |
| 1 | worldBoss | 12.24 | 12.24 |
| 10 | normal | 50 | 50 |
| 10 | alpha | 250 | 250 |
| 10 | stone | 1,540.469 | 1,540.469 |
| 10 | boss | 404.8 | 404.8 |
| 10 | worldBoss | 404.8 | 404.8 |
| 50 | normal | 1,234.414 | 1,234.414 |
| 50 | alpha | 6,172.071 | 6,172.071 |
| 50 | stone | 16,998.458 | 16,998.458 |
| 50 | boss | 12,250 | 12,250 |
| 50 | worldBoss | 12,250 | 12,250 |
| 60 | normal | 1,622.68 | 1,622.68 |
| 60 | alpha | 8,113.394 | 8,113.394 |
| 60 | stone | 26,616.813 | 26,616.813 |
| 60 | boss | 30,000 | 30,000 |
| 60 | worldBoss | 30,000 | 30,000 |

## Authoritative seeded region levels

| World Tier | Range | Normal level | OLD average | NEW average | Model |
|---:|---|---:|---:|---:|---|
| 1 | 1–6 | 3 | 9.5 | 9.5 | founding-legacy-v1 |
| 3 | 15–22 | 18 | 190 | 190 | founding-legacy-v1 |
| 7 | 50–60 | 55 | 1,424.132 | 1,424.132 | founding-legacy-v1 |
| 8 | 60–83 | 71 | 1,949.534 | 44.958 | frontier-linear-v1 |
| 20 | 468–511 | 489 | 35,237.558 | 271.375 | frontier-linear-v1 |
| 100 | 2936–2957 | 2946 | 521,064.669 | 1,602.25 | frontier-linear-v1 |
| 500 | 10000–10000 | 10000 | 3,258,685.979 | 5,423.167 | frontier-linear-v1 |
| 1000 | 10000–10000 | 10000 | 3,258,685.979 | 5,423.167 | frontier-linear-v1 |
| 10000 | 10000–10000 | 10000 | 3,258,685.979 | 5,423.167 | frontier-linear-v1 |

## Gold Find and server gold rates

| Level | Category | Gold Find % | Rate | OLD average | NEW average |
|---:|---|---:|---:|---:|---:|
| 100 | normal | 0 | 0 | 0 | 0 |
| 100 | normal | 0 | 0.5 | 1,629.344 | 30.33 |
| 100 | normal | 0 | 1 | 3,258.685 | 60.67 |
| 100 | normal | 0 | 2 | 6,517.374 | 121.332 |
| 100 | normal | 0 | 1000000 | 3,258,685,980.272 | 60,666,666.667 |
| 100 | normal | 100 | 0 | 0 | 0 |
| 100 | normal | 100 | 0.5 | 3,258.685 | 60.67 |
| 100 | normal | 100 | 1 | 6,517.374 | 121.332 |
| 100 | normal | 100 | 2 | 13,034.743 | 242.667 |
| 100 | normal | 100 | 1000000 | 6,517,371,960.544 | 121,333,333.333 |
| 100 | normal | 300 | 0 | 0 | 0 |
| 100 | normal | 300 | 0.5 | 6,517.374 | 121.332 |
| 100 | normal | 300 | 1 | 13,034.743 | 242.667 |
| 100 | normal | 300 | 2 | 26,069.486 | 485.333 |
| 100 | normal | 300 | 1000000 | 13,034,743,921.088 | 242,666,666.667 |
| 100 | normal | 1000 | 0 | 0 | 0 |
| 100 | normal | 1000 | 0.5 | 17,922.775 | 333.666 |
| 100 | normal | 1000 | 1 | 35,845.545 | 667.333 |
| 100 | normal | 1000 | 2 | 71,691.088 | 1,334.667 |
| 100 | normal | 1000 | 1000000 | 35,845,545,782.993 | 667,333,333.333 |
| 100 | worldBoss | 0 | 0 | 0 | 0 |
| 100 | worldBoss | 0 | 0.5 | 32,274.861 | 7,280 |
| 100 | worldBoss | 0 | 1 | 64,549.722 | 14,560 |
| 100 | worldBoss | 0 | 2 | 129,099.445 | 29,120 |
| 100 | worldBoss | 0 | 1000000 | 64,549,722,436.79 | 14,560,000,000 |
| 100 | worldBoss | 100 | 0 | 0 | 0 |
| 100 | worldBoss | 100 | 0.5 | 64,549.722 | 14,560 |
| 100 | worldBoss | 100 | 1 | 129,099.445 | 29,120 |
| 100 | worldBoss | 100 | 2 | 258,198.89 | 58,240 |
| 100 | worldBoss | 100 | 1000000 | 129,099,444,873.581 | 29,120,000,000.5 |
| 100 | worldBoss | 300 | 0 | 0 | 0 |
| 100 | worldBoss | 300 | 0.5 | 129,099.445 | 29,120 |
| 100 | worldBoss | 300 | 1 | 258,198.89 | 58,240 |
| 100 | worldBoss | 300 | 2 | 516,397.779 | 116,480 |
| 100 | worldBoss | 300 | 1000000 | 258,198,889,747.161 | 58,240,000,000 |
| 100 | worldBoss | 1000 | 0 | 0 | 0 |
| 100 | worldBoss | 1000 | 0.5 | 355,023.474 | 80,080 |
| 100 | worldBoss | 1000 | 1 | 710,046.947 | 160,160 |
| 100 | worldBoss | 1000 | 2 | 1,420,093.894 | 320,320 |
| 100 | worldBoss | 1000 | 1000000 | 710,046,946,804.711 | 160,160,000,000 |
| 10000 | normal | 0 | 0 | 0 | 0 |
| 10000 | normal | 0 | 0.5 | 1,629,342.99 | 2,711.583 |
| 10000 | normal | 0 | 1 | 3,258,685.979 | 5,423.167 |
| 10000 | normal | 0 | 2 | 6,517,371.963 | 10,846.333 |
| 10000 | normal | 0 | 1000000 | 3,258,685,980,272.11 | 5,423,166,666.666 |
| 10000 | normal | 100 | 0 | 0 | 0 |
| 10000 | normal | 100 | 0.5 | 3,258,685.979 | 5,423.167 |
| 10000 | normal | 100 | 1 | 6,517,371.963 | 10,846.333 |
| 10000 | normal | 100 | 2 | 13,034,743.92 | 21,692.667 |
| 10000 | normal | 100 | 1000000 | 6,517,371,960,544.227 | 10,846,333,333.333 |
| 10000 | normal | 300 | 0 | 0 | 0 |
| 10000 | normal | 300 | 0.5 | 6,517,371.963 | 10,846.333 |
| 10000 | normal | 300 | 1 | 13,034,743.92 | 21,692.667 |
| 10000 | normal | 300 | 2 | 26,069,487.845 | 43,385.333 |
| 10000 | normal | 300 | 1000000 | 13,034,743,921,088.445 | 21,692,666,666.667 |
| 10000 | normal | 1000 | 0 | 0 | 0 |
| 10000 | normal | 1000 | 0.5 | 17,922,772.889 | 29,827.417 |
| 10000 | normal | 1000 | 1 | 35,845,545.785 | 59,654.833 |
| 10000 | normal | 1000 | 2 | 71,691,091.565 | 119,309.667 |
| 10000 | normal | 1000 | 1000000 | 35,845,545,782,993.31 | 59,654,833,333.333 |
| 10000 | worldBoss | 0 | 0 | 0 | 0 |
| 10000 | worldBoss | 0 | 0.5 | 32,274,861.218 | 650,780 |
| 10000 | worldBoss | 0 | 1 | 64,549,722.437 | 1,301,560 |
| 10000 | worldBoss | 0 | 2 | 129,099,444.874 | 2,603,120 |
| 10000 | worldBoss | 0 | 1000000 | 64,549,722,436,790.15 | 1,301,559,999,999.983 |
| 10000 | worldBoss | 100 | 0 | 0 | 0 |
| 10000 | worldBoss | 100 | 0.5 | 64,549,722.437 | 1,301,560 |
| 10000 | worldBoss | 100 | 1 | 129,099,444.874 | 2,603,120 |
| 10000 | worldBoss | 100 | 2 | 258,198,889.747 | 5,206,240 |
| 10000 | worldBoss | 100 | 1000000 | 129,099,444,873,580.45 | 2,603,119,999,999.9 |
| 10000 | worldBoss | 300 | 0 | 0 | 0 |
| 10000 | worldBoss | 300 | 0.5 | 129,099,444.874 | 2,603,120 |
| 10000 | worldBoss | 300 | 1 | 258,198,889.747 | 5,206,240 |
| 10000 | worldBoss | 300 | 2 | 516,397,779.494 | 10,412,480 |
| 10000 | worldBoss | 300 | 1000000 | 258,198,889,747,161.1 | 5,206,240,000,000 |
| 10000 | worldBoss | 1000 | 0 | 0 | 0 |
| 10000 | worldBoss | 1000 | 0.5 | 355,023,473.402 | 7,158,580 |
| 10000 | worldBoss | 1000 | 1 | 710,046,946.805 | 14,317,160 |
| 10000 | worldBoss | 1000 | 2 | 1,420,093,893.609 | 28,634,320 |
| 10000 | worldBoss | 1000 | 1000000 | 710,046,946,804,693.2 | 14,317,160,000,000.145 |

## Party distribution (midpoint roll, level 100)

Recipient 1 is the killer (owned ground drop); others are credited directly with owned overflow drops. Recipient 2 has +100% Gold Find when present. Other recipients have zero bonus. Existing current-team range/death/sharing selection is unchanged.

| Category | Members | Gold Find % | OLD member amounts | NEW member amounts | NEW member gold/hour, equal DPS |
|---|---:|---|---|---|---|
| normal | 1 | 0 | 3259 | 61 | 52,061.747 |
| normal | 2 | 0/100 | 1629/3259 | 31/60 | 36,493.254/70,632.104 |
| normal | 3 | 0/100/0 | 1086/2172/1086 | 21/40/20 | 28,299.31/53,903.448/26,951.724 |
| normal | 4 | 0/100/0/0 | 815/1629/815/815 | 16/30/15/15 | 23,243.472/43,581.511/21,790.755/21,790.755 |
| normal | 5 | 0/100/0/0/0 | 652/1303/652/652/652 | 13/24/12/12/12 | 19,812.726/36,577.34/18,288.67/18,288.67/18,288.67 |
| alpha | 1 | 0 | 16293 | 243 | 39,039.077 |
| alpha | 2 | 0/100 | 8147/16293 | 122/242 | 27,034.298/53,625.411 |
| alpha | 3 | 0/100/0 | 5431/10862/5431 | 81/162/81 | 20,546.883/41,093.766/20,546.883 |
| alpha | 4 | 0/100/0/0 | 4073/8147/4073/4073 | 61/122/61/60 | 16,680.737/33,361.474/16,680.737/16,407.282 |
| alpha | 5 | 0/100/0/0/0 | 3259/6517/3259/3259/3259 | 49/98/49/48/48 | 14,057.281/28,114.562/14,057.281/13,770.398/13,770.398 |
| stone | 1 | 0 | 57270 | 485 | 13,029.06 |
| stone | 2 | 0/100 | 28635/57270 | 243/484 | 9,004.086/17,934.064 |
| stone | 3 | 0/100/0 | 19090/38180/19090 | 162/324/161 | 6,871.539/13,743.078/6,829.122 |
| stone | 4 | 0/100/0/0 | 14318/28635/14318/14318 | 122/242/121/121 | 5,578.576/11,065.699/5,532.85/5,532.85 |
| stone | 5 | 0/100/0/0/0 | 11454/22908/11454/11454/11454 | 97/194/97/97/97 | 4,653.236/9,306.472/4,653.236/4,653.236/4,653.236 |
| boss | 1 | 0 | 64550 | 4853 | 44,776.053 |
| boss | 2 | 0/100 | 32275/64550 | 2427/4852 | 30,886.4/61,747.347 |
| boss | 3 | 0/100/0 | 21517/43033/21517 | 1618/3236/1617 | 23,571.2/47,142.399/23,556.632 |
| boss | 4 | 0/100/0/0 | 16137/32275/16137/16137 | 1214/2426/1213/1213 | 19,065.418/38,099.427/19,049.713/19,049.713 |
| boss | 5 | 0/100/0/0/0 | 12910/25820/12910/12910/12910 | 971/1942/971/970/970 | 15,998.038/31,996.076/15,998.038/15,981.562/15,981.562 |
| worldBoss | 1 | 0 | 64550 | 14560 | 41,047.526 |
| worldBoss | 2 | 0/100 | 32275/64550 | 7280/14560 | 28,308.639/56,617.278 |
| worldBoss | 3 | 0/100/0 | 21517/43033/21517 | 4854/9706/4853 | 21,606.929/43,204.955/21,602.477 |
| worldBoss | 4 | 0/100/0/0 | 16137/32275/16137/16137 | 3640/7280/3640/3640 | 17,467.032/34,934.065/17,467.032/17,467.032 |
| worldBoss | 5 | 0/100/0/0/0 | 12910/25820/12910/12910/12910 | 2912/5824/2912/2912/2912 | 14,659.831/29,319.662/14,659.831/14,659.831/14,659.831 |

## Interpretation and deliberate scope limits

- Linear frontier gold keeps the normal kills/forge-attempt ratio close to 1/.065 = 15.385 at every supported level, before Gold Find/server modifiers. Integer rounding affects low values slightly.
- Founding rewards are preserved, so late founding zones can remain more profitable than early frontier regions. There is intentionally no newly introduced gold level-gap penalty. Resolving this legacy-farming opportunity requires a separate economy decision.
- Gold Find stays multiplicative and its gear stat still grows with item level. Very high bonuses can therefore dominate base-drop balancing; this task does not add a new equipment cap.
- Non-party HP/damage, forge costs, shop prices, item selling, rarity inflation, Souls and summoned-monster loot are unchanged. Gear liquidation and guardian gold can remain major income sources and are excluded from the gold/hour model.
- Boss kill times are inherited from the existing combat curves. The efficiency table makes any remaining low boss gold/hour explicit; drops and world progression also have value not priced into this report.
- Party division uses one rounded integer pool and assigns remainder units in killer-first order. Personal Gold Find is applied afterwards. This fixes small rounding inflation and repeated-recipient payments without introducing a party gold bonus.
- Each reward and wallet credit is a finite safe integer. Administrative gold rates retain their existing 1000000 cap; extreme legitimate finite Gold Find saturates individual rewards at the existing currency cap. No balances are migrated.

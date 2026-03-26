# 椤圭洰绠＄悊妯″潡鍓嶇璁捐

## 璁捐鍘熷垯

- 澶嶇敤褰撳墠 React + Ant Design 鍚庡彴椋庢牸
- 鐣岄潰浠ョ畝鍗曘€佸疄鐢ㄣ€佹槗缁存姢涓轰富
- 浠モ€滃垪琛?+ 寮圭獥 + 璇︽儏椤碘€濅綔涓轰富瑕佷氦浜掓ā寮?- 淇濇寔涓庣幇鏈夎矾鐢遍厤缃€佽彍鍗曢厤缃柟寮忎竴鑷?- 鍓嶇灞曠ず灞傚彲灏嗏€滈」鐩€濇枃妗堢粺涓€鏄犲皠涓衡€滀笟鍔＄嚎鈥濓紝浣嗗悗绔帴鍙ｅ拰鏁版嵁妯″瀷浠嶆部鐢?`project` 鍛藉悕

## 鏂板鍓嶇妯″潡

### API 鏂囦欢

- `src/api/projects.js`
- `src/api/requirements.js`
- `src/api/bugs.js`
- `src/api/projectStats.js`

杩欎簺鏂囦欢鐢ㄤ簬灏佽鏂板鍚庣鎺ュ彛锛岄鏍间繚鎸佸拰鐜版湁 API 妯″潡涓€鑷淬€?
### 椤甸潰鏂囦欢

- `src/pages/Projects.jsx`
- `src/pages/ProjectDetail.jsx`
- `src/pages/Requirements.jsx`
- `src/pages/Bugs.jsx`
- `src/pages/ProjectStats.jsx`

鍙€夌殑鍚庣画椤甸潰锛?
- `src/pages/ProjectBoard.jsx`

### 鍙鐢ㄧ粍浠?
- `src/components/project/ProjectFormModal.jsx`
- `src/components/project/ProjectMemberModal.jsx`
- `src/components/project/ProjectStatusTag.jsx`
- `src/components/requirement/RequirementFormModal.jsx`
- `src/components/requirement/RequirementStatusTag.jsx`
- `src/components/bug/BugFormModal.jsx`
- `src/components/bug/BugSeverityTag.jsx`
- `src/components/stats/HoursSummaryCards.jsx`
- `src/components/stats/ProjectHoursChart.jsx`

## 鑿滃崟璁捐

鎺ㄨ崘鏂板涓€绾ц彍鍗曞垎缁勶細

- `椤圭洰鍗忎綔`

鎺ㄨ崘浜岀骇鑿滃崟锛?
- `椤圭洰鍒楄〃`
- `闇€姹傜鐞哷
- `Bug 绠＄悊`
- `宸ユ椂缁熻`

濡傛灉褰撳墠绯荤粺瀵艰埅鏈韩鍋忓钩閾猴紝涔熷彲浠ユ寜闇€瑕佹媶鎴愪竴绾ц彍鍗曪紝浣嗘洿鎺ㄨ崘淇濇寔鍒嗙粍鏂瑰紡銆?
## 璺敱璁捐

鎺ㄨ崘鏂板浠ヤ笅璺敱锛?
- `/projects`
- `/projects/:id`
- `/requirements`
- `/bugs`
- `/project-stats`

寤鸿鐨勮矾鐢遍厤缃ず渚嬶細

```js
{
  path: '/projects',
  componentKey: 'projects',
  title: '椤圭洰鍒楄〃',
}
{
  path: '/requirements',
  componentKey: 'requirements',
  title: '闇€姹傜鐞?,
}
{
  path: '/bugs',
  componentKey: 'bugs',
  title: 'Bug 绠＄悊',
}
{
  path: '/project-stats',
  componentKey: 'projectStats',
  title: '宸ユ椂缁熻',
}
```

## 椤甸潰绾ц璁?
## 1. 涓氬姟绾垮垪琛ㄩ〉

### 涓昏鐩爣

- 灞曠ず涓氬姟绾垮垪琛?- 鏀寔鏌ヨ涓庣瓫閫?- 鏀寔鏂板缓銆佺紪杈戙€佸垹闄?- 鏀寔杩涘叆涓氬姟绾胯鎯呴〉

### 椤甸潰甯冨眬

- 椤堕儴绛涢€夊尯鍩?- 涓棿琛ㄦ牸鍒楄〃
- 鍙充晶鎿嶄綔鍒?- 鏂板缓/缂栬緫缁熶竴浣跨敤寮圭獥琛ㄥ崟

### 绛涢€夐」

- 涓氬姟绾垮悕绉板叧閿瘝
- 涓氬姟绾跨姸鎬?- 涓氬姟绾胯礋璐ｄ汉

### 琛ㄦ牸鍒?
- 涓氬姟绾垮悕绉?- 涓氬姟绾跨紪鐮?- 鐘舵€?- 璐熻矗浜?- 鎴愬憳鏁?- 寮€濮嬫棩鏈?- 缁撴潫鏃ユ湡
- 鍒涘缓鏃堕棿
- 鎿嶄綔

### 鎿嶄綔

- 鏂板缓涓氬姟绾?- 缂栬緫
- 鍒犻櫎
- 鏌ョ湅璇︽儏

## 2. 涓氬姟绾胯鎯呴〉

### 涓昏鐩爣

- 灞曠ず涓氬姟绾垮熀纭€淇℃伅
- 灞曠ず涓氬姟绾挎垚鍛?- 灞曠ず鍏宠仈闇€姹?- 灞曠ず鍏宠仈 Bug
- 灞曠ず鏈€杩戞搷浣滄棩蹇?
### 甯冨眬寤鸿

- 椤堕儴涓氬姟绾挎瑙堝崱鐗?- 涓嬫柟浣跨敤 `Tabs`
  - 鎴愬憳
  - 闇€姹?  - Bug
  - 鎿嶄綔鏃ュ織

### 璇︽儏鍐呭

#### 鍩虹淇℃伅鍗＄墖

- 涓氬姟绾垮悕绉?- 涓氬姟绾跨紪鐮?- 涓氬姟绾跨姸鎬?- 涓氬姟绾胯礋璐ｄ汉
- 鏃堕棿鑼冨洿
- 涓氬姟绾胯鏄?
#### 鎴愬憳 Tab

- 鎴愬憳鍒楄〃
- 瑙掕壊鏍囩
- 娣诲姞鎴愬憳鎸夐挳
- 淇敼鎴愬憳瑙掕壊
- 绉婚櫎鎴愬憳

#### 闇€姹?Tab

- 鍏宠仈闇€姹傝〃鏍?- 蹇€熸柊寤洪渶姹傛寜閽?
#### Bug Tab

- 鍏宠仈 Bug 琛ㄦ牸
- 蹇€熸柊寤?Bug 鎸夐挳

#### 鏃ュ織 Tab

- 鎿嶄綔浜?- 鎿嶄綔绫诲瀷
- 瀵硅薄绫诲瀷
- 鎿嶄綔璇︽儏
- 鏃堕棿

## 3. 闇€姹傜鐞嗛〉

### 涓昏鐩爣

- 鏌ョ湅闇€姹傚垪琛?- 鍒涘缓涓庣紪杈戦渶姹?- 娴佽浆鐘舵€佷笌闃舵
- 鎸囨淳璐熻矗浜?- 缁存姢宸ユ椂

### 甯冨眬

- 绛涢€夎〃鍗?- 闇€姹傝〃鏍?- 鏂板缓/缂栬緫寮圭獥

### 绛涢€夐」

- 鍏抽敭璇?- 涓氬姟绾?- 鐘舵€?- 浼樺厛绾?- 璐熻矗浜?- 闃舵

### 琛ㄦ牸鍒?
- 鏍囬
- 鎵€灞炰笟鍔＄嚎
- 浼樺厛绾?- 鐘舵€?- 闃舵
- 璐熻矗浜?- 棰勮宸ユ椂
- 瀹為檯宸ユ椂
- 鎴鏃ユ湡
- 鎿嶄綔

### 琛屾搷浣?
- 缂栬緫
- 淇敼鐘舵€?- 淇敼闃舵
- 鎸囨淳璐熻矗浜?- 鍒犻櫎

## 4. Bug 绠＄悊椤?
### 涓昏鐩爣

- 鏌ョ湅 Bug 鍒楄〃
- 鎻愪氦鍜岀紪杈?Bug
- 鎸囨淳寮€鍙?- 娴佽浆 Bug 鐘舵€?- 鏇存柊宸ユ椂

### 甯冨眬

- 绛涢€夎〃鍗?- Bug 琛ㄦ牸
- 鏂板缓/缂栬緫寮圭獥

### 绛涢€夐」

- 鍏抽敭璇?- 涓氬姟绾?- 鍏宠仈闇€姹?- 涓ラ噸绋嬪害
- 鐘舵€?- 鎸囨淳浜?- 闃舵

### 琛ㄦ牸鍒?
- 鏍囬
- 鎵€灞炰笟鍔＄嚎
- 鍏宠仈闇€姹?- 涓ラ噸绋嬪害
- 鐘舵€?- 闃舵
- 鎸囨淳寮€鍙?- 棰勮宸ユ椂
- 瀹為檯宸ユ椂
- 鎴鏃ユ湡
- 鎿嶄綔

## 5. 宸ユ椂缁熻椤?
### 涓昏鐩爣

- 灞曠ず鎬昏鎸囨爣
- 灞曠ず鎸変笟鍔＄嚎缁熻鐨勫伐鏃?- 灞曠ず鎸夋垚鍛樼粺璁＄殑宸ユ椂

### 甯冨眬寤鸿

- 椤堕儴缁熻鍗＄墖
- 涓棿鎸変笟鍔＄嚎缁熻琛ㄦ牸鎴栨煴鐘跺浘
- 涓嬫柟鎸夋垚鍛樼粺璁¤〃鏍?
### 鎬昏鎸囨爣

- 涓氬姟绾挎€绘暟
- 杩涜涓笟鍔＄嚎鏁?- 宸插畬鎴愪笟鍔＄嚎鏁?- 闇€姹傛€绘暟
- Bug 鎬绘暟
- 棰勮鎬诲伐鏃?- 瀹為檯鎬诲伐鏃?- 鎬讳汉澶?
### 寤鸿灞曠ず鏂瑰紡

- 绗竴鐗堜紭鍏堜娇鐢ㄥ崱鐗囧拰琛ㄦ牸
- 鍥捐〃鍙互鍦ㄥ悗缁増鏈腑閫愭琛ュ厖

## 缁勪欢璁捐寤鸿

## ProjectFormModal

寤鸿瀛楁锛?
- `name`
- `project_code`
- `description`
- `status`
- `owner_user_id`
- `start_date`
- `end_date`

鐢ㄩ€旓細

- 鏂板缓椤圭洰
- 缂栬緫椤圭洰

## ProjectMemberModal

寤鸿瀛楁锛?
- `user_id`
- `project_role`

鐢ㄩ€旓細

- 娣诲姞鎴愬憳
- 淇敼鎴愬憳瑙掕壊

## RequirementFormModal

寤鸿瀛楁锛?
- `project_id`
- `title`
- `description`
- `priority`
- `status`
- `stage`
- `assignee_user_id`
- `estimated_hours`
- `actual_hours`
- `start_date`
- `due_date`

## BugFormModal

寤鸿瀛楁锛?
- `project_id`
- `requirement_id`
- `title`
- `description`
- `reproduce_steps`
- `severity`
- `status`
- `stage`
- `assignee_user_id`
- `estimated_hours`
- `actual_hours`
- `due_date`

## 鏍囩缁勪欢

寤鸿鍋氱嫭绔嬫爣绛剧粍浠剁粺涓€棰滆壊鍜屽睍绀洪€昏緫锛?
- `ProjectStatusTag`
- `RequirementStatusTag`
- `BugSeverityTag`

杩欐牱鍙互鍑忓皯椤甸潰閲岀殑閲嶅鍒ゆ柇閫昏緫锛屼篃鏂逛究鍚庣画缁熶竴鏀规牱寮忋€?
## 鐘舵€佺鐞嗗缓璁?
MVP 闃舵寤鸿椤甸潰鏈湴绠＄悊鐘舵€佸嵆鍙細

- 鏌ヨ鏉′欢
- 鍒楄〃 loading
- 寮圭獥寮€鍏?- 褰撳墠閫変腑璁板綍
- 琛ㄥ崟鐘舵€?
鏆傛椂涓嶅缓璁负姝ゅ崟鐙紩鍏ユ柊鐨勫叏灞€鐘舵€佸簱銆?
## 鏉冮檺澶勭悊寤鸿

鍓嶇缁х画澶嶇敤褰撳墠宸叉湁鐨勮闂帶鍒跺伐鍏峰嚱鏁般€?
渚嬪锛?
- 娌℃湁 `project.create` 鏃堕殣钘忊€滄柊寤洪」鐩€濇寜閽?- 娌℃湁 `project.edit` 鏃堕殣钘忕紪杈戞寜閽?- 娌℃湁 `project.stats.view` 鏃堕殣钘忕粺璁￠〉闈㈠叆鍙?
## MVP 浜や簰寤鸿

- 鍒楄〃椤甸粯璁ら噰鐢ㄨ〃鏍煎舰寮?- 鏂板缓/缂栬緫缁熶竴璧板脊绐?- 璇︽儏浣跨敤鐙珛椤甸潰
- 鐘舵€佸睍绀轰娇鐢ㄦ爣绛?- 鑱氬悎淇℃伅浣跨敤鏍囩椤?- 绗竴鐗堜笉寮曞叆鎷栨嫿鐪嬫澘


# 玩法插件接口（PF.Sys）

每个新玩法写成一个“系统”，放在 `js/sys/<名字>.js`，样式放在对应的 `css/*.css`。
系统在文件加载时调用 `PF.Sys.register({...})` 注册，`Game` 会在各个时机回调它。
**系统不要修改核心文件**（game / entities / world / ui / main …），只通过下面的钩子接入。

```js
(function () {
  'use strict';
  const PF = window.PF, U = PF.U, D = PF.Data, S = PF.Spr, A = PF.Audio, E = PF.Ent;
  PF.Sys.register({
    id: 'fishing',      // 唯一，存档用这个键
    order: 50,          // 回调顺序（小的先）
    init(g, saved, fresh) { g.sys.fishing = saved || { ... }; },
    serialize(g) { return g.sys.fishing; },
    update(g, dt) { ... },
    ...
  });
})();
```

所有钩子都是可选的，签名里第一个参数都是当前这局的 `Game` 实例 `g`。钩子里抛出的异常会被捕获并打印，不会让游戏崩掉。

## 生命周期

| 钩子 | 时机 |
| --- | --- |
| `init(g, saved, fresh)` | 每局开始（新开或读档）后调用。`saved` 是上次 `serialize` 的返回值（新开局为 `undefined`），`fresh` 为是否新开局。把本系统这一局的状态放在 `g.sys[id]`。此时世界、玩家都已生成，可以往世界里加东西。 |
| `serialize(g)` | 存档时调用，返回可 JSON 序列化的数据。 |
| `destroy(g)` | 离开这局（回菜单）时调用。清理自己创建的 DOM、定时器。 |
| `mods(g, m)` | 汇总数值修正。往 `m` 上加/乘，见下方“数值修正”。系统状态变化后调用 `g.recomputeMods()` 让它重新汇总。 |
| `update(g, dt)` | 每帧（岛上、未暂停、非过场、非小游戏）在核心实体更新之后调用。 |

## 事件

| 钩子 | 时机 |
| --- | --- |
| `dusk(g)` | 黄昏开始（白天最后 10 秒） |
| `night(g)` | 入夜（收到海盗信的时刻） |
| `raid(g, ship)` | 海盗船出发（入夜后 20 秒）。`ship` 可能为 null（没有可靠岸的方向） |
| `dawn(g, day)` | 新的一天开始（`day` 从 0 起） |
| `harvest(g, node, amt, player)` | 资源点被采集（`player` 为 null 表示精灵） |
| `unlock(g, tile)` | 驱散了一块迷雾 |
| `build(g, kind)` | 建好建筑（`wood/rice/shop/crystal/dock`） |
| `upgrade(g, what, k)` | 升级（`what` 为 `camp` 或产业键） |
| `hire(g, worker)` | 召唤了一只精灵 |
| `enemyDie(g, enemy, src)` | 敌人死亡（已发金币、计入击杀） |
| `playerHurt(g, player, dmg, src)` / `playerDown(g, player)` | 玩家受伤 / 倒地 |
| `campHurt(g, dmg)` | 营地受伤 |
| `chest(g, chest, player)` | 打开宝箱 |
| `task(g, i)` | 完成目标 `i` |
| `miniEnd(g, world, ok)` | 异世界小游戏结束 |
| `revive(g)` | 复活 |
| `gameOver(g, reason)` | 营地被毁 / 全员倒地（之后会弹复活框） |
| `win(g)` | 登陆新大陆并选择结算 |
| `runEnd(g, win, ending, data)` | 本局结算前。可以往 `data.extra` 里塞 HTML 字符串（显示在结算框里），往 `data.statsExtra` 里塞 `<div class="stat">…</div>`，或设置 `data.title` |

## 绘制

| 钩子 | 坐标系 | 时机 |
| --- | --- | --- |
| `drawGround(g, ctx, cam)` | 世界 | 地面之后、物体之前（地面贴花、水面钓鱼点、温泉…） |
| `drawables(g, add, cam)` | 世界 | 往 y 排序列表里加东西：`add(y, () => draw...)` |
| `drawTop(g, ctx, cam)` | 世界 | 所有物体与飘字之后、迷雾之前 |
| `drawOverFog(g, ctx, cam)` | 世界 | 迷雾之后、夜晚光照之前 |
| `lights(g, light)` | 世界 | 夜晚光照：`light(wx, wy, 半径, 强度0~1)` |
| `drawScreen(g, ctx, dpr, cam)` | 屏幕（CSS 像素，已乘 dpr） | 光照之后（雨、闪电、屏幕特效） |
| `minimap(g, dot)` | 小地图 | `dot(wx, wy, 颜色, 尺寸px)`，每 0.25 秒重画一次 |

世界单位：一块地 `D.TILE = 352`，美术像素 `D.PX = 4`。`cam.visible(x, y, margin)` 判断是否在视野里，`cam.toScreen(x, y)` 转屏幕坐标。
画像素图用 `PF.Ent.drawSprite(ctx, canvas, x, footY, {flip, scale, flash})`，阴影 `PF.Ent.shadow(ctx, x, y, w, h)`，血条 `PF.Ent.hpBar(...)`，名牌 `g.namePlate(ctx, x, y, text, color)`。
自己的像素图用 `new PF.Spr.PC(w, h)` 画（`p / r / circ / line / grid / outline / shade`），画一次缓存起来。

## 交互

- `prompt(g, player)`：返回 `{label, cost?, note?, ...任意数据}` 或 `null`。核心先检查建筑、木筏、洞窟，然后依次问各系统，最后才是“驱散迷雾”。返回的对象会被加上 `kind: 'sys', sys: id`，显示成玩家头顶的气泡；`cost` 为 `[木, 稻, 晶, 金]`，不够时气泡会显示“还差…”。
- `act(g, playerIndex, prompt)`：玩家点了气泡 / 按了交互键。
- 气泡对象可选字段：`btn`（手机右下角大按钮上的 2~3 个字，默认“打开”）、`note`（气泡里的一行绿色说明）。
- 自定义统计：任何系统都可以 `g.fire('stat', 名字, 数量)` 上报（成就系统用 `stat(g, name, n)` 钩子监听）。约定的名字：
  `boss`（击败首领）、`fogmon`（击败雾怪）、`tower`（建箭塔）、`trap`（建陷阱）、`bonfire`（建篝火）、`skill`（使用技能）、
  `fish`（钓到鱼）、`rareFish`（钓到彩虹鱼）、`pet`（驯服 / 领养宠物）、`event`（遇到随机事件）、`merchant`（在商船买东西）、
  `treasure`（挖到宝藏）、`landmark`（激活特殊地块）、`puzzle`（解开遗迹谜题）、`cook`（做料理）。
- 天气：`g.sys.events.weather` 为 `'clear' | 'rain' | 'storm'`（由天气系统维护，其他系统只读）。

## 营地 / 集市标签页

- `campTabs(g, playerIndex)`、`shopTabs(g, playerIndex)`：返回一个或多个标签页
  `{ id, title, render(g, ui) → HTML, act(g, act, ui, btn) }`。
  HTML 里的按钮写 `data-act="xxx"`，点击后调用 `act`，之后弹窗会自动重绘。
  可以复用 `ui.upRow(iconHTML, title, desc, cost, act, state, label)`、`ui.costHTML(cost, g)`、`ui.imgIcon(k)`、`ui.spriteIcon(canvas)`、`ui.lackShort(cost)`；行样式是 `.row/.ic/.mid/.t/.d/.cs`。

## 其他界面

- `taskText(g)`：返回字符串时替换 HUD 上的“目标”文字（无尽模式用）。
- `help()`：返回 HTML（`<p><b>标题：</b>说明</p>`），追加到“玩法说明”。
- HUD 挂点（index.html 里已有，默认隐藏，加 `.on` 显示）：
  `#rightCol` 右下角按钮列，内含 `#buildBtn`、`#skillBtn0`（1P）、`#skillBtn1`（2P，固定在左下）——都是 `.hudbtn`；
  `#bossBar` 顶部中间；`#weatherBox` 右上角时钟左边；`#alerts` 左侧提示列（可 `appendChild`）；
  `.res` 资源条（可追加 `.pill`）；`#extHud` 自由层（`pointer-events: none`，子元素自己打开）。
- 弹窗：`PF.UI.open(html, 'w-sm' | 'w-md', onAct(act, btn, wrap), {refresh: () => html})`，`PF.UI.close()`，`PF.UI.toast(msg)`。打开弹窗会暂停本局。

## 全局钩子（不属于某一局）

`PF.Hooks`：
- `openTalents(onClose)` / `openAchievements(onClose)`：模式选择页的“天赋”“成就”按钮（暂停菜单里也有成就按钮）。
- `renderRoleExtra(el, {pickStep, sel, twoP, rerender})`：在选角详情里渲染额外内容（比如外观选择）。
- `playerDecor(ctx, player, frame)`：玩家精灵画完后调用（帽子、光环…）。

## 数值修正（`mods(g, m)`）

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `playerSpeedMul` | 1 | 玩家移速倍率 |
| `playerHpAdd` / `playerRegenAdd` | 0 | 玩家血量上限 / 每秒回血 |
| `atkAdd` / `atkMul` | 0 / 1 | 攻击力加成 / 倍率 |
| `workerSpeedMul` / `workerCarryAdd` | 1 / 0 | 精灵移速倍率 / 负重 |
| `campHpAdd` | 0 | 营地血量上限 |
| `tileCostMul` | 1 | 驱散迷雾的费用倍率 |
| `gatherBonus` | 0 | 玩家采集时额外 +1 的几率 |
| `darknessMul` | 1 | 夜晚黑暗程度 |
| `regrowMul` / `prodMul` | 1 | 资源再生速度 / 建筑产出速度 |
| `goldMul` | 1 | 打敌人掉的金币 |
| `enemyHpMul` / `enemyAtkMul` / `enemyCountMul` | 1 | 敌人血量 / 攻击 / 每晚数量 |
| `extraFreeRevives` | 0 | 额外的免费复活次数（新开局时生效） |

## 敌人与友方

- `g.pirates` 是所有敌人的数组（名字是历史原因）。玩家、精灵、防御塔都从这里找目标。
  自定义敌人继承 `PF.Ent.Pirate`：`new MyEnemy(g, statsObj, x, y, landPoint)`，`statsObj` 形如
  `{ id, name, hp, atk, speed, gold, scale, atkCD }`；登陆后的状态是 `'walk'`。
  需要的接口：`x, y, r, dead, deadT, state, hp, hpMax, K, hurt(dmg, src), update(dt), draw(ctx)`。
  `noSave = true` 的敌人不进存档（雾怪、首领自己管理）。死亡时调用 `g.onPirateDie(this, src)`（发金币、计击杀、触发 `enemyDie`）。
- `g.allies`：系统加入的友方单位（宠物等）。设置 `canBeTargeted = true` 并实现 `hurt(dmg)`、`dead` 的单位会被敌人当成目标。
- `g.world.solids`：系统添加的障碍物（`{x, y, r}` 圆或 `{x0, x1, y0, y1}` 矩形），玩家、精灵、敌人都会被挡住并自动绕路。
- 伤害：`enemy.hurt(dmg, src)`；`player.hurt(dmg, src)`；`g.hurtCamp(dmg)`。
- 生成海盗船：`g.spawnShip(dir, tileIndex, kindsQueue)`；`g.raidPlan(day)` 返回当晚海盗编号队列。

## 常用工具

- 资源：`g.st.res`（[木, 稻, 晶, 金]），`g.canAfford(cost)`、`g.pay(cost)`、`g.lack(cost)`、`g.addRes(i, n, x?, y?)`。
- 道具：`g.item(k)`、`g.addItem(k, n)`（存在 `g.st.items`，会进存档）。
- 时间：`g.isNight()`、`g.darkness()`、`g.st.day`、`g.st.cycleT`、`g.dayLen`、`g.nightLen`（系统可在 `init` 里改）。
- `g.endless`（无尽模式）、`g.twoP`、`g.players`、`g.workers`、`g.world`（`tiles`、`nodes`、`walkable(x, y, r)`、`tileIdx(x, y)`、`unlockedAt(x, y)`、`outerTiles(dir)`、`nextWaypoint(...)`、`steer(...)`）。
- `g.later(fn, ms)`：随本局一起取消的 `setTimeout`。`g.toast(msg)`；特效 `g.fx.text/icon/burst/sparkle/splash`；`g.cam.shake = 8`。
- 长期存档：`PF.Save.meta`（`crystals`、`talents`、`ach`、`outfits`、`endlessBest`、`stats` …），改完 `PF.Save.saveMeta()`。
- 声音：`PF.Audio.play(name)`，可用：click open close chop reap mine hit hurt coin pop build unlock alarm splash portal success fail letter die deposit heal boom laser warn tick wrong right fall step。
- 输入：`PF.Input.skill(pi)`（Q / 右Shift，本帧按下）、`PF.Input.keyPressed(code)`、`PF.Input.move(pi)`。

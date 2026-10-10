// @id: pjsk
// @name: 世界计划 彩色舞台
// @description: 检测 プロジェクトセカイ カラフルステージ! 日服解锁状态
// @category: games
// @regions: jp
// @tags: game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",r="failed";function handler(){let s=fetch("https://game-version.sekai.colorfulpalette.org/1.8.1/3ed70b6a-8352-4532-b819-108837926ff5",{headers:{"User-Agent":"pjsekai/48 CFNetwork/1240.0.4 Darwin/20.6.0"},retry:3,timeout:5e3});return s?200===s.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===s.statusCode?{text:e,background:t,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:r,error:a}}module.exports=handler;

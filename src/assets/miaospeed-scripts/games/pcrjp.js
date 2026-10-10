// @id: pcrjp
// @name: 公主连结Re:Dive
// @description: 检测 プリンセスコネクト!Re:Dive 日服解锁状态
// @category: games
// @regions: jp
// @tags: game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="failed";function handler(){let s=fetch("https://api-priconne-redive.cygames.jp/",{headers:{"User-Agent":"Dalvik/2.1.0 (Linux; U; Android 14; M2006J10C Build/RP1A.200720.011)"},retry:3,timeout:5e3});return s?404===s.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===s.statusCode?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:e,background:t,status:a}}module.exports=handler;

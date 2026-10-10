// @id: prettyderby
// @name: 赛马娘
// @description: 检测 赛马娘(ウマ娘 プリティーダービー) 日服解锁状态
// @category: games
// @regions: jp
// @tags: game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",u="failed";function handler(){let a=fetch("https://api.games.umamusume.jp/",{headers:{"User-Agent":"Dalvik/2.1.0 (Linux; U; Android 14; M2006J10C Build/RP1A.200720.011)"},retry:3,timeout:5e3});return a?404===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===a.statusCode?{text:e,background:t,status:u}:{text:"N/A",background:"142,140,142",status:"na"}:{text:e,background:t,status:u}}module.exports=handler;

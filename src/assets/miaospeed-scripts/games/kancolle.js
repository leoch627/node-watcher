// @id: kancolle
// @name: 舰队Collection
// @description: 检测 舰队Collection(艦これ) 解锁状态
// @category: games
// @regions: jp
// @tags: stream, game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",s="网络",n="failed";function handler(){let r=fetch("https://w00g.kancolle-server.com/kcscontents/news/",{headers:{"User-Agent":"Dalvik/2.1.0 (Linux; U; Android 14; M2006J10C Build/RP1A.200720.011)"},noRedir:!0,retry:3,timeout:5e3});return r?200===r.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===r.statusCode||302===r.statusCode?{text:e,background:t,status:n}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${s})`,background:t,status:n,error:s}}module.exports=handler;

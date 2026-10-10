// @id: konosubafd
// @name: 为美好的世界献上祝福 Fantastic Days
// @description: 检测 このすば ファンタスティックデイズ 日服解锁状态
// @category: games
// @regions: jp
// @tags: game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",s="failed";function handler(){let r=fetch("https://api.konosubafd.jp/api/masterlist",{method:"POST",headers:{"User-Agent":"pj0007/212 CFNetwork/1240.0.4 Darwin/20.6.0"},retry:3,timeout:5e3});return r?200===r.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===r.statusCode?{text:e,background:t,status:s}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:s,error:a}}module.exports=handler;

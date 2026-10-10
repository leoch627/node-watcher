// @id: mathsspot
// @name: MathsSpot Roblox
// @description: 检测 Roblox MathsSpot 解锁状态
// @category: games
// @regions: eu
// @tags: game
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed";function handler(){let n=fetch("https://mathsspot.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${t}(${r})`,background:e,status:o,error:r};if(n.body.indexOf("FailureServiceNotInRegion")>-1)return{text:t,background:e,status:o};let a=n.body.match(/"countryCode"\s*:\s*"([^"]+)"/);return a?{text:`解锁(${a[1].toLowerCase()})`,background:"186,230,126",status:"unlocked",region:a[1]}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;

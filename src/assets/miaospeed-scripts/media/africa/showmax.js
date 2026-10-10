// @id: showmax
// @name: Showmax
// @description: 检测 Showmax 解锁状态
// @category: media
// @regions: africa
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed";function handler(){let n=fetch("https://www.showmax.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${t}(${r})`,background:e,status:o,error:r};let a=n.body.indexOf("activeTerritory");if(-1===a)return{text:t,background:e,status:o};let i=n.body.slice(a+15+1),s=i.indexOf("\n"),d=(-1===s?i:i.slice(0,s)).trim();return d?{text:`解锁(${d.toLowerCase()})`,background:"186,230,126",status:"unlocked",region:d}:{text:t,background:e,status:o}}module.exports=handler;

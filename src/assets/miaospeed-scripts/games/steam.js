// @id: steam
// @name: Steam 货币
// @description: 检测 Steam 货币
// @category: games
// @regions: global
// @tags: game
// @priority: 12
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed";function handler(){var a,s;let n=fetch("https://store.steampowered.com",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!n||200!==n.statusCode)return{text:`${t}(${r})`,background:e,status:o,error:r};let u=(a=n.cookies,s={},a.forEach(e=>{var t=e.Name,r=e.Value;s[t]=r}),s);if(u.steamCountry){let r=u.steamCountry,a=r.indexOf("%");if(-1===a)return{text:t,background:e,status:o};let s=r.substring(0,a).toUpperCase();return{text:`解锁(${s})`,background:"186,230,126",status:"unlocked",region:s}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;

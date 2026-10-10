// @id: tntsports
// @name: TNT Sports
// @description: 检测 TNT Sports 解锁状态
// @category: media
// @regions: eu
// @tags: stream, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",r="failed";function handler(){let s=fetch("https://www.tntsports.co.uk/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});if(!s)return{text:`${e}(${o})`,background:t,status:r,error:o};if(403===s.statusCode)return{text:`${e}(WAF)`,background:"253,109,20",status:"warning"};if(307===s.statusCode&&"https://www.tntsports.co.uk/geoblocking.shtml"===s.headers.location)return{text:e,background:t,status:r};if(200===s.statusCode){let t=s.body.match(/\\"countryCode\\":\\"([A-Z]{2})\\"/);if(t)return{text:`解锁(${t[1].toLowerCase()})`,background:"186,230,126",status:"unlocked",region:t[1].toLowerCase()}}return{text:e,background:t,status:r}}module.exports=handler;

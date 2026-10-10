// @id: encoretvb
// @name: encoreTVB
// @description: 检测 encoreTVB(北美/海外 TVB 平台) 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",a="failed";function handler(){let o=fetch("https://edge.api.brightcove.com/playback/v1/accounts/5324042807001/videos/6005570109001",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Accept:"application/json;pk=BCpkADawqM2Gpjj8SlY2mj4FgJJMfUpxTNtHWXOItY1PvamzxGstJbsgc-zFOHkCVcKeeOhPUd9MNHEGJoVy1By1Hrlh9rOXArC5M5MTcChJGU6maC8qhQ4Y8W-QYtvi8Nq34bUb9IOvoKBLeNF4D9Avskfe9rtMoEjj6ImXu_i4oIhYS0dx7x1AgHvtAaZFFhq3LBGtR-ZcsSqxNzVg-4PRUI9zcytQkk_YJXndNSfhVdmYmnxkgx1XXisGv1FG5GOmEK4jZ_Ih0riX5icFnHrgniADr4bA2G7TYh4OeGBrYLyFN_BDOvq3nFGrXVWrTLhaYyjxOr4rZqJPKK2ybmMsq466Ke1ZtE-wNQ",Origin:"https://www.encoretvb.com"},retry:3,timeout:5e3});if(!o)return{text:`${e}(${r})`,background:t,status:a,error:r};let s=get(safeParse(o.body),"account_id","");return s&&"0"!==s?{text:"解锁",background:"186,230,126",status:"unlocked"}:"CLIENT_GEO"===get(safeParse(o.body),"0.error_subcode","")?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;

// @id: crackle
// @name: Crackle
// @description: 检测 Crackle 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",r="失败",t="网络",a="failed";function handler(){let c=fetch("https://prod-api.crackle.com/appconfig",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Origin:"https://www.crackle.com",Referer:"https://www.crackle.com/","x-crackle-apiversion":"v2.0.0","x-crackle-brand":"crackle","x-crackle-platform":"5FE67CCA-069A-42C6-A20F-4B47A8054D46"},retry:3,timeout:5e3});if(!c)return{text:`${r}(${t})`,background:e,status:a,error:t};let o=c.headers["x-crackle-region"]||"";return"US"===o?{text:"解锁",background:"186,230,126",status:"unlocked",region:o}:o?{text:`${r}(${o})`,background:e,status:a,region:o}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;

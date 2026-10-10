// @id: kktv
// @name: KKTV
// @description: 检测 KKTV 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, live
// @priority: 37
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",a="解析",o="failed";function handler(){let n=fetch("https://api.kktv.me/v3/ipcheck",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!n||200!==n.statusCode)return{text:`${t}(${r})`,background:e,status:o,error:r};let s=n.body,d=safeParse(s);if(!s||!d)return{text:`${t}(${a})`,background:e,status:o,error:a};let i=d.data.country,u=d.data.is_allowed;return"TW"===i&&u?{text:`解锁(${i})`,background:"186,230,126",status:"unlocked",region:i}:{text:`${t}(${i})`,background:e,status:o,region:i}}module.exports=handler;

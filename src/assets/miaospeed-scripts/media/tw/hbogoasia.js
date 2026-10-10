// @id: hbogoasia
// @name: HBO Go Asia
// @description: 检测 HBO Go Asia 解锁状态
// @category: media
// @regions: tw, hk
// @tags: stream, video, movie, anime
// @priority: 33
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="解析",n="failed";function handler(){let a=fetch("https://api2.hbogoasia.com/v1/geog?lang=undefined&version=0&bundleId=www.hbogoasia.com",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});if(!a)return{text:`${t}(${r})`,background:e,status:n,error:r};if(200!==a.statusCode)return{text:"N/A",background:"92,207,230",status:"unknown"};{let r=safeParse(a.body);if(!r)return{text:`${t}(${o})`,background:e,status:n,error:o};let s=r.territory,u=r.country;return s&&u?{text:`解锁(${u})`,background:"186,230,126",status:"unlocked",region:u}:{text:`${t}`,background:e,status:n}}}module.exports=handler;

// @id: amediateka
// @name: Amediateka
// @description: 检测 Amediateka 解锁状态
// @category: media
// @regions: ru
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",a="失败",s="网络",r="failed";function handler(){let u=fetch("https://www.amediateka.ru/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return u?301===u.statusCode||302===u.statusCode?"https://www.amediateka.ru/unavailable/index.html?page=https://www.amediateka.ru/"===u.headers.location?{text:a,background:e,status:r}:{text:"N/A",background:t,status:"na"}:200===u.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:503===u.statusCode||445===u.statusCode?{text:`${a}(WAF)`,background:"253,109,20",status:"warning"}:{text:"N/A",background:t,status:"na"}:{text:`${a}(${s})`,background:e,status:r,error:s}}module.exports=handler;

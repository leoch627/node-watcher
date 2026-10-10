// @id: tlcgo
// @name: TLC GO
// @description: 检测 TLC GO 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",i="failed";function handler(){let o=fetch("https://atlas.ngtv.io/v2/locate",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","app-id":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuZXR3b3JrIjoiYWxsIiwicHJvZHVjdCI6InByaXNtIiwicGxhdGZvcm0iOiJ3ZWIiLCJhcHBJZCI6ImFsbC1wcmlzbS13ZWItNzI4aGtyIn0.4Fk4E28ffoFgCIcgNSG8xX5TP2n3PIU6c3jadumKULo"},retry:3,timeout:5e3});return o?200===o.statusCode?o.body.indexOf('"country": "US"')>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:i}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:i,error:a}}module.exports=handler;

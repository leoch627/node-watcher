// @id: kbs
// @name: KBS
// @description: 检测 KBS 的解锁状态
// @category: media
// @regions: kr
// @tags: stream, ott
// @priority: 50
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let d=fetch("https://vod.kbs.co.kr/index.html?source=episode&sname=vod&stype=vod&program_code=T2022-0690&program_id=PS-2022164275-01-000&broadcast_complete_yn=N&local_station_code=00&section_code=03",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!d||200!==d.statusCode)return{text:`${t}(${o})`,background:e,status:r,error:o};let s=d.body;return s.includes('\\"Domestic\\": true')?{text:"解锁",background:"186,230,126",status:"unlocked"}:s.includes(">새로고침<")?{text:t,background:e,status:r}:{text:"未知",background:"92,207,230",status:"unknown"}}module.exports=handler;

// @id: catchplay
// @name: CatchPlay+
// @description: 检测 CatchPlay+ 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, movie
// @priority: 39
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="状态",a="解析",s="failed";function handler(){let u=fetch("https://sunapi.catchplay.com/geo",{method:"GET",headers:{authorization:"Basic NTQ3MzM0NDgtYTU3Yi00MjU2LWE4MTEtMzdlYzNkNjJmM2E0Ok90QzR3elJRR2hLQ01sSDc2VEoy","user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});if(!u)return{text:`${e}(${r})`,background:t,status:s,error:r};if(200!==u.statusCode)return{text:`${e}(${u.statusCode})`,background:t,status:s};{let r=safeParse(u.body);if(!r)return{text:`${e}(${a})`,background:t,status:s,error:a};let n=r.code;if("100016"===n)return{text:e,background:t,status:s};let d=get(r,"data.isoCode");return d?{text:`解锁(${d})`,background:"186,230,126",status:"unlocked",region:d}:{text:`${e}(${n||o})`,background:t,status:s,error:n||o}}}module.exports=handler;

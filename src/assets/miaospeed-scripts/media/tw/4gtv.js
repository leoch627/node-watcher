// @id: 4gtv
// @name: 4GTV
// @description: 检测 4GTV 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, live
// @priority: 35
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let a=fetch("https://api2.4gtv.tv/Vod/GetVodUrl3",{method:"POST",body:"value=D33jXJ0JVFkBqV%2BZSi1mhPltbejAbPYbDnyI9hmfqjKaQwRQdj7ZKZRAdb16%2FRUrE8vGXLFfNKBLKJv%2BfDSiD%2BZJlUa5Msps2P4IWuTrUP1%2BCnS255YfRadf%2BKLUhIPj",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});return a&&200===a.statusCode?safeParse(a.body).Success?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:r}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;

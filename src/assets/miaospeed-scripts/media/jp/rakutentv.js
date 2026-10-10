// @id: rakutentv-jp
// @name: 楽天TV
// @description: 检测 楽天TV(Rakuten TV) 日本站解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",o="failed";function handler(){let r=fetch("https://api.tv.rakuten.co.jp/content/playinfo.json?content_id=476611&device_id=14&trailer=1&auth=0&log=0&serial_code=&tmp_eng_flag=1&multi_audio_support=1",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Origin:"https://tv.rakuten.co.jp",Referer:"https://tv.rakuten.co.jp/"},retry:3,timeout:5e3});return r?200===r.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===r.statusCode?{text:e,background:t,status:o}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:o,error:a}}module.exports=handler;

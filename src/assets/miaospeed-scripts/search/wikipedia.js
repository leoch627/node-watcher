// @id: wikipedia
// @name: Wikipedia 编辑权限
// @description: 检测 Wikipedia 编辑权限是否已解锁
// @category: search
// @regions: global
// @tags: scholar
// @priority: 12
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="限流",a="failed";function handler(){var n=fetch("https://zh.wikipedia.org/w/index.php?title=Wikipedia%3A%E6%B2%99%E7%9B%92&action=edit",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});return n?n.body.indexOf("Banned")>-1?{text:"阻止",background:t,status:a}:200===n.statusCode?{text:"允许",background:"186,230,126",status:"unlocked"}:429===n.statusCode?{text:`失败(${e})`,background:t,status:a,error:e}:{text:"未知",background:"92,207,230",status:"unknown"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;

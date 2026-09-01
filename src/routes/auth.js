const express = require('express');
const authService = require('../services/auth');

const router = express.Router();

router.get('/session', (req, res) => {
  const authenticated = authService.isAuthenticated(req);
  res.status(authenticated ? 200 : 401).json({
    success: authenticated,
    authenticated,
    authEnabled: authService.enabled,
    username: authenticated && authService.enabled ? authService.username : null
  });
});

router.post('/login', (req, res) => {
  const result = authService.authenticate(req.body?.username, req.body?.password, req.ip);
  if (!result.ok) {
    return res.status(result.blocked ? 429 : 401).json({
      success: false,
      error: result.blocked ? '登录尝试过多，请稍后再试' : '用户名或密码错误'
    });
  }
  if (authService.enabled) {
    authService.setSessionCookie(res, authService.createToken(), authService.cookieSecure || req.secure);
  }
  return res.json({ success: true, username: authService.enabled ? authService.username : null });
});

router.post('/logout', (req, res) => {
  authService.clearSessionCookie(res, authService.cookieSecure || req.secure);
  res.json({ success: true });
});

module.exports = router;

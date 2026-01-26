const express = require('express');
const router = express.Router();
const config = require('../utils/config');

// Get all manual nodes
router.get('/', (req, res) => {
  try {
    const cfg = config.getConfig();
    res.json({
      success: true,
      nodes: cfg.manualNodes || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add manual node
router.post('/', (req, res) => {
  try {
    const { name, protocol, address, port, enabled } = req.body;

    if (!name || !protocol || !address || !port) {
      return res.status(400).json({
        success: false,
        error: 'Name, protocol, address, and port are required'
      });
    }

    // Validate protocol
    const validProtocols = ['vmess', 'vless', 'trojan', 'shadowsocks', 'http', 'https', 'socks5'];
    if (!validProtocols.includes(protocol.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid protocol. Supported: ' + validProtocols.join(', ')
      });
    }

    // Validate port
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Invalid port number'
      });
    }

    config.addManualNode({
      name,
      protocol: protocol.toLowerCase(),
      address,
      port: portNum,
      enabled: enabled !== false
    });

    res.json({
      success: true,
      message: 'Manual node added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update manual node
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate port if provided
    if (updates.port) {
      const portNum = parseInt(updates.port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({
          success: false,
          error: 'Invalid port number'
        });
      }
      updates.port = portNum;
    }

    // Validate protocol if provided
    if (updates.protocol) {
      const validProtocols = ['vmess', 'vless', 'trojan', 'shadowsocks', 'http', 'https', 'socks5'];
      if (!validProtocols.includes(updates.protocol.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid protocol'
        });
      }
      updates.protocol = updates.protocol.toLowerCase();
    }

    const success = config.updateManualNode(id, updates);

    if (success) {
      res.json({
        success: true,
        message: 'Manual node updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete manual node
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = config.removeManualNode(id);

    if (success) {
      res.json({
        success: true,
        message: 'Manual node removed successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

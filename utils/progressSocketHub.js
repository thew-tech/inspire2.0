const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let websocketServer = null;
const userConnections = new Map();

const addConnection = (userId, socket) => {
  const userKey = String(userId || '').trim();
  if (!userKey) return;

  if (!userConnections.has(userKey)) {
    userConnections.set(userKey, new Set());
  }

  userConnections.get(userKey).add(socket);
};

const removeConnection = (userId, socket) => {
  const userKey = String(userId || '').trim();
  if (!userKey) return;

  const sockets = userConnections.get(userKey);
  if (!sockets) return;

  sockets.delete(socket);
  if (sockets.size === 0) {
    userConnections.delete(userKey);
  }
};

const safeSend = (socket, payload) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    // Avoid throwing from socket broadcast paths.
    console.error('Progress socket send failed:', error.message);
  }
};

const extractTokenFromUpgradeRequest = (request) => {
  const url = request?.url || '';
  const queryString = url.includes('?') ? url.split('?')[1] : '';
  const params = new URLSearchParams(queryString);

  const tokenFromQuery = params.get('token');
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  const authHeader = request?.headers?.authorization || request?.headers?.Authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return '';
};

const initializeProgressSocketServer = (httpServer) => {
  if (websocketServer) {
    return websocketServer;
  }

  websocketServer = new WebSocket.Server({
    server: httpServer,
    path: '/ws/progress',
  });

  websocketServer.on('connection', (socket, request) => {
    const token = extractTokenFromUpgradeRequest(request);

    if (!token) {
      socket.close(1008, 'Missing auth token');
      return;
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      socket.close(1008, 'Invalid auth token');
      return;
    }

    const userId = String(decodedToken?.id || '').trim();
    if (!userId) {
      socket.close(1008, 'Invalid auth payload');
      return;
    }

    socket.userId = userId;
    addConnection(userId, socket);

    const activeConnectionsForUser = userConnections.get(userId)?.size || 1;
    console.log(`[ProgressSocket] Socket connected for user ${userId} (active: ${activeConnectionsForUser})`);

    safeSend(socket, {
      type: 'progress.connected',
      data: {
        userId,
        timestamp: new Date().toISOString(),
      },
    });

    socket.on('close', () => {
      removeConnection(userId, socket);
    });

    socket.on('error', () => {
      removeConnection(userId, socket);
    });
  });

  return websocketServer;
};

const broadcastProgressUpdate = ({
  userId,
  propertyId,
  buildingId,
  inspectionType,
  responses,
  updatedAt,
}) => {
  const userKey = String(userId || '').trim();
  if (!userKey) return;

  const sockets = userConnections.get(userKey);
  if (!sockets || sockets.size === 0) return;

  const payload = {
    type: 'progress.updated',
    data: {
      propertyId: String(propertyId || ''),
      buildingId: String(buildingId || ''),
      inspectionType: String(inspectionType || ''),
      responses: responses && typeof responses === 'object' ? responses : {},
      updatedAt: updatedAt || new Date().toISOString(),
    },
  };

  sockets.forEach((socket) => {
    safeSend(socket, payload);
  });
};

module.exports = {
  initializeProgressSocketServer,
  broadcastProgressUpdate,
};

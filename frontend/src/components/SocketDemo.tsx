import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

const SocketDemo: React.FC = () => {
  const [userId, setUserId] = useState('user-' + Math.random().toString(36).substr(2, 9));
  const [userRole, setUserRole] = useState('student');
  const [roomId, setRoomId] = useState('general');
  const [message, setMessage] = useState('');
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);

  const socket = useSocket({
    autoConnect: false, // Manual connection for demo
  });

  // Log connection events
  useEffect(() => {
    const addLog = (message: string) => {
      setConnectionLogs(prev => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${message}`]);
    };

    addLog(`Component mounted. User ID: ${userId}`);

    // Listen to socket events
    socket.on('authenticated', (data: any) => {
      addLog(`Authentication: ${data.success ? 'Success' : 'Failed'} - ${JSON.stringify(data)}`);
    });

    socket.on('room-joined', (data: any) => {
      addLog(`Joined room: ${data.roomId}`);
    });

    socket.on('room-left', (data: any) => {
      addLog(`Left room: ${data.roomId}`);
    });

    socket.on('user-joined', (data: any) => {
      addLog(`User joined: ${data.userId} (${data.socketId})`);
    });

    socket.on('user-left', (data: any) => {
      addLog(`User left: ${data.userId} (${data.socketId})`);
    });

    socket.on('new-message', (data: any) => {
      addLog(`New message from ${data.userId}: ${data.message}`);
    });

    socket.on('message-sent', (data: any) => {
      addLog(`Message sent: ${data.message}`);
    });

    socket.on('user-typing', (data: any) => {
      addLog(`${data.userId} is ${data.isTyping ? 'typing...' : 'stopped typing'}`);
    });

    socket.on('student-progress', (data: any) => {
      addLog(`Progress update: ${data.userId} - ${data.progress}% (Course: ${data.courseId})`);
    });

    socket.on('user-disconnected', (data: any) => {
      addLog(`User disconnected: ${data.userId} (${data.reason})`);
    });

    return () => {
      socket.off('authenticated');
      socket.off('room-joined');
      socket.off('room-left');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('new-message');
      socket.off('message-sent');
      socket.off('user-typing');
      socket.off('student-progress');
      socket.off('user-disconnected');
    };
  }, [userId, socket]);

  const handleConnect = () => {
    socket.connect();
  };

  const handleDisconnect = () => {
    socket.disconnect();
  };

  const handleAuthenticate = () => {
    socket.authenticate(userId, userRole);
  };

  const handleJoinRoom = () => {
    socket.joinRoom(roomId);
  };

  const handleLeaveRoom = () => {
    socket.leaveRoom(roomId);
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      socket.sendMessage(roomId, message);
      setMessage('');
    }
  };

  const handleSendProgress = () => {
    const progress = Math.floor(Math.random() * 100);
    socket.updateProgress('course-101', progress, 'lesson-1');
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '2rem auto', 
      padding: '2rem',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h2>🔌 Socket.io Real-time Communication Demo</h2>
      
      {/* Connection Status */}
      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: socket.stats.connected ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
        <strong>Status:</strong> {socket.stats.connected ? '🟢 Connected' : '🔴 Disconnected'}
        {socket.stats.connected && (
          <>
            <br />
            <strong>Socket ID:</strong> {socket.stats.connectionId}
            <br />
            <strong>Authenticated:</strong> {socket.stats.authenticated ? '✅ Yes' : '❌ No'}
            {socket.stats.authenticated && (
              <>
                <br />
                <strong>User:</strong> {socket.stats.userId} ({socket.stats.userRole})
              </>
            )}
          </>
        )}
      </div>

      {/* Connection Controls */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Connection Controls</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button onClick={handleConnect} disabled={socket.stats.connected}>
            Connect
          </button>
          <button onClick={handleDisconnect} disabled={!socket.stats.connected}>
            Disconnect
          </button>
          <button onClick={handleAuthenticate} disabled={!socket.stats.connected || socket.stats.authenticated}>
            Authenticate
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label>User ID:</label>
          <input 
            type="text" 
            value={userId} 
            onChange={(e) => setUserId(e.target.value)}
            style={{ padding: '0.25rem' }}
          />
          <label>Role:</label>
          <select 
            value={userRole} 
            onChange={(e) => setUserRole(e.target.value)}
            style={{ padding: '0.25rem' }}
          >
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Room Controls */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Room Controls</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label>Room ID:</label>
          <input 
            type="text" 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)}
            style={{ padding: '0.25rem' }}
          />
          <button onClick={handleJoinRoom} disabled={!socket.stats.authenticated}>
            Join Room
          </button>
          <button onClick={handleLeaveRoom} disabled={!socket.stats.authenticated}>
            Leave Room
          </button>
        </div>
      </div>

      {/* Messaging */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Messaging</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <input 
            type="text" 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            style={{ padding: '0.25rem', flex: 1 }}
          />
          <button onClick={handleSendMessage} disabled={!socket.stats.authenticated || !message.trim()}>
            Send Message
          </button>
        </div>
      </div>

      {/* Educational Features */}
      <div style={{ marginBottom: '1rem' }}>
        <h3>Educational Features</h3>
        <button onClick={handleSendProgress} disabled={!socket.stats.authenticated}>
          Send Random Progress Update
        </button>
      </div>

      {/* Messages Display */}
      {socket.messages.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h3>Received Messages</h3>
          <div style={{ 
            maxHeight: '200px', 
            overflowY: 'auto', 
            backgroundColor: 'white', 
            padding: '1rem', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            {socket.messages.map((msg, index) => (
              <div key={index} style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <strong>{msg.userId}:</strong> {msg.message}
                <span style={{ color: '#666', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connection Logs */}
      <div>
        <h3>Connection Logs</h3>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto', 
          backgroundColor: 'black', 
          color: '#00ff00', 
          padding: '1rem', 
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.8rem'
        }}>
          {connectionLogs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SocketDemo;
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
export interface AuthenticatedSocket extends Socket {
    userId?: string;
    userRole?: string;
}
declare let io: SocketIOServer;
export declare const initializeSocketIO: (httpServer: HTTPServer) => SocketIOServer;
export declare const socketUtils: {
    emitToUser: (userId: string, event: string, data: any) => Promise<void>;
    emitToRole: (role: string, event: string, data: any) => void;
    emitToRoom: (roomId: string, event: string, data: any) => void;
    broadcast: (event: string, data: any) => void;
    getConnectedUsers: () => Promise<number>;
};
export { io };
export default initializeSocketIO;

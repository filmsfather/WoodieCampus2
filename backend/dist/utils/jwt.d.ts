export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
    isVerified: boolean;
}
export interface RefreshTokenPayload {
    userId: string;
    tokenType: 'refresh';
}
export declare const generateAccessToken: (payload: TokenPayload) => string;
export declare const generateRefreshToken: (userId: string) => string;
export declare const verifyAccessToken: (token: string) => TokenPayload;
export declare const verifyRefreshToken: (token: string) => RefreshTokenPayload;
export declare const decodeToken: (token: string) => any;
export declare const generateTokenPair: (payload: TokenPayload) => {
    accessToken: string;
    refreshToken: string;
};
export declare const extractTokenFromHeader: (authHeader: string) => string | null;
declare const _default: {
    generateAccessToken: (payload: TokenPayload) => string;
    generateRefreshToken: (userId: string) => string;
    verifyAccessToken: (token: string) => TokenPayload;
    verifyRefreshToken: (token: string) => RefreshTokenPayload;
    decodeToken: (token: string) => any;
    generateTokenPair: (payload: TokenPayload) => {
        accessToken: string;
        refreshToken: string;
    };
    extractTokenFromHeader: (authHeader: string) => string | null;
};
export default _default;
